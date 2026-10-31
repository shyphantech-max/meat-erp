/**
 * All dashboard numbers in one memoised pass: period KPIs with the previous equal period,
 * trends, mixes, rankings, stock & expiry risk, receivables / payables timelines and alerts.
 */
import { useMemo } from 'react'
import type { BusinessType, DayKey, DB, ID } from '@/types'
import type { RangePreset } from '@/store/useUI'
import { AGE_BUCKETS, ageBucket, ageingFor, batchState, invoiceBalance, poPayable, totalWarehouseKg, vanStockByProduct, type AgeBucket } from '@/store/derive'
import { daysBetween, fmtDateShort, fmtMonth, monthKey, round2, shiftDay, todayKey } from '@/lib/format'
import { daysIn, inRange, rangeBounds } from './range'

const sum = <T,>(a: T[], f: (x: T) => number) => a.reduce((s, x) => s + f(x), 0)

/** previous period of equal length directly before [from, to] */
export function prevBounds(from: DayKey, to: DayKey) {
  const len = daysBetween(from, to) + 1
  return { from: shiftDay(from, -len), to: shiftDay(from, -1) }
}
export const pctChange = (cur: number, prev: number) => (prev > 0 ? ((cur - prev) / prev) * 100 : cur > 0 ? null : 0)

/** historical weighted-average landed cost per product (all receipts, consumed or not) */
function costMap(db: DB) {
  const acc: Record<ID, { q: number; v: number }> = {}
  for (const b of db.batches) {
    const a = (acc[b.productId] ??= { q: 0, v: 0 })
    a.q += b.initialKg
    a.v += b.initialKg * b.unitCost
  }
  const out: Record<ID, number> = {}
  for (const p of db.products) out[p.id] = acc[p.id]?.q ? acc[p.id].v / acc[p.id].q : p.costPrice
  return out
}

export function useDashboardData(db: DB, range: RangePreset) {
  return useMemo(() => {
    const today = todayKey()
    const { from, to } = rangeBounds(range, today)
    const prev = prevBounds(from, to)
    const cost = costMap(db)
    const prod = (id: ID) => db.products.find((p) => p.id === id)
    const cust = (id: ID) => db.customers.find((c) => c.id === id)

    const liveInv = db.invoices.filter((i) => i.status !== 'void' && i.source !== 'opening')
    const pays = db.payments.filter((p) => p.verification !== 'rejected')
    const invIn = (f: DayKey, t: DayKey) => liveInv.filter((i) => inRange(i.date, f, t))
    const payIn = (f: DayKey, t: DayKey) => pays.filter((p) => inRange(p.date, f, t))
    const retIn = (f: DayKey, t: DayKey) => db.salesReturns.filter((r) => inRange(r.date, f, t))

    /** revenue excl. VAT, cost of goods and KG for a set of invoices (net of returns in the same window) */
    const econ = (f: DayKey, t: DayKey) => {
      let revenue = 0, cogs = 0, kg = 0
      for (const i of invIn(f, t))
        for (const l of i.lines) {
          revenue += l.qtyKg * l.price
          cogs += l.qtyKg * (cost[l.productId] ?? 0)
          kg += l.qtyKg
        }
      for (const r of retIn(f, t))
        for (const l of r.lines) {
          revenue -= l.qtyKg * l.price
          cogs -= l.qtyKg * (cost[l.productId] ?? 0)
          kg -= l.qtyKg
        }
      const gp = revenue - cogs
      return { revenue, cogs, gp, kg, margin: revenue > 0 ? (gp / revenue) * 100 : 0 }
    }

    const periodInv = invIn(from, to)
    const periodPays = payIn(from, to)
    const cur = {
      sales: sum(periodInv, (i) => i.total),
      collections: sum(periodPays, (p) => p.amount),
      invCount: periodInv.length,
      payCount: periodPays.length,
      ...econ(from, to),
    }
    const prevInv = invIn(prev.from, prev.to)
    const prevPays = payIn(prev.from, prev.to)
    const before = { sales: sum(prevInv, (i) => i.total), collections: sum(prevPays, (p) => p.amount), ...econ(prev.from, prev.to) }

    // ── trend window: at least 14 days so sparklines and charts are meaningful
    const trendFrom = daysBetween(from, to) < 13 ? shiftDay(to, -13) : from
    const days = daysIn(trendFrom, to)
    const daily = days.map((d) => {
      const e = econ(d, d)
      return {
        day: d,
        label: fmtDateShort(d),
        sales: sum(liveInv.filter((i) => i.date === d), (i) => i.total),
        collections: sum(pays.filter((p) => p.date === d), (p) => p.amount),
        gp: round2(e.gp),
        kg: e.kg,
        margin: e.revenue > 0 ? round2((e.gp / e.revenue) * 100) : null,
      }
    })
    // gross-profit trend: daily up to ~5 weeks, weekly beyond
    const weekly = days.length > 35
    const gpTrend = weekly
      ? Array.from({ length: Math.ceil(days.length / 7) }, (_, k) => {
          const f = days[k * 7]
          const t = days[Math.min(days.length - 1, k * 7 + 6)]
          const e = econ(f, t)
          return { label: fmtDateShort(f), revenue: round2(e.revenue), gp: round2(e.gp), margin: e.revenue > 0 ? round2((e.gp / e.revenue) * 100) : null }
        })
      : days.map((d) => {
          const e = econ(d, d)
          return { label: fmtDateShort(d), revenue: round2(e.revenue), gp: round2(e.gp), margin: e.revenue > 0 ? round2((e.gp / e.revenue) * 100) : null }
        })

    // ── monthly trend: register archive before go-live, live invoices after
    const goLiveMonth = monthKey(db.settings.goLiveDate)
    const curMonth = monthKey(today)
    const monthly: { month: string; label: string; sales: number; archive: boolean; mtd: boolean }[] = db.archive
      .filter((a) => a.month < goLiveMonth)
      .map((a) => ({ month: a.month, label: fmtMonth(a.month), sales: a.sales, archive: true, mtd: false }))
    for (const m of [...new Set(liveInv.map((i) => monthKey(i.date)).filter((m) => m >= goLiveMonth))].sort())
      monthly.push({ month: m, label: `${fmtMonth(m)}${m === curMonth ? ' (MTD)' : ''}`, sales: sum(liveInv.filter((i) => monthKey(i.date) === m), (i) => i.total), archive: false, mtd: m === curMonth })

    // ── mixes & rankings for the period
    const species = { chicken: 0, mutton: 0 }
    const byProduct: Record<ID, { kg: number; revenue: number }> = {}
    const byCustomer: Record<ID, number> = {}
    const byType: Partial<Record<BusinessType, number>> = {}
    const payType = { cash: 0, credit: 0 }
    for (const i of periodInv) {
      byCustomer[i.customerId] = (byCustomer[i.customerId] ?? 0) + i.total
      const c = cust(i.customerId)
      if (c) byType[c.businessType] = (byType[c.businessType] ?? 0) + i.total
      payType[i.paymentType] += i.total
      for (const l of i.lines) {
        const p = prod(l.productId)
        if (p) species[p.species] += l.qtyKg * l.price
        const b = (byProduct[l.productId] ??= { kg: 0, revenue: 0 })
        b.kg += l.qtyKg
        b.revenue += l.qtyKg * l.price
      }
    }
    const topCustomers = Object.entries(byCustomer)
      .map(([id, v]) => ({ id, customer: cust(id)!, value: round2(v) }))
      .filter((x) => x.customer)
      .sort((a, b) => b.value - a.value)
      .slice(0, 10)
    const topProducts = Object.entries(byProduct)
      .map(([id, v]) => ({ id, product: prod(id)!, kg: v.kg, revenue: round2(v.revenue) }))
      .filter((x) => x.product)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 8)
    const businessTypes = (Object.entries(byType) as [BusinessType, number][]).map(([type, value]) => ({ type, value: round2(value) })).sort((a, b) => b.value - a.value)
    const collMethod = { cash: sum(periodPays.filter((p) => p.method === 'cash'), (p) => p.amount), bank: sum(periodPays.filter((p) => p.method === 'bank'), (p) => p.amount) }

    // ── driver collections
    const byDriver = db.drivers
      .map((d) => {
        const ps = periodPays.filter((p) => p.driverId === d.id)
        return { id: d.id, driver: d, cash: sum(ps.filter((p) => p.method === 'cash'), (p) => p.amount), bank: sum(ps.filter((p) => p.method === 'bank'), (p) => p.amount) }
      })
      .filter((x) => x.cash + x.bank > 0)
      .sort((a, b) => b.cash + b.bank - (a.cash + a.bank))
    const todayCollections = db.drivers
      .map((d) => {
        const ps = pays.filter((p) => p.driverId === d.id && p.date === today)
        return { driver: d, count: ps.length, cash: sum(ps.filter((p) => p.method === 'cash'), (p) => p.amount), bank: sum(ps.filter((p) => p.method === 'bank'), (p) => p.amount) }
      })
      .filter((x) => x.count > 0)

    // ── receivables now and over the last 8 weeks (balances rebuilt as of each week end)
    const outstanding = sum(db.invoices, invoiceBalance)
    const overdue = sum(db.invoices.filter((i) => i.dueDate < today), invoiceBalance)
    const ageing = ageingFor(db)
    const paidByInv: Record<ID, { date: DayKey; amount: number }[]> = {}
    for (const p of pays) for (const a of p.allocations) (paidByInv[a.invoiceId] ??= []).push({ date: p.date, amount: a.amount })
    const retByInv: Record<ID, { date: DayKey; amount: number }[]> = {}
    for (const r of db.salesReturns) (retByInv[r.invoiceId] ??= []).push({ date: r.date, amount: r.amount })
    const receivablesTrend = Array.from({ length: 8 }, (_, k) => {
      const asOf = shiftDay(today, -7 * (7 - k))
      const row: Record<string, number | string> = { label: fmtDateShort(asOf) }
      for (const b of AGE_BUCKETS) row[b] = 0
      for (const i of db.invoices) {
        if (i.status === 'void' || i.date > asOf) continue
        const paid = sum((paidByInv[i.id] ?? []).filter((x) => x.date <= asOf), (x) => x.amount)
        const ret = sum((retByInv[i.id] ?? []).filter((x) => x.date <= asOf), (x) => x.amount)
        const bal = Math.max(0, i.total - paid - ret)
        if (bal > 0.009) row[ageBucket(i.date, asOf)] = (row[ageBucket(i.date, asOf)] as number) + bal
      }
      for (const b of AGE_BUCKETS) row[b] = round2(row[b] as number)
      return row as { label: string } & Record<AgeBucket, number>
    })

    // ── supplier payables by due date (first GRN or expected date + supplier terms)
    const payables = sum(db.purchaseOrders, poPayable)
    const payBuckets = [
      { key: 'overdue', label: 'Overdue', value: 0 },
      { key: '0-30', label: '0-30 days', value: 0 },
      { key: '31-60', label: '31-60 days', value: 0 },
      { key: '61-90', label: '61-90 days', value: 0 },
      { key: '90+', label: '90+ days', value: 0 },
    ]
    for (const po of db.purchaseOrders) {
      const due = poPayable(po)
      if (due <= 0) continue
      const sup = db.suppliers.find((s) => s.id === po.supplierId)
      const firstGrn = db.grns.filter((g) => g.poId === po.id && g.status === 'approved').map((g) => g.receivedDate).sort()[0]
      const dueDate = shiftDay(firstGrn ?? po.expectedDate, sup?.paymentTermsDays ?? 30)
      const d = daysBetween(today, dueDate)
      payBuckets[d < 0 ? 0 : d <= 30 ? 1 : d <= 60 ? 2 : d <= 90 ? 3 : 4].value += due
    }
    for (const b of payBuckets) b.value = round2(b.value)
    const payDue30 = payBuckets[0].value + payBuckets[1].value

    // ── inventory: value by warehouse × category, expiry risk
    const live = db.batches.filter((b) => b.qtyKg > 0.0001)
    const expiredKg = sum(live.filter((b) => b.expiryDate < today), (b) => b.qtyKg)
    const availableKg = totalWarehouseKg(db) - expiredKg
    const stockValue = sum(live, (b) => b.qtyKg * b.unitCost)
    const stockByWh = db.warehouses.map((w) => {
      const row = { name: w.city, fresh: 0, chilled: 0, frozen: 0 }
      for (const b of live.filter((x) => x.warehouseId === w.id)) {
        const p = prod(b.productId)
        if (p) row[p.category] += round2(b.qtyKg * b.unitCost)
      }
      return row
    })
    const expiryRisk = [
      { key: 'expired', label: 'Expired', kg: 0 },
      { key: '7', label: '0-7 days', kg: 0 },
      { key: '30', label: '8-30 days', kg: 0 },
      { key: '90', label: '31-90 days', kg: 0 },
      { key: 'later', label: '90+ days', kg: 0 },
    ]
    for (const b of live) {
      const d = daysBetween(today, b.expiryDate)
      expiryRisk[d < 0 ? 0 : d <= 7 ? 1 : d <= 30 ? 2 : d <= 90 ? 3 : 4].kg += b.qtyKg
    }
    for (const e of expiryRisk) e.kg = round2(e.kg)

    // ── distribution today
    const todayDel = db.deliveries.filter((d) => d.date === today)
    const pendingDel = todayDel.filter((d) => d.status === 'pending' || d.status === 'out_for_delivery')
    const delStatus = {
      delivered: todayDel.filter((d) => d.status === 'delivered').length,
      partial: todayDel.filter((d) => d.status === 'partial').length,
      failed: todayDel.filter((d) => d.status === 'failed').length,
      pending: pendingDel.length,
    }
    const completed = todayDel.filter((d) => d.status === 'delivered' || d.status === 'partial')
    const orderedKg = sum(completed, (d) => sum(d.lines, (l) => l.orderedKg))
    const deliveredKg = sum(completed, (d) => sum(d.lines, (l) => l.deliveredKg))
    const fillRate = orderedKg > 0 ? (deliveredKg / orderedKg) * 100 : null
    const loadsToday = db.vanLoads.filter((l) => l.date === today)
    const loadedKgToday = sum(loadsToday, (l) => sum(l.lines, (x) => x.qtyKg))
    const kgOnVans = sum(db.drivers, (d) => sum(Object.values(vanStockByProduct(db, d.id)), (q) => q))
    const activeIds = new Set(db.vanMovements.filter((m) => m.date === today).map((m) => m.driverId))
    const onDuty = db.drivers.filter((d) => d.status === 'on_duty')
    const activeDrivers = onDuty.filter((d) => activeIds.has(d.id)).length
    const collectedToday = sum(pays.filter((p) => p.date === today), (p) => p.amount)
    const receiptsToday = pays.filter((p) => p.date === today).length
    const pendingStl = db.settlements.filter((s) => ['submitted', 'under_review', 'verified'].includes(s.status))
    const grnsToApprove = db.grns.filter((g) => g.status === 'received' || g.status === 'qc_passed').length
    const posToApprove = db.purchaseOrders.filter((p) => p.status === 'pending_approval').length
    const paymentsToVerify = db.payments.filter((p) => p.verification === 'pending').length

    // ── alerts
    type Alert = { key: string; severity: 'danger' | 'warning'; kind: 'credit' | 'expired' | 'variance' | 'overdue'; title: string; detail: string; to: string; amount?: number }
    const alerts: Alert[] = []
    for (const c of db.customers) {
      const out = sum(db.invoices.filter((i) => i.customerId === c.id), invoiceBalance)
      if (c.creditLimit > 0 && out > c.creditLimit)
        alerts.push({ key: `cl-${c.id}`, severity: 'danger', kind: 'credit', title: c.id, detail: `${round2(out)}|${c.creditLimit}`, to: `/customers/${c.id}`, amount: out - c.creditLimit })
    }
    const expiredByProduct: Record<ID, number> = {}
    for (const b of live) if (b.expiryDate < today) expiredByProduct[b.productId] = (expiredByProduct[b.productId] ?? 0) + b.qtyKg
    for (const [pid, kg] of Object.entries(expiredByProduct)) alerts.push({ key: `ex-${pid}`, severity: 'danger', kind: 'expired', title: pid, detail: String(round2(kg)), to: `/inventory?tab=batches&product=${pid}`, amount: kg })
    const tol = db.settings.cashVarianceToleranceSAR
    for (const s of db.settlements)
      if (s.status !== 'closed' && s.status !== 'rejected' && (Math.abs(s.cashVariance) > tol || Math.abs(s.stockDiscrepancyKg) > 0.5))
        alerts.push({ key: `sv-${s.id}`, severity: Math.abs(s.cashVariance) > tol * 3 ? 'danger' : 'warning', kind: 'variance', title: s.driverId, detail: `${s.settlementNo}|${s.cashVariance}|${s.stockDiscrepancyKg}`, to: `/settlement?id=${s.id}`, amount: Math.abs(s.cashVariance) })
    const overdue60: Record<ID, { amount: number; count: number; oldest: number }> = {}
    for (const i of db.invoices) {
      const bal = invoiceBalance(i)
      const age = daysBetween(i.date, today)
      if (bal > 0 && age > 60) {
        const o = (overdue60[i.customerId] ??= { amount: 0, count: 0, oldest: 0 })
        o.amount += bal
        o.count++
        o.oldest = Math.max(o.oldest, age)
      }
    }
    for (const [cid, o] of Object.entries(overdue60))
      alerts.push({ key: `od-${cid}`, severity: o.oldest > 90 ? 'danger' : 'warning', kind: 'overdue', title: cid, detail: `${round2(o.amount)}|${o.count}|${o.oldest}`, to: `/customers/${cid}`, amount: o.amount })
    alerts.sort((a, b) => (a.severity === b.severity ? (b.amount ?? 0) - (a.amount ?? 0) : a.severity === 'danger' ? -1 : 1))

    const recent = [...liveInv].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 7)
    const batchAlerts = live
      .map((b) => ({ b, state: batchState(db, b) }))
      .filter((x) => x.state !== 'ok')
      .sort((a, b) => a.b.expiryDate.localeCompare(b.b.expiryDate))

    return {
      today, from, to, prev, cur, before, daily, gpTrend, weekly, monthly, species, topCustomers, topProducts, businessTypes, payType, collMethod,
      byDriver, todayCollections, outstanding, overdue, ageing, receivablesTrend, payables, payBuckets, payDue30,
      expiredKg, availableKg, stockValue, stockByWh, expiryRisk, todayDel, pendingDel, delStatus, fillRate, loadsToday, loadedKgToday, kgOnVans,
      activeDrivers, onDuty: onDuty.length, collectedToday, receiptsToday, pendingStl, grnsToApprove, posToApprove, paymentsToVerify, alerts, recent, batchAlerts,
    }
  }, [db, range])
}
export type DashboardData = ReturnType<typeof useDashboardData>
