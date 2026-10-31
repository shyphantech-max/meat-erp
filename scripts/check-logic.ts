/** Transaction invariants: run with `npx vite-node scripts/check-logic.ts` */
import { produce } from 'immer'
import { buildSeed } from '../src/data/seed'
import * as L from '../src/store/logic'
import { computeSettlement, customerOutstanding, invoiceBalance, vanStockByProduct, warehouseStock } from '../src/store/derive'
import { todayKey } from '../src/lib/format'
import type { DB } from '../src/types'

let db: DB = buildSeed()
const today = todayKey()
let clock = Date.now()
const ctx = (): L.Ctx => ({ user: 'Test', today, now: new Date((clock += 5 * 60_000)).toISOString() })
const run = (fn: (d: DB, c: L.Ctx) => any) => { let r: any; const next = produce(db, (d) => { r = fn(d as DB, ctx()) }); if (r?.ok) db = next; return r }
let fails = 0
const check = (name: string, cond: boolean, extra?: unknown) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`, cond ? '' : extra ?? ''); if (!cond) fails++ }

// 1. GRN approval posts stock exactly once
const qc = db.grns.find((g) => g.status === 'qc_passed')!
const p0 = qc.lines[0].productId, wh = qc.warehouseId
const before = warehouseStock(db, p0, wh)
check('approve GRN', run((d, c) => L.approveGRN(d, c, qc.id)).ok)
const after = warehouseStock(db, p0, wh)
check('stock increased by accepted kg', Math.abs(after - before - qc.lines[0].acceptedKg) < 0.01, { before, after })
check('second approval rejected', !run((d, c) => L.approveGRN(d, c, qc.id)).ok)
check('stock unchanged after 2nd approve', warehouseStock(db, p0, wh) === after)

// 2. van loading moves stock warehouse → van
const drv = db.drivers.find((d) => d.id === 'drv_5')!
const vanBefore = vanStockByProduct(db, drv.id)[p0] ?? 0
const whBefore = warehouseStock(db, p0, drv.warehouseId)
check('load van', run((d, c) => L.loadVan(d, c, { driverId: drv.id, vehicleId: drv.vehicleId!, warehouseId: drv.warehouseId, date: today, lines: [{ productId: p0, qtyKg: 100 }] })).ok)
check('warehouse −100', Math.abs(warehouseStock(db, p0, drv.warehouseId) - (whBefore - 100)) < 0.01)
check('van +100', Math.abs((vanStockByProduct(db, drv.id)[p0] ?? 0) - (vanBefore + 100)) < 0.01)
check('cannot overload beyond stock', !run((d, c) => L.loadVan(d, c, { driverId: drv.id, vehicleId: drv.vehicleId!, warehouseId: drv.warehouseId, date: today, lines: [{ productId: p0, qtyKg: 9_999_999 }] })).ok)

// 3. delivery completes once, van decreases, invoice created
const dl = db.deliveries.find((d) => d.driverId === drv.id && d.date === today && ['pending', 'out_for_delivery'].includes(d.status))!
const van = vanStockByProduct(db, drv.id)
const lines = dl.lines.map((l) => ({ productId: l.productId, deliveredKg: Math.min(l.orderedKg, van[l.productId] ?? 0) }))
const invCount = db.invoices.length
const r = run((d, c) => L.completeDelivery(d, c, { deliveryId: dl.id, lines, allowOverLimit: true }))
check('complete delivery', r.ok, r.error)
check('invoice created', db.invoices.length === invCount + 1)
check('completing again rejected', !run((d, c) => L.completeDelivery(d, c, { deliveryId: dl.id, lines, allowOverLimit: true })).ok)
check('no 2nd invoice', db.invoices.length === invCount + 1)
const vanAfter = vanStockByProduct(db, drv.id)
check('van decreased by delivered', lines.every((l) => Math.abs((vanAfter[l.productId] ?? 0) - ((van[l.productId] ?? 0) - l.deliveredKg)) < 0.01))
check('van never negative', Object.values(vanAfter).every((q) => q >= -0.001))

// 4. payments reduce outstanding; duplicates blocked
const inv = db.invoices.find((i) => i.id === r.invoiceId)!
const out0 = customerOutstanding(db, inv.customerId)
const key = 'idem-1'
check('record payment', run((d, c) => L.recordPayment(d, c, { customerId: inv.customerId, driverId: drv.id, date: today, method: 'cash', amount: 100, allocations: [{ invoiceId: inv.id, amount: 100 }], idempotencyKey: key })).ok)
check('outstanding −100', Math.abs(customerOutstanding(db, inv.customerId) - (out0 - 100)) < 0.01)
check('same idempotency key rejected', run((d, c) => L.recordPayment(d, c, { customerId: inv.customerId, date: today, method: 'cash', amount: 100, idempotencyKey: key })).code === 'DUPLICATE')
clock -= 10 * 60_000 // back to the moment of the first payment
check('same amount within 2 min rejected', run((d, c) => L.recordPayment(d, c, { customerId: inv.customerId, driverId: drv.id, date: today, method: 'cash', amount: 100 })).code === 'DUPLICATE')
check('overpayment rejected', !run((d, c) => L.recordPayment(d, c, { customerId: inv.customerId, date: today, method: 'cash', amount: 99_999_999 })).ok)
const bankRef = db.payments.find((p) => p.method === 'bank' && p.bankRef)!.bankRef!
check('duplicate bank reference rejected', run((d, c) => L.recordPayment(d, c, { customerId: inv.customerId, date: today, method: 'bank', bankRef, amount: 10 })).code === 'DUPLICATE')
check('no invoice overpaid', db.invoices.every((i) => invoiceBalance(i) >= 0 && i.paid <= i.total + 0.01))

// 5. settlement reconciles and cannot be submitted twice
for (const d of db.deliveries.filter((x) => x.driverId === drv.id && x.date === today && ['pending', 'out_for_delivery'].includes(x.status)))
  run((dd, c) => L.completeDelivery(dd, c, { deliveryId: d.id, lines: [], failed: true, failReason: 'Closed' }))
const calc = computeSettlement(db, drv.id, today)
const formulaOk = calc.rows.every((x) => Math.abs(x.opening + x.loaded + x.customerReturns - x.delivered - x.returnedToWH - x.loss - x.closing) < 0.01)
check('stock formula holds per product', formulaOk)
check('closing equals live van stock', Math.abs(calc.closingKg - Object.values(vanStockByProduct(db, drv.id)).reduce((s, q) => s + q, 0)) < 0.01)
const s1 = run((d, c) => L.submitSettlement(d, c, { driverId: drv.id, date: today, cashHandedOver: calc.expectedCash }))
check('submit settlement', s1.ok, s1.error)
check('second submit rejected', !run((d, c) => L.submitSettlement(d, c, { driverId: drv.id, date: today, cashHandedOver: 0 })).ok)
check('supervisor notified', db.notifications.some((n) => n.link === `/settlement?id=${s1.id}`))
check('cannot skip to approved', !run((d, c) => L.advanceSettlement(d, c, s1.id, 'approved')).ok)
for (const to of ['under_review', 'verified', 'approved', 'closed'] as const) check(`settlement → ${to}`, run((d, c) => L.advanceSettlement(d, c, s1.id, to, { cashVerified: true, stockVerified: true })).ok)
check('driver payments verified on approval', db.payments.filter((p) => p.settlementId === s1.id).every((p) => p.verification === 'verified'))
check('no loading after day closed', !run((d, c) => L.loadVan(d, c, { driverId: drv.id, vehicleId: drv.vehicleId!, warehouseId: drv.warehouseId, date: today, lines: [{ productId: p0, qtyKg: 1 }] })).ok)

// 6. sales return credits invoice and cannot exceed invoiced KG
const rInv = db.invoices.find((i) => i.source === 'direct' && i.status !== 'void')!
const l0 = rInv.lines[0]
const bal0 = invoiceBalance(rInv)
check('sales return', run((d, c) => L.salesReturn(d, c, { invoiceId: rInv.id, date: today, lines: [{ productId: l0.productId, qtyKg: 5 }], reason: 'Damaged', destination: 'warehouse', warehouseId: rInv.warehouseId!, condition: 'resaleable' })).ok)
check('return over invoiced kg rejected', !run((d, c) => L.salesReturn(d, c, { invoiceId: rInv.id, date: today, lines: [{ productId: l0.productId, qtyKg: l0.qtyKg }], reason: 'x', destination: 'warehouse', warehouseId: rInv.warehouseId!, condition: 'resaleable' })).ok)
check('balance reduced or already settled', invoiceBalance(db.invoices.find((i) => i.id === rInv.id)!) <= bal0)
check('no negative batches', db.batches.every((b) => b.qtyKg >= -0.001))

console.log(fails ? `\n${fails} FAILED` : '\nall checks passed')
process.exit(fails ? 1 : 0)
