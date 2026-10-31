/**
 * Report definitions. Each report is a pure `build(db, filters)` returning rows, columns
 * (raw values for CSV, formatted cells for screen/print) and summary totals.
 */
import type { ReactNode } from 'react'
import {
  AlertTriangle, BadgeDollarSign, Boxes, ClipboardList, HandCoins, PackageCheck, Scale, Ship, TrendingUp, Users, type LucideIcon,
} from 'lucide-react'
import type { DayKey, DB, ID } from '@/types'
import type { TFn } from '@/i18n'
import { StatusBadge } from '@/components/common'
import { fmtDate, fmtDateTime, fmtKg, fmtNum, fmtPct, fmtSAR, round2, todayKey, daysBetween } from '@/lib/format'
import { ageingFor, batchState, customerOutstanding, invoiceBalance } from '@/store/derive'
import { landedCost } from '@/store/logic'

export type FilterKey = 'driver' | 'customer' | 'warehouse' | 'product' | 'supplier' | 'method'
export interface Filters {
  from: DayKey
  to: DayKey
  driver?: ID
  customer?: ID
  warehouse?: ID
  product?: ID
  supplier?: ID
  method?: 'cash' | 'bank'
}
export type Fmt = 'sar' | 'kg' | 'num' | 'pct' | 'date' | 'datetime' | 'status' | 'text'
export interface Col<R> {
  id: string
  header: string
  value: (r: R) => string | number
  fmt?: Fmt
  cell?: (r: R) => ReactNode
}
export interface ReportOut<R = any> {
  rows: R[]
  cols: Col<R>[]
  summary: { label: string; value: string }[]
}
type Name = (e?: { name: string; nameAr?: string } | null) => string
export interface ReportDef {
  key: string
  title: string
  description: string
  icon: LucideIcon
  filters: FilterKey[]
  /** false → point-in-time report (as of today), date filters hidden */
  dated: boolean
  build: (db: DB, f: Filters, x: { name: Name; t: TFn }) => ReportOut
}

export function fmtValue(fmt: Fmt | undefined, v: string | number, t: TFn) {
  if (fmt === 'sar') return fmtSAR(Number(v))
  if (fmt === 'kg') return fmtKg(Number(v))
  if (fmt === 'num') return fmtNum(Number(v))
  if (fmt === 'pct') return fmtPct(Number(v), 1)
  if (fmt === 'date') return fmtDate(String(v))
  if (fmt === 'datetime') return fmtDateTime(String(v))
  if (fmt === 'status') return t(String(v)) !== v ? t(String(v)) : t(String(v).replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase()))
  return String(v ?? '')
}
export const isNumeric = (f?: Fmt) => f === 'sar' || f === 'kg' || f === 'num' || f === 'pct'

const sum = <T,>(a: T[], f: (x: T) => number) => round2(a.reduce((s, x) => s + f(x), 0))
const inR = (d: DayKey, f: Filters) => d >= f.from && d <= f.to
const status = <R,>(id: string, header: string, value: (r: R) => string): Col<R> => ({ id, header, value, fmt: 'status', cell: (r) => <StatusBadge status={value(r)} /> })

/** weighted average purchase cost per product across all received batches */
function costMap(db: DB) {
  const m: Record<ID, number> = {}
  for (const p of db.products) {
    const bs = db.batches.filter((b) => b.productId === p.id && b.grnId)
    const q = bs.reduce((s, b) => s + b.initialKg, 0)
    m[p.id] = q > 0 ? bs.reduce((s, b) => s + b.initialKg * b.unitCost, 0) / q : p.costPrice
  }
  return m
}

export const REPORTS: ReportDef[] = [
  // 1 ─────────────────────────────
  {
    key: 'daily-sales',
    title: 'Daily Sales Report',
    description: 'Invoiced sales per day with KG, VAT and cash / credit split.',
    icon: TrendingUp,
    filters: ['customer', 'driver', 'product'],
    dated: true,
    build: (db, f) => {
      const inv = db.invoices.filter((i) => i.status !== 'void' && i.source !== 'opening' && inR(i.date, f) && (!f.customer || i.customerId === f.customer) && (!f.driver || i.driverId === f.driver))
      const days = [...new Set(inv.map((i) => i.date))].sort().reverse()
      const rows = days.map((d) => {
        const di = inv.filter((i) => i.date === d)
        const lines = di.flatMap((i) => i.lines.filter((l) => !f.product || l.productId === f.product).map((l) => ({ ...l, vatRate: i.vatRate, cash: i.paymentType === 'cash' })))
        const sub = sum(lines, (l) => l.qtyKg * l.price)
        const vat = sum(lines, (l) => (l.qtyKg * l.price * l.vatRate) / 100)
        return {
          date: d,
          invoices: di.filter((i) => !f.product || i.lines.some((l) => l.productId === f.product)).length,
          kg: sum(lines, (l) => l.qtyKg),
          subtotal: sub,
          vat,
          total: round2(sub + vat),
          cash: sum(lines.filter((l) => l.cash), (l) => l.qtyKg * l.price * (1 + l.vatRate / 100)),
          credit: sum(lines.filter((l) => !l.cash), (l) => l.qtyKg * l.price * (1 + l.vatRate / 100)),
        }
      }).filter((r) => r.kg > 0)
      return {
        rows,
        cols: [
          { id: 'date', header: 'Date', value: (r) => r.date, fmt: 'date' },
          { id: 'invoices', header: 'Invoices', value: (r) => r.invoices, fmt: 'num' },
          { id: 'kg', header: 'KG sold', value: (r) => r.kg, fmt: 'kg' },
          { id: 'subtotal', header: 'Subtotal', value: (r) => r.subtotal, fmt: 'sar' },
          { id: 'vat', header: 'VAT', value: (r) => r.vat, fmt: 'sar' },
          { id: 'total', header: 'Total', value: (r) => r.total, fmt: 'sar' },
          { id: 'cash', header: 'Cash sales', value: (r) => r.cash, fmt: 'sar' },
          { id: 'credit', header: 'Credit sales', value: (r) => r.credit, fmt: 'sar' },
        ],
        summary: [
          { label: 'Total sales', value: fmtSAR(sum(rows, (r) => r.total)) },
          { label: 'KG sold', value: fmtKg(sum(rows, (r) => r.kg)) },
          { label: 'VAT', value: fmtSAR(sum(rows, (r) => r.vat)) },
          { label: 'Cash / credit', value: `${fmtSAR(sum(rows, (r) => r.cash), { compact: true })} / ${fmtSAR(sum(rows, (r) => r.credit), { compact: true })}` },
        ],
      }
    },
  },
  // 2 ─────────────────────────────
  {
    key: 'daily-collection',
    title: 'Daily Collection Report',
    description: 'Every receipt with method, collector and current vs old-dues split.',
    icon: HandCoins,
    filters: ['customer', 'driver', 'method'],
    dated: true,
    build: (db, f, { name }) => {
      const rows = db.payments
        .filter((p) => inR(p.date, f) && (!f.customer || p.customerId === f.customer) && (!f.driver || p.driverId === f.driver) && (!f.method || p.method === f.method))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map((p) => {
          let current = 0, old = 0
          for (const a of p.allocations) {
            const inv = db.invoices.find((i) => i.id === a.invoiceId)
            if (inv && inv.date >= p.date) current += a.amount
            else old += a.amount
          }
          return {
            at: p.createdAt, receipt: p.receiptNo, customer: name(db.customers.find((c) => c.id === p.customerId)),
            collector: p.driverId ? name(db.drivers.find((d) => d.id === p.driverId)) : 'Office', method: p.method, ref: p.bankRef ?? '',
            current: round2(current), old: round2(old), amount: p.amount, verification: p.verification,
          }
        })
      const ok = rows.filter((r) => r.verification !== 'rejected')
      return {
        rows,
        cols: [
          { id: 'at', header: 'Date & time', value: (r) => r.at, fmt: 'datetime' },
          { id: 'receipt', header: 'Receipt', value: (r) => r.receipt },
          { id: 'customer', header: 'Customer', value: (r) => r.customer },
          { id: 'collector', header: 'Collected by', value: (r) => r.collector },
          status('method', 'Method', (r: any) => r.method),
          { id: 'ref', header: 'Reference', value: (r) => r.ref },
          { id: 'current', header: 'Current sales', value: (r) => r.current, fmt: 'sar' },
          { id: 'old', header: 'Old dues', value: (r) => r.old, fmt: 'sar' },
          { id: 'amount', header: 'Amount', value: (r) => r.amount, fmt: 'sar' },
          status('verification', 'Verification', (r: any) => r.verification),
        ],
        summary: [
          { label: 'Total collected', value: fmtSAR(sum(ok, (r) => r.amount)) },
          { label: 'Cash', value: fmtSAR(sum(ok.filter((r) => r.method === 'cash'), (r) => r.amount)) },
          { label: 'Bank transfers', value: fmtSAR(sum(ok.filter((r) => r.method === 'bank'), (r) => r.amount)) },
          { label: 'Old dues collected', value: fmtSAR(sum(ok, (r) => r.old)) },
        ],
      }
    },
  },
  // 3 ─────────────────────────────
  {
    key: 'driver-collection',
    title: 'Driver-wise Collection Report',
    description: 'Sales and collections per driver, cash vs bank, current vs old dues.',
    icon: Users,
    filters: ['driver'],
    dated: true,
    build: (db, f, { name }) => {
      const rows = db.drivers
        .filter((d) => !f.driver || d.id === f.driver)
        .map((d) => {
          const ps = db.payments.filter((p) => p.driverId === d.id && inR(p.date, f) && p.verification !== 'rejected')
          const inv = db.invoices.filter((i) => i.driverId === d.id && inR(i.date, f) && i.status !== 'void')
          let current = 0, old = 0
          for (const p of ps)
            for (const a of p.allocations) {
              const i = db.invoices.find((x) => x.id === a.invoiceId)
              if (i && i.date >= p.date) current += a.amount
              else old += a.amount
            }
          const total = sum(ps, (p) => p.amount)
          const sales = sum(inv, (i) => i.total)
          return {
            driver: name(d), receipts: ps.length, sales, cash: sum(ps.filter((p) => p.method === 'cash'), (p) => p.amount), bank: sum(ps.filter((p) => p.method === 'bank'), (p) => p.amount),
            current: round2(current), old: round2(old), total, rate: sales > 0 ? (current / sales) * 100 : 0, pending: ps.filter((p) => p.verification === 'pending').length,
          }
        })
        .filter((r) => r.receipts > 0 || r.sales > 0)
      return {
        rows,
        cols: [
          { id: 'driver', header: 'Driver', value: (r) => r.driver },
          { id: 'sales', header: 'Route sales', value: (r) => r.sales, fmt: 'sar' },
          { id: 'receipts', header: 'Receipts', value: (r) => r.receipts, fmt: 'num' },
          { id: 'cash', header: 'Cash', value: (r) => r.cash, fmt: 'sar' },
          { id: 'bank', header: 'Bank', value: (r) => r.bank, fmt: 'sar' },
          { id: 'current', header: 'Current sales', value: (r) => r.current, fmt: 'sar' },
          { id: 'old', header: 'Old dues', value: (r) => r.old, fmt: 'sar' },
          { id: 'total', header: 'Total collected', value: (r) => r.total, fmt: 'sar' },
          { id: 'rate', header: 'Collected % of sales', value: (r) => round2(r.rate), fmt: 'pct' },
          { id: 'pending', header: 'Unverified', value: (r) => r.pending, fmt: 'num' },
        ],
        summary: [
          { label: 'Route sales', value: fmtSAR(sum(rows, (r) => r.sales)) },
          { label: 'Total collected', value: fmtSAR(sum(rows, (r) => r.total)) },
          { label: 'Cash', value: fmtSAR(sum(rows, (r) => r.cash)) },
          { label: 'Old dues collected', value: fmtSAR(sum(rows, (r) => r.old)) },
        ],
      }
    },
  },
  // 4 ─────────────────────────────
  {
    key: 'driver-settlement',
    title: 'Driver Settlement Report',
    description: 'Daily settlements with stock reconciliation, cash variance and approval status.',
    icon: Scale,
    filters: ['driver'],
    dated: true,
    build: (db, f, { name }) => {
      const rows = db.settlements
        .filter((s) => inR(s.date, f) && (!f.driver || s.driverId === f.driver))
        .sort((a, b) => b.date.localeCompare(a.date))
        .map((s) => ({
          no: s.settlementNo, date: s.date, driver: name(db.drivers.find((d) => d.id === s.driverId)), vehicle: db.vehicles.find((v) => v.id === s.vehicleId)?.plateNo ?? '',
          loaded: s.loadedKg, delivered: s.deliveredKg, returned: s.returnedKg, closing: s.closingKg, stockVar: s.stockDiscrepancyKg,
          sales: s.totalSales, cash: s.cashCollected, bank: s.bankTransfers, old: s.oldDuesCollected, handed: s.cashHandedOver, variance: s.cashVariance, status: s.status,
        }))
      return {
        rows,
        cols: [
          { id: 'no', header: 'Settlement', value: (r) => r.no },
          { id: 'date', header: 'Date', value: (r) => r.date, fmt: 'date' },
          { id: 'driver', header: 'Driver', value: (r) => r.driver },
          { id: 'vehicle', header: 'Vehicle', value: (r) => r.vehicle },
          { id: 'loaded', header: 'Loaded', value: (r) => r.loaded, fmt: 'kg' },
          { id: 'delivered', header: 'Delivered / sold', value: (r) => r.delivered, fmt: 'kg' },
          { id: 'returned', header: 'Returned', value: (r) => r.returned, fmt: 'kg' },
          { id: 'closing', header: 'Closing', value: (r) => r.closing, fmt: 'kg' },
          { id: 'stockVar', header: 'Stock variance', value: (r) => r.stockVar, fmt: 'kg' },
          { id: 'sales', header: 'Total sales', value: (r) => r.sales, fmt: 'sar' },
          { id: 'cash', header: 'Cash collected', value: (r) => r.cash, fmt: 'sar' },
          { id: 'bank', header: 'Bank', value: (r) => r.bank, fmt: 'sar' },
          { id: 'old', header: 'Old dues', value: (r) => r.old, fmt: 'sar' },
          { id: 'handed', header: 'Cash handed over', value: (r) => r.handed, fmt: 'sar' },
          { id: 'variance', header: 'Cash variance', value: (r) => r.variance, fmt: 'sar', cell: (r) => <span className={r.variance < 0 ? 'font-semibold text-danger' : r.variance > 0 ? 'text-warning' : ''}>{fmtSAR(r.variance)}</span> },
          status('status', 'Status', (r: any) => r.status),
        ],
        summary: [
          { label: 'Settlements', value: fmtNum(rows.length) },
          { label: 'Total sales', value: fmtSAR(sum(rows, (r) => r.sales)) },
          { label: 'Cash handed over', value: fmtSAR(sum(rows, (r) => r.handed)) },
          { label: 'Net cash variance', value: fmtSAR(sum(rows, (r) => r.variance)) },
        ],
      }
    },
  },
  // 5 ─────────────────────────────
  {
    key: 'customer-outstanding',
    title: 'Customer Outstanding Report',
    description: 'Receivables per customer with 0-30 / 31-60 / 61-90 / 90+ day ageing and credit usage.',
    icon: BadgeDollarSign,
    filters: ['customer', 'driver'],
    dated: false,
    build: (db, f, { name }) => {
      const today = todayKey()
      const rows = db.customers
        .filter((c) => (!f.customer || c.id === f.customer) && (!f.driver || c.driverId === f.driver))
        .map((c) => {
          const age = ageingFor(db, c.id)
          const out = customerOutstanding(db, c.id)
          const overdue = sum(db.invoices.filter((i) => i.customerId === c.id && i.dueDate < today), (i) => invoiceBalance(i))
          return { code: c.code, customer: name(c), type: c.businessType, city: c.city, limit: c.creditLimit, out, a0: age['0-30'], a1: age['31-60'], a2: age['61-90'], a3: age['90+'], overdue, used: c.creditLimit ? (out / c.creditLimit) * 100 : 0 }
        })
        .filter((r) => r.out > 0)
        .sort((a, b) => b.out - a.out)
      return {
        rows,
        cols: [
          { id: 'code', header: 'Code', value: (r) => r.code },
          { id: 'customer', header: 'Customer', value: (r) => r.customer },
          status('type', 'Type', (r: any) => r.type),
          { id: 'city', header: 'City', value: (r) => r.city },
          { id: 'limit', header: 'Credit limit', value: (r) => r.limit, fmt: 'sar' },
          { id: 'a0', header: '0-30 days', value: (r) => r.a0, fmt: 'sar' },
          { id: 'a1', header: '31-60 days', value: (r) => r.a1, fmt: 'sar' },
          { id: 'a2', header: '61-90 days', value: (r) => r.a2, fmt: 'sar' },
          { id: 'a3', header: '90+ days', value: (r) => r.a3, fmt: 'sar' },
          { id: 'out', header: 'Outstanding', value: (r) => r.out, fmt: 'sar' },
          { id: 'overdue', header: 'Overdue', value: (r) => r.overdue, fmt: 'sar' },
          { id: 'used', header: 'Credit used', value: (r) => round2(r.used), fmt: 'pct', cell: (r) => <span className={r.used > 100 ? 'font-semibold text-danger' : r.used >= 80 ? 'text-warning' : ''}>{fmtPct(r.used)}</span> },
        ],
        summary: [
          { label: 'Total outstanding', value: fmtSAR(sum(rows, (r) => r.out)) },
          { label: 'Overdue', value: fmtSAR(sum(rows, (r) => r.overdue)) },
          { label: '90+ days', value: fmtSAR(sum(rows, (r) => r.a3)) },
          { label: 'Customers over limit', value: fmtNum(rows.filter((r) => r.used > 100).length) },
        ],
      }
    },
  },
  // 6 ─────────────────────────────
  {
    key: 'stock-availability',
    title: 'Stock Availability Report',
    description: 'Sellable KG and cartons per product and warehouse, stock value and reorder status.',
    icon: Boxes,
    filters: ['warehouse', 'product'],
    dated: false,
    build: (db, f, { name }) => {
      const today = todayKey()
      const rows = db.products
        .filter((p) => !f.product || p.id === f.product)
        .flatMap((p) =>
          db.warehouses
            .filter((w) => !f.warehouse || w.id === f.warehouse)
            .map((w) => {
              const bs = db.batches.filter((b) => b.productId === p.id && b.warehouseId === w.id && b.qtyKg > 0.001)
              const expired = sum(bs.filter((b) => b.expiryDate < today), (b) => b.qtyKg)
              const total = sum(bs, (b) => b.qtyKg)
              const avail = round2(total - expired)
              const next = bs.filter((b) => b.expiryDate >= today).sort((a, b) => a.expiryDate.localeCompare(b.expiryDate))[0]?.expiryDate ?? ''
              return { code: p.code, product: name(p), category: p.category, warehouse: name(w), batches: bs.length, avail, cartons: round2(avail / p.cartonKg), expired, value: sum(bs, (b) => b.qtyKg * b.unitCost), next, reorder: p.reorderLevelKg }
            })
            .filter((r) => r.batches > 0),
        )
      // product-level reorder status (all warehouses)
      const totals: Record<string, number> = {}
      for (const r of rows) totals[r.code] = (totals[r.code] ?? 0) + r.avail
      const withStatus = rows.map((r) => ({ ...r, status: totals[r.code] <= 0 ? 'out' : totals[r.code] < r.reorder ? 'low' : 'ok' }))
      return {
        rows: withStatus,
        cols: [
          { id: 'code', header: 'Code', value: (r) => r.code },
          { id: 'product', header: 'Product', value: (r) => r.product },
          status('category', 'Category', (r: any) => r.category),
          { id: 'warehouse', header: 'Warehouse', value: (r) => r.warehouse },
          { id: 'batches', header: 'Batches', value: (r) => r.batches, fmt: 'num' },
          { id: 'avail', header: 'Available KG', value: (r) => r.avail, fmt: 'kg' },
          { id: 'cartons', header: 'Cartons', value: (r) => r.cartons, fmt: 'num' },
          { id: 'expired', header: 'Expired KG', value: (r) => r.expired, fmt: 'kg' },
          { id: 'value', header: 'Value at cost', value: (r) => r.value, fmt: 'sar' },
          { id: 'next', header: 'Next expiry', value: (r) => r.next, fmt: 'date' },
          status('status', 'Status', (r: any) => r.status),
        ],
        summary: [
          { label: 'Available KG', value: fmtKg(sum(withStatus, (r) => r.avail), 0) },
          { label: 'Stock value', value: fmtSAR(sum(withStatus, (r) => r.value)) },
          { label: 'Expired KG', value: fmtKg(sum(withStatus, (r) => r.expired)) },
          { label: 'Low / out products', value: fmtNum(new Set(withStatus.filter((r) => r.status !== 'ok').map((r) => r.code)).size) },
        ],
      }
    },
  },
  // 7 ─────────────────────────────
  {
    key: 'purchase-grn',
    title: 'Purchase & GRN Report',
    description: 'Purchase orders against goods received, accepted and rejected KG, payment status.',
    icon: PackageCheck,
    filters: ['supplier', 'warehouse'],
    dated: true,
    build: (db, f, { name }) => {
      const rows = db.purchaseOrders
        .filter((p) => inR(p.date, f) && (!f.supplier || p.supplierId === f.supplier) && (!f.warehouse || p.warehouseId === f.warehouse))
        .sort((a, b) => b.date.localeCompare(a.date))
        .map((p) => {
          const grns = db.grns.filter((g) => g.poId === p.id)
          const ok = grns.filter((g) => g.status !== 'rejected')
          return {
            po: p.poNo, date: p.date, supplier: db.suppliers.find((s) => s.id === p.supplierId)?.name ?? '', kind: p.kind, warehouse: name(db.warehouses.find((w) => w.id === p.warehouseId)),
            ordered: sum(p.lines, (l) => l.qtyKg), received: sum(ok.flatMap((g) => g.lines), (l) => l.receivedKg), accepted: sum(grns.filter((g) => g.status === 'approved').flatMap((g) => g.lines), (l) => l.acceptedKg),
            rejected: sum(grns.flatMap((g) => g.lines), (l) => l.rejectedKg), grns: grns.map((g) => g.grnNo).join(', '), total: p.totalSAR, paid: p.paidSAR, pay: p.paymentStatus, status: p.status,
          }
        })
      return {
        rows,
        cols: [
          { id: 'po', header: 'PO', value: (r) => r.po },
          { id: 'date', header: 'Date', value: (r) => r.date, fmt: 'date' },
          { id: 'supplier', header: 'Supplier', value: (r) => r.supplier },
          status('kind', 'Type', (r: any) => (r.kind === 'import' ? 'international' : 'local')),
          { id: 'warehouse', header: 'Warehouse', value: (r) => r.warehouse },
          { id: 'ordered', header: 'Ordered KG', value: (r) => r.ordered, fmt: 'kg' },
          { id: 'received', header: 'Received KG', value: (r) => r.received, fmt: 'kg' },
          { id: 'accepted', header: 'Accepted KG', value: (r) => r.accepted, fmt: 'kg' },
          { id: 'rejected', header: 'Rejected KG', value: (r) => r.rejected, fmt: 'kg' },
          { id: 'grns', header: 'GRNs', value: (r) => r.grns },
          { id: 'total', header: 'PO value', value: (r) => r.total, fmt: 'sar' },
          { id: 'paid', header: 'Paid', value: (r) => r.paid, fmt: 'sar' },
          status('status', 'Status', (r: any) => r.status),
        ],
        summary: [
          { label: 'PO value', value: fmtSAR(sum(rows, (r) => r.total)) },
          { label: 'Ordered KG', value: fmtKg(sum(rows, (r) => r.ordered), 0) },
          { label: 'Accepted KG', value: fmtKg(sum(rows, (r) => r.accepted), 0) },
          { label: 'Rejected KG', value: fmtKg(sum(rows, (r) => r.rejected)) },
        ],
      }
    },
  },
  // 8 ─────────────────────────────
  {
    key: 'profitability',
    title: 'Product-wise Profitability Report',
    description: 'Revenue (excl. VAT, net of returns) against weighted purchase cost per product.',
    icon: ClipboardList,
    filters: ['product', 'customer'],
    dated: true,
    build: (db, f, { name }) => {
      const cost = costMap(db)
      const inv = db.invoices.filter((i) => i.status !== 'void' && i.source !== 'opening' && inR(i.date, f) && (!f.customer || i.customerId === f.customer))
      const rets = db.salesReturns.filter((r) => inR(r.date, f) && (!f.customer || r.customerId === f.customer))
      const rows = db.products
        .filter((p) => !f.product || p.id === f.product)
        .map((p) => {
          const ls = inv.flatMap((i) => i.lines.filter((l) => l.productId === p.id))
          const rl = rets.flatMap((r) => r.lines.filter((l) => l.productId === p.id))
          const kg = round2(sum(ls, (l) => l.qtyKg) - sum(rl, (l) => l.qtyKg))
          const revenue = round2(sum(ls, (l) => l.qtyKg * l.price) - sum(rl, (l) => l.qtyKg * l.price))
          const c = round2(kg * cost[p.id])
          return { code: p.code, product: name(p), species: p.species, kg, avgPrice: kg ? revenue / kg : 0, unitCost: cost[p.id], revenue, cost: c, profit: round2(revenue - c), margin: revenue ? ((revenue - c) / revenue) * 100 : 0 }
        })
        .filter((r) => r.kg > 0)
        .sort((a, b) => b.profit - a.profit)
      const rev = sum(rows, (r) => r.revenue), prof = sum(rows, (r) => r.profit)
      return {
        rows,
        cols: [
          { id: 'code', header: 'Code', value: (r) => r.code },
          { id: 'product', header: 'Product', value: (r) => r.product },
          status('species', 'Species', (r: any) => (r.species === 'chicken' ? 'Chicken' : 'Mutton')),
          { id: 'kg', header: 'KG sold (net)', value: (r) => r.kg, fmt: 'kg' },
          { id: 'avgPrice', header: 'Avg price / kg', value: (r) => round2(r.avgPrice), fmt: 'sar' },
          { id: 'unitCost', header: 'Avg cost / kg', value: (r) => round2(r.unitCost), fmt: 'sar' },
          { id: 'revenue', header: 'Revenue', value: (r) => r.revenue, fmt: 'sar' },
          { id: 'cost', header: 'Cost of sales', value: (r) => r.cost, fmt: 'sar' },
          { id: 'profit', header: 'Gross profit', value: (r) => r.profit, fmt: 'sar', cell: (r) => <span className={r.profit < 0 ? 'font-semibold text-danger' : 'font-medium text-success'}>{fmtSAR(r.profit)}</span> },
          { id: 'margin', header: 'Margin', value: (r) => round2(r.margin), fmt: 'pct' },
        ],
        summary: [
          { label: 'Revenue (excl. VAT)', value: fmtSAR(rev) },
          { label: 'Cost of sales', value: fmtSAR(sum(rows, (r) => r.cost)) },
          { label: 'Gross profit', value: fmtSAR(prof) },
          { label: 'Gross margin', value: fmtPct(rev ? (prof / rev) * 100 : 0, 1) },
        ],
      }
    },
  },
  // 9 ─────────────────────────────
  {
    key: 'expiry-wastage',
    title: 'Expiry & Wastage Report',
    description: 'Expired and near-expiry batches on hand, plus damage / expiry write-offs and van losses in the period.',
    icon: AlertTriangle,
    filters: ['warehouse', 'product'],
    dated: true,
    build: (db, f, { name, t }) => {
      const today = todayKey()
      const cost = costMap(db)
      const pOk = (id: ID) => !f.product || id === f.product
      const wOk = (id?: ID) => !f.warehouse || id === f.warehouse
      type Row = { kind: string; date: string; product: string; location: string; ref: string; kg: number; value: number; note: string }
      const rows: Row[] = []
      for (const b of db.batches) {
        if (b.qtyKg <= 0.001 || !pOk(b.productId) || !wOk(b.warehouseId)) continue
        const st = batchState(db, b)
        if (st === 'ok') continue
        const left = daysBetween(today, b.expiryDate)
        rows.push({ kind: st, date: b.expiryDate, product: name(db.products.find((p) => p.id === b.productId)), location: name(db.warehouses.find((w) => w.id === b.warehouseId)), ref: b.batchNo, kg: b.qtyKg, value: round2(b.qtyKg * b.unitCost), note: left < 0 ? t('Expired {n} days ago', { n: -left }) : t('{n} days left', { n: left }) })
      }
      for (const m of db.stockMovements) {
        if ((m.type !== 'damage' && m.type !== 'expired') || !inR(m.date, f) || !pOk(m.productId) || !wOk(m.warehouseId)) continue
        const b = db.batches.find((x) => x.id === m.batchId)
        rows.push({ kind: m.type === 'damage' ? 'Damage write-off' : 'Expiry write-off', date: m.date, product: name(db.products.find((p) => p.id === m.productId)), location: name(db.warehouses.find((w) => w.id === m.warehouseId)), ref: `${m.ref}${b ? ` · ${b.batchNo}` : ''}`, kg: -m.qtyKg, value: round2(-m.qtyKg * (b?.unitCost ?? cost[m.productId])), note: m.note ?? '' })
      }
      if (!f.warehouse)
        for (const l of db.stockLosses) {
          if (!inR(l.date, f) || !pOk(l.productId)) continue
          rows.push({ kind: 'Van loss', date: l.date, product: name(db.products.find((p) => p.id === l.productId)), location: `${name(db.drivers.find((d) => d.id === l.driverId))} · ${db.vehicles.find((v) => v.id === l.vehicleId)?.plateNo ?? ''}`, ref: l.ref, kg: l.qtyKg, value: round2(l.qtyKg * cost[l.productId]), note: l.reason })
        }
      rows.sort((a, b) => a.date.localeCompare(b.date))
      const wasted = rows.filter((r) => r.kind !== 'near_expiry')
      return {
        rows,
        cols: [
          status('kind', 'Category', (r: Row) => r.kind),
          { id: 'date', header: 'Date / expiry', value: (r) => r.date, fmt: 'date' },
          { id: 'product', header: 'Product', value: (r) => r.product },
          { id: 'location', header: 'Warehouse / van', value: (r) => r.location },
          { id: 'ref', header: 'Batch / reference', value: (r) => r.ref },
          { id: 'kg', header: 'KG', value: (r) => r.kg, fmt: 'kg' },
          { id: 'value', header: 'Value at cost', value: (r) => r.value, fmt: 'sar' },
          { id: 'note', header: 'Notes', value: (r) => r.note },
        ],
        summary: [
          { label: 'Expired on hand', value: fmtKg(sum(rows.filter((r) => r.kind === 'expired'), (r) => r.kg)) },
          { label: 'Near expiry', value: fmtKg(sum(rows.filter((r) => r.kind === 'near_expiry'), (r) => r.kg)) },
          { label: 'Written off & lost', value: fmtKg(sum(rows.filter((r) => !['expired', 'near_expiry'].includes(r.kind)), (r) => r.kg)) },
          { label: 'Wastage value', value: fmtSAR(sum(wasted, (r) => r.value)) },
        ],
      }
    },
  },
  // 10 ─────────────────────────────
  {
    key: 'landed-cost',
    title: 'Import Landed Cost Report',
    description: 'Goods value plus freight, customs and clearance per shipment, and landed cost per KG.',
    icon: Ship,
    filters: ['supplier'],
    dated: true,
    build: (db, f) => {
      const rows = db.shipments
        .filter((s) => inR(s.shipDate, f) && (!f.supplier || s.supplierId === f.supplier))
        .sort((a, b) => b.shipDate.localeCompare(a.shipDate))
        .map((s) => {
          const lc = landedCost(s)
          return {
            ref: s.ref, po: db.purchaseOrders.find((p) => p.id === s.poId)?.poNo ?? '', supplier: db.suppliers.find((x) => x.id === s.supplierId)?.name ?? '', origin: s.originCountry, container: s.containerNo, shipDate: s.shipDate,
            kg: lc.kg, goods: s.goodsValueSAR, freight: s.freightSAR, customs: s.customsSAR, clearance: s.clearanceSAR, total: lc.total, goodsKg: lc.kg ? s.goodsValueSAR / lc.kg : 0, extraKg: lc.extraPerKg, perKg: lc.perKg, status: s.status,
          }
        })
      const kg = sum(rows, (r) => r.kg), total = sum(rows, (r) => r.total), extra = sum(rows, (r) => r.freight + r.customs + r.clearance)
      return {
        rows,
        cols: [
          { id: 'ref', header: 'Import ref', value: (r) => r.ref },
          { id: 'po', header: 'PO', value: (r) => r.po },
          { id: 'supplier', header: 'Supplier', value: (r) => r.supplier },
          { id: 'origin', header: 'Origin', value: (r) => r.origin },
          { id: 'container', header: 'Container', value: (r) => r.container },
          { id: 'shipDate', header: 'Shipped', value: (r) => r.shipDate, fmt: 'date' },
          { id: 'kg', header: 'KG', value: (r) => r.kg, fmt: 'kg' },
          { id: 'goods', header: 'Goods value', value: (r) => r.goods, fmt: 'sar' },
          { id: 'freight', header: 'Freight', value: (r) => r.freight, fmt: 'sar' },
          { id: 'customs', header: 'Customs', value: (r) => r.customs, fmt: 'sar' },
          { id: 'clearance', header: 'Clearance', value: (r) => r.clearance, fmt: 'sar' },
          { id: 'total', header: 'Landed cost', value: (r) => r.total, fmt: 'sar' },
          { id: 'goodsKg', header: 'Goods / kg', value: (r) => round2(r.goodsKg), fmt: 'sar' },
          { id: 'extraKg', header: 'Charges / kg', value: (r) => r.extraKg, fmt: 'sar' },
          { id: 'perKg', header: 'Landed / kg', value: (r) => r.perKg, fmt: 'sar' },
          status('status', 'Status', (r: any) => r.status),
        ],
        summary: [
          { label: 'Shipments', value: fmtNum(rows.length) },
          { label: 'Total landed cost', value: fmtSAR(total) },
          { label: 'Import charges', value: fmtSAR(extra) },
          { label: 'Avg landed / kg', value: fmtSAR(kg ? total / kg : 0) },
        ],
      }
    },
  },
]

