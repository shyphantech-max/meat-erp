/**
 * Pure derived calculations over the DB. No React here, so the seed generator, the
 * transaction logic and the UI selectors all share one source of truth.
 */
import type { Batch, Customer, DayKey, DB, Invoice, Product, PurchaseOrder, Settlement, SettlementProductRow, ID } from '@/types'
import { daysBetween, round2, todayKey } from '@/lib/format'

export const invoiceBalance = (i: Invoice) => (i.status === 'void' ? 0 : round2(Math.max(0, i.total - i.paid - i.returned)))
export const invoiceStatusFor = (i: Invoice): Invoice['status'] => {
  if (i.status === 'void') return 'void'
  const bal = i.total - i.paid - i.returned
  if (bal <= 0.009) return 'paid'
  if (i.paid + i.returned > 0.009) return 'partial'
  return 'unpaid'
}

export function customerOutstanding(db: DB, customerId: ID) {
  let s = 0
  for (const i of db.invoices) if (i.customerId === customerId) s += invoiceBalance(i)
  return round2(s)
}

export type AgeBucket = '0-30' | '31-60' | '61-90' | '90+'
export const AGE_BUCKETS: AgeBucket[] = ['0-30', '31-60', '61-90', '90+']
export function ageBucket(invDate: DayKey, asOf: DayKey = todayKey()): AgeBucket {
  const d = daysBetween(invDate, asOf)
  if (d <= 30) return '0-30'
  if (d <= 60) return '31-60'
  if (d <= 90) return '61-90'
  return '90+'
}
export function ageingFor(db: DB, customerId?: ID, asOf: DayKey = todayKey()) {
  const out: Record<AgeBucket, number> = { '0-30': 0, '31-60': 0, '61-90': 0, '90+': 0 }
  for (const i of db.invoices) {
    if (customerId && i.customerId !== customerId) continue
    const b = invoiceBalance(i)
    if (b > 0) out[ageBucket(i.date, asOf)] += b
  }
  for (const k of AGE_BUCKETS) out[k] = round2(out[k])
  return out
}

export const poPayable = (po: PurchaseOrder) =>
  ['approved', 'partially_received', 'received'].includes(po.status) ? round2(Math.max(0, po.totalSAR - po.paidSAR)) : 0

// ───── warehouse stock ─────
export function warehouseStock(db: DB, productId: ID, warehouseId?: ID) {
  let s = 0
  for (const b of db.batches) if (b.productId === productId && (!warehouseId || b.warehouseId === warehouseId)) s += b.qtyKg
  return round2(s)
}
export const totalWarehouseKg = (db: DB) => round2(db.batches.reduce((s, b) => s + b.qtyKg, 0))

export function nearExpiryDays(db: DB, p: Product) {
  const s = db.settings
  return p.category === 'fresh' ? s.nearExpiryFreshDays : p.category === 'chilled' ? s.nearExpiryChilledDays : s.nearExpiryFrozenDays
}
export type BatchState = 'ok' | 'near_expiry' | 'expired'
export function batchState(db: DB, b: Batch, asOf: DayKey = todayKey()): BatchState {
  const p = db.products.find((x) => x.id === b.productId)
  const left = daysBetween(asOf, b.expiryDate)
  if (left < 0) return 'expired'
  if (p && left <= nearExpiryDays(db, p)) return 'near_expiry'
  return 'ok'
}
/** sellable batches for a product in first-expiry-first-out order (expired stock is never picked) */
export function fefoBatches(db: DB, productId: ID, warehouseId: ID, asOf: DayKey = todayKey()) {
  return db.batches
    .filter((b) => b.productId === productId && b.warehouseId === warehouseId && b.qtyKg > 0.0001 && b.expiryDate >= asOf && b.receivedDate <= asOf)
    .sort((a, b) => a.expiryDate.localeCompare(b.expiryDate) || a.receivedDate.localeCompare(b.receivedDate))
}
export function sellableStock(db: DB, productId: ID, warehouseId: ID, asOf: DayKey = todayKey()) {
  return round2(fefoBatches(db, productId, warehouseId, asOf).reduce((s, b) => s + b.qtyKg, 0))
}

// ───── van stock (derived entirely from the van movement ledger) ─────
export function vanStockByProduct(db: DB, driverId: ID, upTo?: { before?: DayKey; through?: DayKey }) {
  const out: Record<ID, number> = {}
  for (const m of db.vanMovements) {
    if (m.driverId !== driverId) continue
    if (upTo?.before && m.date >= upTo.before) continue
    if (upTo?.through && m.date > upTo.through) continue
    out[m.productId] = (out[m.productId] ?? 0) + m.qtyKg
  }
  for (const k of Object.keys(out)) {
    out[k] = round2(out[k])
    if (Math.abs(out[k]) < 0.005) delete out[k]
  }
  return out
}
export const vanTotalKg = (db: DB, driverId: ID) => round2(Object.values(vanStockByProduct(db, driverId)).reduce((s, v) => s + v, 0))

// ───── daily driver settlement ─────
export interface SettlementCalc extends Omit<Settlement, 'id' | 'settlementNo' | 'status' | 'history' | 'submittedAt' | 'cashHandedOver' | 'cashVariance' | 'physicalKg' | 'stockDiscrepancyKg' | 'rows'> {
  rows: Omit<SettlementProductRow, 'physical'>[]
  paymentIds: ID[]
  invoiceIds: ID[]
}
export function computeSettlement(db: DB, driverId: ID, date: DayKey): SettlementCalc {
  const driver = db.drivers.find((d) => d.id === driverId)
  const rowsMap: Record<ID, Omit<SettlementProductRow, 'physical'>> = {}
  const row = (pid: ID) => (rowsMap[pid] ??= { productId: pid, opening: 0, loaded: 0, delivered: 0, customerReturns: 0, returnedToWH: 0, loss: 0, closing: 0 })
  let vehicleId = driver?.vehicleId ?? ''
  for (const m of db.vanMovements) {
    if (m.driverId !== driverId || m.date > date) continue
    const r = row(m.productId)
    if (m.date < date) {
      r.opening += m.qtyKg
      continue
    }
    vehicleId = m.vehicleId || vehicleId
    if (m.type === 'load') r.loaded += m.qtyKg
    else if (m.type === 'delivery' || m.type === 'van_sale') r.delivered -= m.qtyKg
    else if (m.type === 'customer_return') r.customerReturns += m.qtyKg
    else if (m.type === 'return_wh') r.returnedToWH -= m.qtyKg
    else if (m.type === 'loss') r.loss -= m.qtyKg
  }
  const rows = Object.values(rowsMap)
    .map((r) => {
      const x = { ...r }
      for (const k of ['opening', 'loaded', 'delivered', 'customerReturns', 'returnedToWH', 'loss'] as const) x[k] = round2(x[k])
      x.closing = round2(x.opening + x.loaded + x.customerReturns - x.delivered - x.returnedToWH - x.loss)
      return x
    })
    .filter((r) => r.opening || r.loaded || r.delivered || r.customerReturns || r.returnedToWH || r.loss || r.closing)
  const sum = (k: keyof (typeof rows)[number]) => round2(rows.reduce((s, r) => s + (r[k] as number), 0))

  const invoices = db.invoices.filter((i) => i.driverId === driverId && i.date === date && i.status !== 'void')
  const totalSales = round2(invoices.reduce((s, i) => s + i.total, 0))
  const cashSales = round2(invoices.filter((i) => i.paymentType === 'cash').reduce((s, i) => s + i.total, 0))
  const payments = db.payments.filter((p) => p.driverId === driverId && p.date === date && p.verification !== 'rejected')
  let cash = 0, bank = 0, current = 0, old = 0
  for (const p of payments) {
    if (p.method === 'cash') cash += p.amount
    else bank += p.amount
    for (const a of p.allocations) {
      const inv = db.invoices.find((i) => i.id === a.invoiceId)
      if (inv && inv.date >= date) current += a.amount
      else old += a.amount
    }
  }
  const deliveries = db.deliveries.filter((d) => d.driverId === driverId && d.date === date)
  return {
    driverId,
    vehicleId,
    date,
    rows,
    openingKg: sum('opening'),
    loadedKg: sum('loaded'),
    deliveredKg: sum('delivered'),
    customerReturnsKg: sum('customerReturns'),
    returnedKg: sum('returnedToWH'),
    lossKg: sum('loss'),
    closingKg: sum('closing'),
    totalSales,
    cashSales,
    creditSales: round2(totalSales - cashSales),
    cashCollected: round2(cash),
    bankTransfers: round2(bank),
    currentCollected: round2(current),
    oldDuesCollected: round2(old),
    expectedCash: round2(cash),
    deliveriesDone: deliveries.filter((d) => ['delivered', 'partial', 'failed'].includes(d.status)).length,
    deliveriesTotal: deliveries.length,
    paymentIds: payments.map((p) => p.id),
    invoiceIds: invoices.map((i) => i.id),
  }
}

export const customerPrice = (c: Customer | undefined, p: Product | undefined) => (p ? (c?.prices[p.id] ?? p.sellPrice) : 0)

export function invoiceTotals(lines: { qtyKg: number; price: number }[], vatRate: number) {
  const subtotal = round2(lines.reduce((s, l) => s + l.qtyKg * l.price, 0))
  const vat = round2((subtotal * vatRate) / 100)
  return { subtotal, vat, total: round2(subtotal + vat) }
}

/** weighted average cost of current stock (falls back to product standard cost) */
export function avgCost(db: DB, productId: ID) {
  let q = 0, v = 0
  for (const b of db.batches) if (b.productId === productId && b.qtyKg > 0) { q += b.qtyKg; v += b.qtyKg * b.unitCost }
  return q > 0 ? round2(v / q) : (db.products.find((p) => p.id === productId)?.costPrice ?? 0)
}
