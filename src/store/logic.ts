/**
 * Business transactions. Every function mutates a DB *draft* and returns a Result.
 * The store runs each one inside an immer `produce` and only commits when `ok` is true,
 * so a failed validation never leaves half-applied changes. Status guards make every
 * transition idempotent: approving an approved GRN, completing a completed delivery or
 * re-posting the same payment returns an error instead of double-counting.
 */
import type {
  Batch, DayKey, DB, Delivery, DeliveryLine, GRNLine, ID, Invoice, Payment, PaymentAllocation, PaymentMethod, POLine, PurchaseOrder,
  Result, SalesLine, Settlement, SettlementStatus, Shipment, ShipmentStatus, StockMoveType, VanMoveType, AppNotification, Customer,
} from '@/types'
import { round2, shiftDay } from '@/lib/format'
import {
  computeSettlement, customerOutstanding, fefoBatches, invoiceBalance, invoiceStatusFor, invoiceTotals, sellableStock, vanStockByProduct,
} from './derive'

export interface Ctx {
  user: string
  today: DayKey
  /** ISO timestamp used for createdAt; the seed passes simulated times */
  now: string
}

const fail = (error: string, code?: string): Result<any> => ({ ok: false, error, code })
const EPS = 0.001

export function uid(db: DB, prefix: string) {
  db.counters.id = (db.counters.id ?? 0) + 1
  return `${prefix}_${db.counters.id.toString(36)}`
}
export function nextNo(db: DB, key: string, prefix: string, year: string, pad = 5) {
  db.counters[key] = (db.counters[key] ?? 0) + 1
  return `${prefix}-${year}-${String(db.counters[key]).padStart(pad, '0')}`
}
const yr = (d: DayKey) => d.slice(0, 4)
const P = (db: DB, id: ID) => db.products.find((p) => p.id === id)
const pname = (db: DB, id: ID) => P(db, id)?.name ?? id

export function notify(db: DB, ctx: Ctx, n: Omit<AppNotification, 'id' | 'at' | 'read'>) {
  db.notifications.unshift({ ...n, id: uid(db, 'ntf'), at: ctx.now, read: false })
  if (db.notifications.length > 120) db.notifications.length = 120
}
export function log(db: DB, ctx: Ctx, action: string, ref: string) {
  db.activity.unshift({ id: uid(db, 'act'), at: ctx.now, user: ctx.user, action, ref })
  if (db.activity.length > 300) db.activity.length = 300
}

// ───────────────────────── masters ─────────────────────────
type Collection = 'products' | 'suppliers' | 'customers' | 'drivers' | 'vehicles' | 'warehouses'
export function upsertMaster<T extends { id: ID }>(db: DB, ctx: Ctx, coll: Collection, item: Omit<T, 'id'> & { id?: ID }, prefix: string): Result {
  const list = db[coll] as unknown as T[]
  if (item.id) {
    const i = list.findIndex((x) => x.id === item.id)
    if (i < 0) return fail('Record not found')
    list[i] = { ...list[i], ...item } as T
    log(db, ctx, `Updated ${coll.slice(0, -1)}`, (item as any).name ?? (item as any).plateNo ?? item.id)
    return { ok: true, id: item.id }
  }
  const id = uid(db, prefix)
  list.push({ ...(item as object), id } as T)
  log(db, ctx, `Created ${coll.slice(0, -1)}`, (item as any).name ?? (item as any).plateNo ?? id)
  return { ok: true, id }
}

/** keep driver ↔ vehicle assignment symmetric */
export function assignVehicle(db: DB, ctx: Ctx, driverId: ID, vehicleId: ID | undefined): Result {
  const d = db.drivers.find((x) => x.id === driverId)
  if (!d) return fail('Driver not found')
  if (vehicleId) {
    const v = db.vehicles.find((x) => x.id === vehicleId)
    if (!v) return fail('Vehicle not found')
    if (v.status !== 'active') return fail(`Vehicle ${v.plateNo} is not active`)
    const prev = db.drivers.find((x) => x.vehicleId === vehicleId && x.id !== driverId)
    if (prev) prev.vehicleId = undefined
    for (const ov of db.vehicles) if (ov.driverId === driverId) ov.driverId = undefined
    v.driverId = driverId
  } else for (const ov of db.vehicles) if (ov.driverId === driverId) ov.driverId = undefined
  d.vehicleId = vehicleId
  log(db, ctx, 'Assigned vehicle', d.name)
  return { ok: true, id: driverId }
}

// ───────────────────────── purchasing ─────────────────────────
export interface POInput {
  supplierId: ID
  kind: 'local' | 'import'
  date: DayKey
  expectedDate: DayKey
  warehouseId: ID
  currency: PurchaseOrder['currency']
  fxRate: number
  lines: Omit<POLine, 'receivedKg'>[]
  notes?: string
  submit?: boolean
}
export function createPO(db: DB, ctx: Ctx, input: POInput, id?: ID): Result {
  if (!db.suppliers.find((s) => s.id === input.supplierId)) return fail('Select a supplier')
  const lines = input.lines.filter((l) => l.productId && l.qtyKg > 0)
  if (!lines.length) return fail('Add at least one product line with quantity')
  if (lines.some((l) => l.rate <= 0)) return fail('Every line needs a purchase rate')
  if (input.fxRate <= 0) return fail('Exchange rate must be positive')
  const totalFx = round2(lines.reduce((s, l) => s + l.qtyKg * l.rate, 0))
  const data = {
    ...input,
    lines: lines.map((l) => ({ ...l, receivedKg: 0 })),
    totalFx,
    totalSAR: round2(totalFx * input.fxRate),
    status: (input.submit === false ? 'draft' : 'pending_approval') as PurchaseOrder['status'],
  }
  delete (data as any).submit
  if (id) {
    const po = db.purchaseOrders.find((p) => p.id === id)
    if (!po) return fail('PO not found')
    if (!['draft', 'pending_approval', 'rejected'].includes(po.status)) return fail('Only draft / pending POs can be edited')
    Object.assign(po, data, { rejectReason: undefined })
    log(db, ctx, 'Edited PO', po.poNo)
    return { ok: true, id }
  }
  const po: PurchaseOrder = { ...data, id: uid(db, 'po'), poNo: nextNo(db, 'po', 'PO', yr(input.date), 4), paidSAR: 0, paymentStatus: 'unpaid', createdAt: ctx.now }
  db.purchaseOrders.push(po)
  log(db, ctx, 'Created PO', po.poNo)
  if (po.status === 'pending_approval')
    notify(db, ctx, { audience: 'admin', kind: 'info', title: 'PO awaiting approval', body: `${po.poNo} · SAR ${po.totalSAR.toLocaleString('en')}`, link: '/purchases?tab=orders' })
  return { ok: true, id: po.id }
}
export function setPOStatus(db: DB, ctx: Ctx, id: ID, action: 'submit' | 'approve' | 'reject' | 'cancel', reason?: string): Result {
  const po = db.purchaseOrders.find((p) => p.id === id)
  if (!po) return fail('PO not found')
  if (action === 'submit') {
    if (po.status !== 'draft' && po.status !== 'rejected') return fail('Only draft POs can be submitted')
    po.status = 'pending_approval'
  } else if (action === 'approve') {
    if (po.status !== 'pending_approval') return fail(`PO is already ${po.status.replace('_', ' ')}`)
    po.status = 'approved'
    po.approvedBy = ctx.user
    po.approvedAt = ctx.now
  } else if (action === 'reject') {
    if (po.status !== 'pending_approval') return fail('Only pending POs can be rejected')
    if (!reason?.trim()) return fail('Enter a rejection reason')
    po.status = 'rejected'
    po.rejectReason = reason
  } else {
    if (po.lines.some((l) => l.receivedKg > 0)) return fail('PO has received goods and cannot be cancelled')
    if (po.paidSAR > 0) return fail('PO has supplier payments and cannot be cancelled')
    po.status = 'cancelled'
  }
  log(db, ctx, `PO ${action}`, po.poNo)
  return { ok: true, id }
}
export function paySupplier(db: DB, ctx: Ctx, input: { poId: ID; amountSAR: number; method: 'bank' | 'cash' | 'lc'; date: DayKey; reference?: string }): Result {
  const po = db.purchaseOrders.find((p) => p.id === input.poId)
  if (!po) return fail('PO not found')
  if (!['approved', 'partially_received', 'received'].includes(po.status)) return fail('Only approved POs can be paid')
  const due = round2(po.totalSAR - po.paidSAR)
  if (input.amountSAR <= 0) return fail('Amount must be greater than zero')
  if (input.amountSAR > due + EPS) return fail(`Amount exceeds balance due (SAR ${due.toLocaleString('en')})`)
  if (input.reference && db.supplierPayments.some((p) => p.reference === input.reference && p.supplierId === po.supplierId))
    return fail('A payment with this reference is already recorded', 'DUPLICATE')
  po.paidSAR = round2(po.paidSAR + input.amountSAR)
  po.paymentStatus = po.paidSAR >= po.totalSAR - EPS ? 'paid' : 'partial'
  const id = uid(db, 'spay')
  db.supplierPayments.push({ id, refNo: nextNo(db, 'spay', 'SPV', yr(input.date), 4), supplierId: po.supplierId, poId: po.id, date: input.date, amountSAR: round2(input.amountSAR), method: input.method, reference: input.reference })
  log(db, ctx, 'Supplier payment', po.poNo)
  return { ok: true, id }
}

// ───────────────────────── imports ─────────────────────────
export function createShipment(db: DB, ctx: Ctx, input: Omit<Shipment, 'id' | 'ref' | 'events' | 'status' | 'goodsValueSAR' | 'lines'> & { status?: ShipmentStatus }): Result {
  const po = db.purchaseOrders.find((p) => p.id === input.poId)
  if (!po) return fail('Select a purchase order')
  if (po.kind !== 'import') return fail('Shipments can only be created for import POs')
  if (db.shipments.some((s) => s.poId === po.id)) return fail('This PO already has a shipment')
  if (!input.containerNo.trim()) return fail('Container number is required')
  if (input.eta < input.shipDate) return fail('Expected arrival must be after the shipment date')
  const status = input.status ?? 'booked'
  const s: Shipment = {
    ...input,
    id: uid(db, 'shp'),
    ref: nextNo(db, 'shp', 'IMP', yr(input.shipDate), 4),
    supplierId: po.supplierId,
    lines: po.lines.map((l) => ({ productId: l.productId, qtyKg: l.qtyKg, cartons: l.cartons })),
    goodsValueSAR: po.totalSAR,
    status,
    events: [{ status: 'booked', at: input.shipDate, note: 'Booking confirmed' }],
  }
  db.shipments.push(s)
  log(db, ctx, 'Created import shipment', s.ref)
  return { ok: true, id: s.id }
}
export function advanceShipment(db: DB, ctx: Ctx, id: ID, status: ShipmentStatus, at: DayKey, note?: string): Result {
  const s = db.shipments.find((x) => x.id === id)
  if (!s) return fail('Shipment not found')
  const order: ShipmentStatus[] = ['booked', 'in_transit', 'arrived_port', 'customs_clearance', 'cleared', 'delivered']
  if (order.indexOf(status) <= order.indexOf(s.status)) return fail('Shipment is already at or past this stage')
  if (status === 'delivered' && !db.grns.some((g) => g.shipmentId === s.id && g.status !== 'rejected'))
    return fail('Create a GRN for this shipment to mark it delivered to the warehouse')
  s.status = status
  s.events.push({ status, at, note })
  log(db, ctx, `Shipment ${status.replace('_', ' ')}`, s.ref)
  return { ok: true, id }
}
export const landedCost = (s: Shipment) => {
  const kg = s.lines.reduce((t, l) => t + l.qtyKg, 0)
  const total = s.goodsValueSAR + s.freightSAR + s.customsSAR + s.clearanceSAR
  return { kg, total: round2(total), perKg: kg ? round2(total / kg) : 0, extraPerKg: kg ? round2((s.freightSAR + s.customsSAR + s.clearanceSAR) / kg) : 0 }
}

// ───────────────────────── GRN ─────────────────────────
export interface GRNInput {
  poId: ID
  warehouseId: ID
  receivedDate: DayKey
  receivedBy: string
  vehicleTempC?: number
  lines: Omit<GRNLine, 'acceptedKg' | 'rejectedKg' | 'unitCostSAR'>[]
}
export function createGRN(db: DB, ctx: Ctx, input: GRNInput): Result {
  const po = db.purchaseOrders.find((p) => p.id === input.poId)
  if (!po) return fail('Select a purchase reference')
  if (!['approved', 'partially_received'].includes(po.status)) return fail('Goods can only be received against an approved PO')
  const lines = input.lines.filter((l) => l.receivedKg > 0)
  if (!lines.length) return fail('Enter received quantity for at least one product')
  for (const l of lines) {
    const pl = po.lines.find((x) => x.productId === l.productId)
    if (!pl) return fail(`${pname(db, l.productId)} is not on ${po.poNo}`)
    const pendingOnOtherGrns = db.grns
      .filter((g) => g.poId === po.id && g.status !== 'approved' && g.status !== 'rejected')
      .reduce((s, g) => s + (g.lines.find((x) => x.productId === l.productId)?.receivedKg ?? 0), 0)
    const open = pl.qtyKg * 1.02 - pl.receivedKg - pendingOnOtherGrns // 2% weight tolerance
    if (l.receivedKg > open + EPS) return fail(`${pname(db, l.productId)}: received KG exceeds open PO quantity (${round2(Math.max(0, open))} kg)`)
    if (!l.batchNo.trim()) return fail(`Batch number required for ${pname(db, l.productId)}`)
    if (!l.expiryDate) return fail(`Expiry date required for ${pname(db, l.productId)}`)
    if (l.expiryDate <= input.receivedDate) return fail(`${pname(db, l.productId)} is already expired on arrival`)
  }
  const shipment = db.shipments.find((s) => s.poId === po.id)
  const extraPerKg = shipment ? landedCost(shipment).extraPerKg : 0
  const id = uid(db, 'grn')
  db.grns.push({
    id,
    grnNo: nextNo(db, 'grn', 'GRN', yr(input.receivedDate), 4),
    poId: po.id,
    shipmentId: shipment?.id,
    supplierId: po.supplierId,
    warehouseId: input.warehouseId,
    receivedDate: input.receivedDate,
    receivedBy: input.receivedBy,
    vehicleTempC: input.vehicleTempC,
    lines: lines.map((l) => {
      const rate = po.lines.find((x) => x.productId === l.productId)!.rate
      return { ...l, acceptedKg: l.receivedKg, rejectedKg: 0, unitCostSAR: round2(rate * po.fxRate + extraPerKg) }
    }),
    status: 'received',
    createdAt: ctx.now,
  })
  log(db, ctx, 'Goods received', db.grns[db.grns.length - 1].grnNo)
  return { ok: true, id }
}
export function qcGRN(db: DB, ctx: Ctx, id: ID, lines: { productId: ID; acceptedKg: number; rejectReason?: string }[], notes: string): Result {
  const g = db.grns.find((x) => x.id === id)
  if (!g) return fail('GRN not found')
  if (g.status !== 'received') return fail(`Quality check already done (${g.status.replace('_', ' ')})`)
  for (const l of g.lines) {
    const q = lines.find((x) => x.productId === l.productId)
    const acc = q ? q.acceptedKg : l.receivedKg
    if (acc < 0 || acc > l.receivedKg + EPS) return fail(`${pname(db, l.productId)}: accepted KG must be between 0 and received KG`)
    if (acc < l.receivedKg - EPS && !q?.rejectReason?.trim()) return fail(`${pname(db, l.productId)}: give a reason for the rejected quantity`)
  }
  for (const l of g.lines) {
    const q = lines.find((x) => x.productId === l.productId)
    l.acceptedKg = round2(q ? q.acceptedKg : l.receivedKg)
    l.rejectedKg = round2(l.receivedKg - l.acceptedKg)
    l.rejectReason = l.rejectedKg > 0 ? q?.rejectReason : undefined
  }
  g.status = 'qc_passed'
  g.qcBy = ctx.user
  g.qcNotes = notes
  log(db, ctx, 'GRN quality check passed', g.grnNo)
  notify(db, ctx, { audience: 'admin', kind: 'info', title: 'GRN ready for approval', body: `${g.grnNo} passed quality check`, link: '/grn' })
  return { ok: true, id }
}
export function approveGRN(db: DB, ctx: Ctx, id: ID): Result {
  const g = db.grns.find((x) => x.id === id)
  if (!g) return fail('GRN not found')
  if (g.status === 'approved') return fail('GRN is already approved - stock was posted once', 'ALREADY')
  if (g.status !== 'qc_passed') return fail('Complete the quality check before approval')
  const po = db.purchaseOrders.find((p) => p.id === g.poId)!
  for (const l of g.lines) {
    if (l.acceptedKg <= 0) continue
    const bid = uid(db, 'bat')
    const b: Batch = { id: bid, batchNo: l.batchNo, productId: l.productId, warehouseId: g.warehouseId, qtyKg: l.acceptedKg, initialKg: l.acceptedKg, unitCost: l.unitCostSAR, receivedDate: g.receivedDate, expiryDate: l.expiryDate, grnId: g.id }
    db.batches.push(b)
    move(db, ctx, g.receivedDate, 'grn_in', l.productId, g.warehouseId, bid, l.acceptedKg, g.grnNo)
    const pl = po.lines.find((x) => x.productId === l.productId)
    if (pl) pl.receivedKg = round2(pl.receivedKg + l.receivedKg)
    const prod = P(db, l.productId)
    if (prod) prod.costPrice = l.unitCostSAR
  }
  po.status = po.lines.every((l) => l.receivedKg >= l.qtyKg * 0.98) ? 'received' : 'partially_received'
  g.status = 'approved'
  g.approvedBy = ctx.user
  g.approvedAt = ctx.now
  const sh = g.shipmentId && db.shipments.find((s) => s.id === g.shipmentId)
  if (sh && sh.status !== 'delivered') {
    sh.status = 'delivered'
    sh.events.push({ status: 'delivered', at: g.receivedDate, note: `Received at warehouse · ${g.grnNo}` })
  }
  log(db, ctx, 'GRN approved · inventory updated', g.grnNo)
  return { ok: true, id }
}
export function rejectGRN(db: DB, ctx: Ctx, id: ID, reason: string): Result {
  const g = db.grns.find((x) => x.id === id)
  if (!g) return fail('GRN not found')
  if (g.status === 'approved' || g.status === 'rejected') return fail(`GRN is already ${g.status}`)
  if (!reason.trim()) return fail('Enter a rejection reason')
  g.status = 'rejected'
  g.rejectReason = reason
  for (const l of g.lines) { l.rejectedKg = l.receivedKg; l.acceptedKg = 0 }
  log(db, ctx, 'GRN rejected', g.grnNo)
  return { ok: true, id }
}

// ───────────────────────── inventory ─────────────────────────
function move(db: DB, ctx: Ctx, date: DayKey, type: StockMoveType, productId: ID, warehouseId: ID, batchId: ID, qtyKg: number, ref: string, note?: string) {
  db.stockMovements.push({ id: uid(db, 'mv'), date, createdAt: ctx.now, type, productId, warehouseId, batchId, qtyKg: round2(qtyKg), ref, note })
}
/** take stock FEFO from a warehouse; caller must have validated availability */
function pick(db: DB, ctx: Ctx, date: DayKey, productId: ID, warehouseId: ID, qty: number, type: StockMoveType, ref: string) {
  let left = qty
  const used: { batchId: ID; batchNo: string; qtyKg: number }[] = []
  for (const b of fefoBatches(db, productId, warehouseId, date)) {
    if (left <= EPS) break
    const take = round2(Math.min(b.qtyKg, left))
    b.qtyKg = round2(b.qtyKg - take)
    left = round2(left - take)
    used.push({ batchId: b.id, batchNo: b.batchNo, qtyKg: take })
    move(db, ctx, date, type, productId, warehouseId, b.id, -take, ref)
  }
  return used
}
/** put stock back into a warehouse: newest unexpired batch of the product, else a new returns batch */
function putBack(db: DB, ctx: Ctx, date: DayKey, productId: ID, warehouseId: ID, qty: number, type: StockMoveType, ref: string) {
  const b = db.batches
    .filter((x) => x.productId === productId && x.warehouseId === warehouseId && x.expiryDate >= date)
    .sort((a, b2) => b2.expiryDate.localeCompare(a.expiryDate))[0]
  let target = b
  if (!target) {
    const p = P(db, productId)!
    target = { id: uid(db, 'bat'), batchNo: `RET-${date.replace(/-/g, '')}`, productId, warehouseId, qtyKg: 0, initialKg: qty, unitCost: p.costPrice, receivedDate: date, expiryDate: shiftDay(date, Math.min(p.shelfLifeDays, 30)) }
    db.batches.push(target)
  }
  target.qtyKg = round2(target.qtyKg + qty)
  move(db, ctx, date, type, productId, warehouseId, target.id, qty, ref)
}
function checkWarehouse(db: DB, lines: { productId: ID; qtyKg: number }[], warehouseId: ID, date: DayKey) {
  const need: Record<ID, number> = {}
  for (const l of lines) need[l.productId] = (need[l.productId] ?? 0) + l.qtyKg
  for (const [pid, q] of Object.entries(need)) {
    const avail = sellableStock(db, pid, warehouseId, date)
    if (q > avail + EPS) return `${pname(db, pid)}: only ${avail.toLocaleString('en')} kg sellable in ${db.warehouses.find((w) => w.id === warehouseId)?.name ?? 'warehouse'}`
  }
  return null
}

export function transferStock(db: DB, ctx: Ctx, input: { fromWh: ID; toWh: ID; productId: ID; qtyKg: number; date: DayKey; note?: string }): Result {
  if (input.fromWh === input.toWh) return fail('Source and destination warehouses must differ')
  if (input.qtyKg <= 0) return fail('Enter a quantity')
  const err = checkWarehouse(db, [input], input.fromWh, input.date)
  if (err) return fail(err)
  const ref = nextNo(db, 'trf', 'TRF', yr(input.date), 4)
  const used = pick(db, ctx, input.date, input.productId, input.fromWh, input.qtyKg, 'transfer_out', ref)
  for (const u of used) {
    const src = db.batches.find((b) => b.id === u.batchId)!
    const nb: Batch = { ...src, id: uid(db, 'bat'), warehouseId: input.toWh, qtyKg: u.qtyKg, initialKg: u.qtyKg }
    db.batches.push(nb)
    move(db, ctx, input.date, 'transfer_in', input.productId, input.toWh, nb.id, u.qtyKg, ref, input.note)
  }
  log(db, ctx, 'Warehouse transfer', ref)
  return { ok: true, id: ref }
}
export function adjustStock(db: DB, ctx: Ctx, input: { batchId: ID; qtyKg: number; type: 'damage' | 'expired'; reason: string; date: DayKey }): Result {
  const b = db.batches.find((x) => x.id === input.batchId)
  if (!b) return fail('Batch not found')
  if (input.qtyKg <= 0) return fail('Enter the quantity to write off')
  if (input.qtyKg > b.qtyKg + EPS) return fail(`Batch only has ${b.qtyKg} kg`)
  if (!input.reason.trim()) return fail('Enter a reason')
  b.qtyKg = round2(b.qtyKg - input.qtyKg)
  const ref = nextNo(db, 'adj', 'ADJ', yr(input.date), 4)
  move(db, ctx, input.date, input.type, b.productId, b.warehouseId, b.id, -input.qtyKg, ref, input.reason)
  log(db, ctx, `Stock written off (${input.type})`, `${ref} · ${b.batchNo}`)
  return { ok: true, id: ref }
}

// ───────────────────────── van loading ─────────────────────────
function vmove(db: DB, ctx: Ctx, date: DayKey, driverId: ID, vehicleId: ID, productId: ID, qty: number, type: VanMoveType, ref: string, note?: string) {
  db.vanMovements.push({ id: uid(db, 'vm'), date, createdAt: ctx.now, driverId, vehicleId, productId, qtyKg: round2(qty), type, ref, note })
}
function checkVan(db: DB, driverId: ID, lines: { productId: ID; qtyKg: number }[]) {
  const van = vanStockByProduct(db, driverId)
  const need: Record<ID, number> = {}
  for (const l of lines) need[l.productId] = (need[l.productId] ?? 0) + l.qtyKg
  for (const [pid, q] of Object.entries(need)) {
    const have = van[pid] ?? 0
    if (q > have + EPS) return `${pname(db, pid)}: only ${round2(have)} kg in the van`
  }
  return null
}
export function loadVan(db: DB, ctx: Ctx, input: { driverId: ID; vehicleId: ID; warehouseId: ID; date: DayKey; lines: { productId: ID; qtyKg: number }[] }): Result {
  const d = db.drivers.find((x) => x.id === input.driverId)
  const v = db.vehicles.find((x) => x.id === input.vehicleId)
  if (!d) return fail('Select a driver')
  if (!v) return fail('Select a vehicle')
  if (v.status !== 'active') return fail(`${v.plateNo} is under ${v.status}`)
  if (d.status !== 'on_duty') return fail(`${d.name} is not on duty`)
  const open = db.settlements.find((s) => s.driverId === d.id && s.date === input.date && s.status !== 'rejected')
  if (open) return fail(`${d.name} already submitted the settlement for this day`)
  const lines = input.lines.filter((l) => l.productId && l.qtyKg > 0)
  if (!lines.length) return fail('Add at least one product to load')
  const err = checkWarehouse(db, lines, input.warehouseId, input.date)
  if (err) return fail(err)
  const onVan = Object.values(vanStockByProduct(db, d.id)).reduce((s, x) => s + x, 0)
  const total = lines.reduce((s, l) => s + l.qtyKg, 0)
  if (onVan + total > v.capacityKg + EPS) return fail(`Exceeds ${v.plateNo} capacity (${v.capacityKg.toLocaleString('en')} kg; ${round2(onVan)} kg already on board)`)
  const slipNo = nextNo(db, 'load', 'LS', yr(input.date), 5)
  const out = lines.map((l) => {
    const batches = pick(db, ctx, input.date, l.productId, input.warehouseId, l.qtyKg, 'van_load', slipNo)
    vmove(db, ctx, input.date, d.id, v.id, l.productId, l.qtyKg, 'load', slipNo)
    return { productId: l.productId, qtyKg: round2(l.qtyKg), batches }
  })
  const id = uid(db, 'load')
  db.vanLoads.push({ id, slipNo, driverId: d.id, vehicleId: v.id, warehouseId: input.warehouseId, date: input.date, createdAt: ctx.now, lines: out, loadedBy: ctx.user })
  log(db, ctx, `Van loaded · ${round2(total)} kg`, `${slipNo} · ${d.name}`)
  notify(db, ctx, { audience: 'driver', driverId: d.id, kind: 'info', title: 'Van loaded', body: `${slipNo}: ${round2(total).toLocaleString('en')} kg loaded on ${v.plateNo}`, link: '/driver' })
  return { ok: true, id }
}
export function returnToWarehouse(db: DB, ctx: Ctx, input: { driverId: ID; warehouseId: ID; date: DayKey; lines: { productId: ID; qtyKg: number }[] }): Result {
  const d = db.drivers.find((x) => x.id === input.driverId)
  if (!d) return fail('Driver not found')
  const lines = input.lines.filter((l) => l.qtyKg > 0)
  if (!lines.length) return fail('Enter quantities to return')
  const err = checkVan(db, d.id, lines)
  if (err) return fail(err)
  const ref = nextNo(db, 'vret', 'VR', yr(input.date), 5)
  for (const l of lines) {
    vmove(db, ctx, input.date, d.id, d.vehicleId ?? '', l.productId, -l.qtyKg, 'return_wh', ref)
    putBack(db, ctx, input.date, l.productId, input.warehouseId, l.qtyKg, 'van_return', ref)
  }
  log(db, ctx, 'Van stock returned to warehouse', `${ref} · ${d.name}`)
  return { ok: true, id: ref }
}
export function recordVanLoss(db: DB, ctx: Ctx, input: { driverId: ID; productId: ID; qtyKg: number; reason: string; date: DayKey }): Result {
  const d = db.drivers.find((x) => x.id === input.driverId)
  if (!d) return fail('Driver not found')
  if (input.qtyKg <= 0) return fail('Enter loss quantity')
  if (!input.reason.trim()) return fail('Enter a reason')
  const err = checkVan(db, d.id, [input])
  if (err) return fail(err)
  const ref = nextNo(db, 'loss', 'VL', yr(input.date), 4)
  vmove(db, ctx, input.date, d.id, d.vehicleId ?? '', input.productId, -input.qtyKg, 'loss', ref, input.reason)
  db.stockLosses.push({ id: uid(db, 'loss'), ref, date: input.date, driverId: d.id, vehicleId: d.vehicleId ?? '', productId: input.productId, qtyKg: round2(input.qtyKg), reason: input.reason })
  log(db, ctx, 'Van stock loss recorded', ref)
  return { ok: true, id: ref }
}

// ───────────────────────── sales ─────────────────────────
function creditCheck(db: DB, c: Customer, addTotal: number, paymentType: 'cash' | 'credit', allowOverLimit?: boolean) {
  if (paymentType !== 'credit' || allowOverLimit) return null
  const out = customerOutstanding(db, c.id)
  if (out + addTotal > c.creditLimit + EPS)
    return `Credit limit exceeded for ${c.name}: outstanding SAR ${out.toLocaleString('en')} + this invoice SAR ${addTotal.toLocaleString('en')} > limit SAR ${c.creditLimit.toLocaleString('en')}`
  return null
}
function makeInvoice(db: DB, ctx: Ctx, c: Customer, data: Pick<Invoice, 'date' | 'source' | 'lines' | 'paymentType'> & Partial<Invoice>) {
  const vatRate = db.settings.vatRate
  const t = invoiceTotals(data.lines, vatRate)
  const inv: Invoice = {
    id: uid(db, 'inv'),
    invNo: nextNo(db, 'inv', db.settings.invoicePrefix || 'INV', yr(data.date), 5),
    customerId: c.id,
    dueDate: shiftDay(data.date, data.paymentType === 'cash' ? 0 : c.paymentTermsDays),
    vatRate,
    ...t,
    paid: 0,
    returned: 0,
    status: 'unpaid',
    createdAt: ctx.now,
    ...data,
    lines: data.lines.map((l) => ({ ...l, qtyKg: round2(l.qtyKg), price: round2(l.price) })),
  }
  db.invoices.push(inv)
  return inv
}
export interface SOInput { customerId: ID; date: DayKey; deliveryDate: DayKey; lines: SalesLine[]; paymentType: 'cash' | 'credit'; notes?: string; driverId?: ID }
export function createSalesOrder(db: DB, ctx: Ctx, input: SOInput): Result {
  const c = db.customers.find((x) => x.id === input.customerId)
  if (!c) return fail('Select a customer')
  const lines = input.lines.filter((l) => l.productId && l.qtyKg > 0)
  if (!lines.length) return fail('Add at least one product with KG')
  if (lines.some((l) => l.price <= 0)) return fail('Selling price must be greater than zero')
  if (input.deliveryDate < input.date) return fail('Delivery date cannot be before the order date')
  const id = uid(db, 'so')
  db.salesOrders.push({ ...input, lines, id, soNo: nextNo(db, 'so', 'SO', yr(input.date), 5), status: 'open', driverId: undefined, createdAt: ctx.now })
  log(db, ctx, 'Sales order created', db.salesOrders[db.salesOrders.length - 1].soNo)
  if (input.driverId) {
    const r = assignOrders(db, ctx, [id], input.driverId, input.deliveryDate)
    if (!r.ok) return r
  }
  return { ok: true, id }
}
export function assignOrders(db: DB, ctx: Ctx, soIds: ID[], driverId: ID, date: DayKey): Result {
  const d = db.drivers.find((x) => x.id === driverId)
  if (!d) return fail('Select a driver')
  if (!d.vehicleId) return fail(`${d.name} has no vehicle assigned`)
  if (db.settlements.some((s) => s.driverId === driverId && s.date === date && s.status !== 'rejected')) return fail(`${d.name}'s day is already settled`)
  let seq = db.deliveries.filter((x) => x.driverId === driverId && x.date === date).length
  for (const id of soIds) {
    const so = db.salesOrders.find((s) => s.id === id)
    if (!so) return fail('Order not found')
    if (so.status !== 'open') return fail(`${so.soNo} is already ${so.status.replace('_', ' ')}`)
  }
  for (const id of soIds) {
    const so = db.salesOrders.find((s) => s.id === id)!
    so.status = 'assigned'
    so.driverId = driverId
    db.deliveries.push({
      id: uid(db, 'dlv'),
      deliveryNo: nextNo(db, 'dlv', 'DN', yr(date), 5),
      soId: so.id,
      customerId: so.customerId,
      driverId,
      vehicleId: d.vehicleId,
      date,
      routeSeq: ++seq,
      lines: so.lines.map((l) => ({ productId: l.productId, orderedKg: l.qtyKg, deliveredKg: 0, price: l.price })),
      status: 'pending',
    })
  }
  log(db, ctx, `Assigned ${soIds.length} order(s)`, d.name)
  notify(db, ctx, { audience: 'driver', driverId, kind: 'info', title: 'New deliveries assigned', body: `${soIds.length} stop(s) added to your route`, link: '/driver' })
  return { ok: true, id: driverId }
}
export function cancelSalesOrder(db: DB, ctx: Ctx, id: ID, reason: string): Result {
  const so = db.salesOrders.find((s) => s.id === id)
  if (!so) return fail('Order not found')
  if (so.status !== 'open') return fail('Only open (unassigned) orders can be cancelled')
  if (!reason.trim()) return fail('Enter a reason')
  so.status = 'cancelled'
  so.notes = [so.notes, `Cancelled: ${reason}`].filter(Boolean).join(' · ')
  log(db, ctx, 'Sales order cancelled', so.soNo)
  return { ok: true, id }
}
export function reorderRoute(db: DB, ctx: Ctx, deliveryId: ID, dir: -1 | 1): Result {
  const dl = db.deliveries.find((x) => x.id === deliveryId)
  if (!dl) return fail('Delivery not found')
  const route = db.deliveries.filter((x) => x.driverId === dl.driverId && x.date === dl.date).sort((a, b) => a.routeSeq - b.routeSeq)
  const i = route.indexOf(dl)
  const j = i + dir
  if (j < 0 || j >= route.length) return fail('Already at the end of the route')
  const t = route[j].routeSeq
  route[j].routeSeq = dl.routeSeq
  dl.routeSeq = t
  return { ok: true, id: deliveryId }
}
export function setOutForDelivery(db: DB, ctx: Ctx, deliveryId: ID): Result {
  const dl = db.deliveries.find((x) => x.id === deliveryId)
  if (!dl) return fail('Delivery not found')
  if (dl.status !== 'pending') return fail('Delivery is not pending')
  dl.status = 'out_for_delivery'
  return { ok: true, id: deliveryId }
}
export function completeDelivery(
  db: DB, ctx: Ctx,
  input: { deliveryId: ID; lines: { productId: ID; deliveredKg: number }[]; failed?: boolean; failReason?: string; notes?: string; allowOverLimit?: boolean },
): Result<{ id?: ID; invoiceId?: ID }> {
  const dl = db.deliveries.find((x) => x.id === input.deliveryId)
  if (!dl) return fail('Delivery not found')
  if (!['pending', 'out_for_delivery'].includes(dl.status)) return fail(`Delivery is already ${dl.status}`, 'ALREADY')
  const so = db.salesOrders.find((s) => s.id === dl.soId)!
  const c = db.customers.find((x) => x.id === dl.customerId)!
  if (input.failed) {
    if (!input.failReason?.trim()) return fail('Select a reason for the failed delivery')
    dl.status = 'failed'
    dl.failReason = input.failReason
    dl.completedAt = ctx.now
    so.status = 'open' // can be re-assigned
    so.driverId = undefined
    log(db, ctx, 'Delivery failed', `${dl.deliveryNo} · ${input.failReason}`)
    notify(db, ctx, { audience: 'admin', kind: 'warning', title: 'Delivery failed', body: `${c.name}: ${input.failReason}`, link: '/distribution' })
    return { ok: true, id: dl.id }
  }
  const lines: DeliveryLine[] = dl.lines.map((l) => {
    const q = input.lines.find((x) => x.productId === l.productId)
    return { ...l, deliveredKg: round2(Math.max(0, q?.deliveredKg ?? 0)) }
  })
  if (lines.every((l) => l.deliveredKg <= 0)) return fail('Enter delivered KG, or mark the delivery as failed')
  if (lines.some((l) => l.deliveredKg > l.orderedKg * 1.05 + EPS)) return fail('Delivered KG cannot exceed ordered KG by more than 5%')
  const err = checkVan(db, dl.driverId, lines.map((l) => ({ productId: l.productId, qtyKg: l.deliveredKg })))
  if (err) return fail(err, 'NO_STOCK')
  const invLines = lines.filter((l) => l.deliveredKg > 0).map((l) => ({ productId: l.productId, qtyKg: l.deliveredKg, price: l.price }))
  const { total } = invoiceTotals(invLines, db.settings.vatRate)
  const ce = creditCheck(db, c, total, so.paymentType, input.allowOverLimit)
  if (ce) return fail(ce, 'CREDIT_LIMIT')
  const partial = lines.some((l) => l.deliveredKg < l.orderedKg - EPS)
  dl.lines = lines
  dl.status = partial ? 'partial' : 'delivered'
  dl.completedAt = ctx.now
  dl.notes = input.notes
  for (const l of invLines) vmove(db, ctx, dl.date, dl.driverId, dl.vehicleId, l.productId, -l.qtyKg, 'delivery', dl.deliveryNo)
  const inv = makeInvoice(db, ctx, c, { date: dl.date, source: 'delivery', soId: so.id, deliveryId: dl.id, driverId: dl.driverId, lines: invLines, paymentType: so.paymentType })
  dl.invoiceId = inv.id
  so.status = partial ? 'partially_delivered' : 'delivered'
  log(db, ctx, `Delivered ${partial ? '(partial)' : ''}`, `${dl.deliveryNo} → ${inv.invNo}`)
  return { ok: true, id: dl.id, invoiceId: inv.id }
}
export function vanSale(db: DB, ctx: Ctx, input: { driverId: ID; customerId: ID; date: DayKey; lines: SalesLine[]; paymentType: 'cash' | 'credit'; allowOverLimit?: boolean }): Result {
  const d = db.drivers.find((x) => x.id === input.driverId)
  const c = db.customers.find((x) => x.id === input.customerId)
  if (!d) return fail('Driver not found')
  if (!c) return fail('Select a customer')
  if (db.settlements.some((s) => s.driverId === d.id && s.date === input.date && s.status !== 'rejected')) return fail('Day already settled for this driver')
  const lines = input.lines.filter((l) => l.productId && l.qtyKg > 0)
  if (!lines.length) return fail('Add at least one product')
  if (lines.some((l) => l.price <= 0)) return fail('Enter a selling price')
  const err = checkVan(db, d.id, lines)
  if (err) return fail(err, 'NO_STOCK')
  const ce = creditCheck(db, c, invoiceTotals(lines, db.settings.vatRate).total, input.paymentType, input.allowOverLimit)
  if (ce) return fail(ce, 'CREDIT_LIMIT')
  const inv = makeInvoice(db, ctx, c, { date: input.date, source: 'van_sale', driverId: d.id, lines, paymentType: input.paymentType })
  for (const l of lines) vmove(db, ctx, input.date, d.id, d.vehicleId ?? '', l.productId, -l.qtyKg, 'van_sale', inv.invNo)
  log(db, ctx, 'Van sale', `${inv.invNo} · ${c.name}`)
  return { ok: true, id: inv.id }
}
export function directInvoice(db: DB, ctx: Ctx, input: { customerId: ID; warehouseId: ID; date: DayKey; lines: SalesLine[]; paymentType: 'cash' | 'credit'; notes?: string; allowOverLimit?: boolean }): Result {
  const c = db.customers.find((x) => x.id === input.customerId)
  if (!c) return fail('Select a customer')
  const lines = input.lines.filter((l) => l.productId && l.qtyKg > 0)
  if (!lines.length) return fail('Add at least one product')
  if (lines.some((l) => l.price <= 0)) return fail('Enter a selling price')
  const err = checkWarehouse(db, lines, input.warehouseId, input.date)
  if (err) return fail(err, 'NO_STOCK')
  const ce = creditCheck(db, c, invoiceTotals(lines, db.settings.vatRate).total, input.paymentType, input.allowOverLimit)
  if (ce) return fail(ce, 'CREDIT_LIMIT')
  const inv = makeInvoice(db, ctx, c, { date: input.date, source: 'direct', warehouseId: input.warehouseId, lines, paymentType: input.paymentType, notes: input.notes })
  for (const l of lines) pick(db, ctx, input.date, l.productId, input.warehouseId, l.qtyKg, 'direct_sale', inv.invNo)
  log(db, ctx, 'Direct invoice', `${inv.invNo} · ${c.name}`)
  return { ok: true, id: inv.id }
}
export function voidInvoice(db: DB, ctx: Ctx, id: ID, reason: string): Result {
  const inv = db.invoices.find((i) => i.id === id)
  if (!inv) return fail('Invoice not found')
  if (inv.status === 'void') return fail('Invoice is already void')
  if (inv.paid > 0 || inv.returned > 0) return fail('Invoice has payments or returns; issue a sales return instead')
  if (inv.source !== 'direct') return fail('Only direct invoices can be voided; use a sales return for delivered goods')
  if (!reason.trim()) return fail('Enter a reason')
  for (const l of inv.lines) putBack(db, ctx, inv.date, l.productId, inv.warehouseId!, l.qtyKg, 'customer_return', `${inv.invNo}-VOID`)
  inv.status = 'void'
  inv.notes = `VOID: ${reason}`
  log(db, ctx, 'Invoice voided', inv.invNo)
  return { ok: true, id }
}
export function salesReturn(
  db: DB, ctx: Ctx,
  input: { invoiceId: ID; date: DayKey; lines: { productId: ID; qtyKg: number }[]; reason: string; destination: 'van' | 'warehouse'; warehouseId?: ID; condition: 'resaleable' | 'damaged'; driverId?: ID },
): Result {
  const inv = db.invoices.find((i) => i.id === input.invoiceId)
  if (!inv) return fail('Select an invoice')
  if (inv.status === 'void') return fail('Invoice is void')
  if (!input.reason.trim()) return fail('Enter a return reason')
  const lines = input.lines.filter((l) => l.qtyKg > 0)
  if (!lines.length) return fail('Enter return quantities')
  const prior = db.salesReturns.filter((r) => r.invoiceId === inv.id)
  for (const l of lines) {
    const il = inv.lines.find((x) => x.productId === l.productId)
    if (!il) return fail(`${pname(db, l.productId)} is not on this invoice`)
    const already = prior.reduce((s, r) => s + (r.lines.find((x) => x.productId === l.productId)?.qtyKg ?? 0), 0)
    if (l.qtyKg > il.qtyKg - already + EPS) return fail(`${pname(db, l.productId)}: return exceeds invoiced KG (${round2(il.qtyKg - already)} kg returnable)`)
  }
  const driverId = input.driverId ?? inv.driverId
  if (input.destination === 'van' && !driverId) return fail('Select the driver receiving the return')
  if (input.destination === 'warehouse' && !input.warehouseId) return fail('Select a warehouse')
  const rLines = lines.map((l) => ({ productId: l.productId, qtyKg: round2(l.qtyKg), price: inv.lines.find((x) => x.productId === l.productId)!.price }))
  const amount = invoiceTotals(rLines, inv.vatRate).total
  const credit = round2(Math.min(amount, inv.total - inv.returned))
  inv.returned = round2(inv.returned + credit)
  // if the invoice was already paid, the credit note leaves an unapplied customer credit (balance floors at 0;
  // the ledger shows the credit). Payments are never rewritten, so receipts and settlements stay intact.
  inv.status = invoiceStatusFor(inv)
  const returnNo = nextNo(db, 'ret', 'SR', yr(input.date), 4)
  const driver = driverId ? db.drivers.find((d) => d.id === driverId) : undefined
  if (input.condition === 'resaleable') {
    for (const l of rLines) {
      if (input.destination === 'van' && driver) vmove(db, ctx, input.date, driver.id, driver.vehicleId ?? '', l.productId, l.qtyKg, 'customer_return', returnNo)
      else putBack(db, ctx, input.date, l.productId, input.warehouseId!, l.qtyKg, 'customer_return', returnNo)
    }
  } else if (input.destination === 'van' && driver) {
    // damaged goods ride back on the van and are written off as loss at once, so settlement still reconciles
    for (const l of rLines) {
      vmove(db, ctx, input.date, driver.id, driver.vehicleId ?? '', l.productId, l.qtyKg, 'customer_return', returnNo)
      vmove(db, ctx, input.date, driver.id, driver.vehicleId ?? '', l.productId, -l.qtyKg, 'loss', returnNo, 'Damaged customer return')
      db.stockLosses.push({ id: uid(db, 'loss'), ref: returnNo, date: input.date, driverId: driver.id, vehicleId: driver.vehicleId ?? '', productId: l.productId, qtyKg: l.qtyKg, reason: `Damaged return · ${input.reason}` })
    }
  }
  db.salesReturns.push({
    id: uid(db, 'ret'), returnNo, invoiceId: inv.id, customerId: inv.customerId, date: input.date, lines: rLines, amount: credit, reason: input.reason,
    destination: input.destination, driverId: driver?.id, vehicleId: driver?.vehicleId, warehouseId: input.warehouseId, condition: input.condition, createdAt: ctx.now,
  })
  log(db, ctx, 'Sales return', `${returnNo} · ${inv.invNo}`)
  return { ok: true, id: returnNo }
}

// ───────────────────────── collections ─────────────────────────
export interface PaymentInput {
  customerId: ID
  driverId?: ID
  date: DayKey
  method: PaymentMethod
  amount: number
  bankRef?: string
  allocations?: PaymentAllocation[] // omit = auto-allocate oldest first
  notes?: string
  idempotencyKey?: string
  /** restrict auto-allocation */
  scope?: 'all' | 'today' | 'old'
  /** counter sales: same amount twice in a row is normal (idempotency key still blocks double posting) */
  allowRepeat?: boolean
}
export function recordPayment(db: DB, ctx: Ctx, input: PaymentInput): Result {
  const c = db.customers.find((x) => x.id === input.customerId)
  if (!c) return fail('Select a customer')
  const amount = round2(input.amount)
  if (!(amount > 0)) return fail('Enter the amount collected')
  if (input.idempotencyKey && db.payments.some((p) => p.idempotencyKey === input.idempotencyKey))
    return fail('This payment was already saved', 'DUPLICATE')
  if (input.method === 'bank') {
    if (!input.bankRef?.trim()) return fail('Enter the bank transfer reference')
    if (db.payments.some((p) => p.method === 'bank' && p.bankRef?.trim().toLowerCase() === input.bankRef!.trim().toLowerCase() && p.verification !== 'rejected'))
      return fail(`Bank reference ${input.bankRef} is already recorded`, 'DUPLICATE')
  }
  const nowMs = new Date(ctx.now).getTime()
  const dupe = !input.allowRepeat && db.payments.find(
    (p) => p.customerId === c.id && p.amount === amount && p.method === input.method && p.verification !== 'rejected' && Math.abs(new Date(p.createdAt).getTime() - nowMs) < 2 * 60 * 1000,
  )
  if (dupe) return fail(`Possible duplicate: ${dupe.receiptNo} for the same amount was recorded moments ago`, 'DUPLICATE')

  const open = db.invoices
    .filter((i) => i.customerId === c.id && invoiceBalance(i) > 0)
    .filter((i) => (input.scope === 'today' ? i.date >= input.date : input.scope === 'old' ? i.date < input.date : true))
    .sort((a, b) => a.date.localeCompare(b.date) || a.invNo.localeCompare(b.invNo))
  let allocations: PaymentAllocation[]
  if (input.allocations?.length) {
    allocations = input.allocations.filter((a) => a.amount > 0).map((a) => ({ ...a, amount: round2(a.amount) }))
    const sum = round2(allocations.reduce((s, a) => s + a.amount, 0))
    if (Math.abs(sum - amount) > 0.01) return fail(`Allocated SAR ${sum.toLocaleString('en')} must equal the amount received SAR ${amount.toLocaleString('en')}`)
    for (const a of allocations) {
      const inv = db.invoices.find((i) => i.id === a.invoiceId)
      if (!inv || inv.customerId !== c.id) return fail('Allocation to an invoice of another customer')
      if (a.amount > invoiceBalance(inv) + 0.01) return fail(`${inv.invNo}: allocation exceeds balance (SAR ${invoiceBalance(inv).toLocaleString('en')})`)
    }
  } else {
    const due = round2(open.reduce((s, i) => s + invoiceBalance(i), 0))
    if (amount > due + 0.01) return fail(`Amount exceeds the open balance of SAR ${due.toLocaleString('en')}`)
    let left = amount
    allocations = []
    for (const i of open) {
      if (left <= 0.001) break
      const take = round2(Math.min(left, invoiceBalance(i)))
      allocations.push({ invoiceId: i.id, amount: take })
      left = round2(left - take)
    }
  }
  let cur = 0, old = 0
  for (const a of allocations) {
    const inv = db.invoices.find((i) => i.id === a.invoiceId)!
    inv.paid = round2(inv.paid + a.amount)
    inv.status = invoiceStatusFor(inv)
    if (inv.date >= input.date) cur += a.amount
    else old += a.amount
  }
  const id = uid(db, 'pay')
  const receiptNo = nextNo(db, 'rcpt', 'RV', yr(input.date), 5)
  db.payments.push({
    id, receiptNo, customerId: c.id, driverId: input.driverId, date: input.date, createdAt: ctx.now, method: input.method,
    bankRef: input.bankRef?.trim() || undefined, amount, allocations,
    collectionType: cur > 0 && old > 0 ? 'mixed' : old > 0 ? 'old_dues' : 'current',
    notes: input.notes, verification: input.method === 'cash' && !input.driverId ? 'verified' : 'pending', idempotencyKey: input.idempotencyKey,
  })
  log(db, ctx, `Payment received (${input.method})`, `${receiptNo} · ${c.name}`)
  return { ok: true, id }
}
export function verifyPayment(db: DB, ctx: Ctx, id: ID, decision: 'verified' | 'rejected', note?: string): Result {
  const p = db.payments.find((x) => x.id === id)
  if (!p) return fail('Payment not found')
  if (p.verification !== 'pending') return fail(`Payment is already ${p.verification}`)
  if (decision === 'rejected') {
    if (p.settlementId) {
      const s = db.settlements.find((x) => x.id === p.settlementId)
      if (s && ['approved', 'closed'].includes(s.status)) return fail('Payment is part of an approved settlement')
    }
    for (const a of p.allocations) {
      const inv = db.invoices.find((i) => i.id === a.invoiceId)
      if (inv) { inv.paid = round2(Math.max(0, inv.paid - a.amount)); inv.status = invoiceStatusFor(inv) }
    }
    p.notes = [p.notes, note && `Rejected: ${note}`].filter(Boolean).join(' · ')
  }
  p.verification = decision
  p.verifiedBy = ctx.user
  log(db, ctx, `Payment ${decision}`, p.receiptNo)
  return { ok: true, id }
}

// ───────────────────────── daily settlement ─────────────────────────
export function submitSettlement(db: DB, ctx: Ctx, input: { driverId: ID; date: DayKey; cashHandedOver: number; physical?: Record<ID, number>; notes?: string }): Result {
  const d = db.drivers.find((x) => x.id === input.driverId)
  if (!d) return fail('Driver not found')
  const existing = db.settlements.find((s) => s.driverId === d.id && s.date === input.date && s.status !== 'rejected')
  if (existing) return fail(`Settlement ${existing.settlementNo} is already ${existing.status.replace('_', ' ')}`, 'ALREADY')
  const calc = computeSettlement(db, d.id, input.date)
  const pendingStops = db.deliveries.filter((x) => x.driverId === d.id && x.date === input.date && ['pending', 'out_for_delivery'].includes(x.status))
  if (pendingStops.length) return fail(`${pendingStops.length} delivery stop(s) still pending - complete or fail them first`)
  if (!(input.cashHandedOver >= 0)) return fail('Enter the cash handed over')
  if (!calc.rows.length && !calc.paymentIds.length) return fail('No van activity found for this day')
  const rows = calc.rows.map((r) => ({ ...r, physical: round2(input.physical?.[r.productId] ?? r.closing) }))
  const physicalKg = round2(rows.reduce((s, r) => s + r.physical, 0))
  const prev = db.settlements.find((s) => s.driverId === d.id && s.date === input.date && s.status === 'rejected')
  const id = uid(db, 'stl')
  const s: Settlement = {
    ...calc,
    rows,
    id,
    settlementNo: prev ? `${prev.settlementNo}-R` : nextNo(db, 'stl', 'DS', yr(input.date), 4),
    physicalKg,
    stockDiscrepancyKg: round2(physicalKg - calc.closingKg),
    cashHandedOver: round2(input.cashHandedOver),
    cashVariance: round2(input.cashHandedOver - calc.expectedCash),
    driverNotes: input.notes,
    status: 'submitted',
    history: [{ status: 'submitted', at: ctx.now, by: d.name, note: input.notes }],
    submittedAt: ctx.now,
  }
  delete (s as any).paymentIds
  delete (s as any).invoiceIds
  db.settlements.push(s)
  for (const pid of calc.paymentIds) {
    const p = db.payments.find((x) => x.id === pid)
    if (p) p.settlementId = id
  }
  log(db, ctx, 'Settlement submitted', `${s.settlementNo} · ${d.name}`)
  const flag = Math.abs(s.cashVariance) > db.settings.cashVarianceToleranceSAR || Math.abs(s.stockDiscrepancyKg) > 0.5
  notify(db, ctx, {
    audience: 'admin',
    kind: flag ? 'warning' : 'info',
    title: 'Settlement awaiting review',
    body: `${d.name} · ${s.settlementNo}${flag ? ' · variance flagged' : ''}`,
    link: `/settlement?id=${id}`,
  })
  return { ok: true, id }
}
export function advanceSettlement(db: DB, ctx: Ctx, id: ID, to: SettlementStatus, opts: { remarks?: string; cashVerified?: boolean; stockVerified?: boolean } = {}): Result {
  const s = db.settlements.find((x) => x.id === id)
  if (!s) return fail('Settlement not found')
  const allowed: Record<SettlementStatus, SettlementStatus[]> = {
    submitted: ['under_review', 'rejected'],
    under_review: ['verified', 'rejected'],
    verified: ['approved', 'rejected'],
    approved: ['closed'],
    closed: [],
    rejected: [],
  }
  if (!allowed[s.status].includes(to)) return fail(`Cannot move from ${s.status.replace('_', ' ')} to ${to.replace('_', ' ')}`)
  if (to === 'verified') {
    if (!opts.cashVerified || !opts.stockVerified) return fail('Tick both cash and stock verification')
    const tol = db.settings.cashVarianceToleranceSAR
    if (Math.abs(s.cashVariance) > tol && !opts.remarks?.trim()) return fail(`Cash variance exceeds SAR ${tol}: supervisor remarks are required`)
    s.cashVerified = true
    s.stockVerified = true
  }
  if (to === 'rejected' && !opts.remarks?.trim()) return fail('Enter remarks for the driver')
  if (opts.remarks?.trim()) s.supervisorRemarks = opts.remarks
  s.status = to
  s.history.push({ status: to, at: ctx.now, by: ctx.user, note: opts.remarks })
  const driver = db.drivers.find((d) => d.id === s.driverId)
  if (to === 'approved') {
    for (const p of db.payments) if (p.settlementId === s.id && p.verification === 'pending') { p.verification = 'verified'; p.verifiedBy = ctx.user }
  }
  if (to === 'rejected') {
    for (const p of db.payments) if (p.settlementId === s.id) p.settlementId = undefined
  }
  log(db, ctx, `Settlement ${to.replace('_', ' ')}`, `${s.settlementNo} · ${driver?.name ?? ''}`)
  if (to === 'approved' || to === 'rejected' || to === 'closed')
    notify(db, ctx, { audience: 'driver', driverId: s.driverId, kind: to === 'rejected' ? 'danger' : 'success', title: `Settlement ${to}`, body: `${s.settlementNo}${opts.remarks ? ` · ${opts.remarks}` : ''}`, link: '/driver' })
  return { ok: true, id }
}

export const _internal = { pick, putBack, vmove }
export type { Delivery }
