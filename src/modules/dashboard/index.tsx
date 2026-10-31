/**
 * Executive dashboard: period KPIs, sales & collection trends, product mix, driver
 * collections, receivable ageing and today's operational queues.
 */
import { useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import {
  AlertTriangle, ArrowRight, Boxes, ClipboardCheck, HandCoins, LayoutDashboard, Scale, ShoppingCart, Store, TrendingUp, Truck, Users, Wallet, Warehouse,
} from 'lucide-react'
import { useStore } from '@/store/useStore'
import { useUI } from '@/store/useUI'
import { useT, useName } from '@/i18n'
import { EmptyState, KpiCard, Money, PageHeader, Panel, Picker, StatusBadge } from '@/components/common'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { CHART, ChartTip, Legend, axisProps, gridProps, sarTick } from '@/components/charts'
import { AGE_BUCKETS, ageingFor, batchState, poPayable, totalWarehouseKg, invoiceBalance } from '@/store/derive'
import { useStockSummary } from '@/store/selectors'
import { fmtDate, fmtDateShort, fmtKg, fmtMonth, fmtNum, fmtSAR, fmtTime, monthKey, todayKey, daysBetween } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { RangePreset } from '@/store/useUI'
import { RANGE_OPTIONS, daysIn, inRange, rangeBounds } from './range'

export default function Dashboard() {
  const t = useT()
  const name = useName()
  const nav = useNavigate()
  const db = useStore((s) => s.db)
  const range = useUI((s) => s.range)
  const setRange = useUI((s) => s.setRange)
  const stock = useStockSummary()
  const today = todayKey()
  const { from, to } = rangeBounds(range, today)

  const data = useMemo(() => {
    const liveInv = db.invoices.filter((i) => i.status !== 'void' && i.source !== 'opening')
    const pays = db.payments.filter((p) => p.verification !== 'rejected')
    const periodInv = liveInv.filter((i) => inRange(i.date, from, to))
    const periodPays = pays.filter((p) => inRange(p.date, from, to))
    const sales = periodInv.reduce((s, i) => s + i.total, 0)
    const collections = periodPays.reduce((s, p) => s + p.amount, 0)
    const outstanding = db.invoices.reduce((s, i) => s + invoiceBalance(i), 0)
    const payables = db.purchaseOrders.reduce((s, p) => s + poPayable(p), 0)
    const expiredKg = db.batches.filter((b) => b.expiryDate < today).reduce((s, b) => s + b.qtyKg, 0)
    const availableKg = totalWarehouseKg(db) - expiredKg
    const activeDriverIds = new Set(db.vanMovements.filter((m) => m.date === today).map((m) => m.driverId))
    const activeDrivers = db.drivers.filter((d) => d.status === 'on_duty' && activeDriverIds.has(d.id)).length
    const onDuty = db.drivers.filter((d) => d.status === 'on_duty').length
    const todayDel = db.deliveries.filter((d) => d.date === today)
    const pendingDel = todayDel.filter((d) => d.status === 'pending' || d.status === 'out_for_delivery')
    const pendingStl = db.settlements.filter((s) => ['submitted', 'under_review', 'verified'].includes(s.status))

    // daily sales vs collections (at least 7 days so the chart is meaningful)
    const chartFrom = range === 'today' ? rangeBounds('7d', today).from : from
    const daily = daysIn(chartFrom, to).map((d) => ({
      day: d,
      label: fmtDateShort(d),
      sales: liveInv.filter((i) => i.date === d).reduce((s, i) => s + i.total, 0),
      collections: pays.filter((p) => p.date === d).reduce((s, p) => s + p.amount, 0),
    }))

    // monthly trend: register archive before go-live, live invoices from go-live month
    const goLiveMonth = monthKey(db.settings.goLiveDate)
    const curMonth = monthKey(today)
    const monthly: { month: string; label: string; sales: number; archive: boolean; mtd: boolean }[] = db.archive
      .filter((a) => a.month < goLiveMonth)
      .map((a) => ({ month: a.month, label: fmtMonth(a.month), sales: a.sales, archive: true, mtd: false }))
    const liveMonths = [...new Set(liveInv.map((i) => monthKey(i.date)).filter((m) => m >= goLiveMonth))].sort()
    for (const m of liveMonths)
      monthly.push({ month: m, label: `${fmtMonth(m)}${m === curMonth ? ' (MTD)' : ''}`, sales: liveInv.filter((i) => monthKey(i.date) === m).reduce((s, i) => s + i.total, 0), archive: false, mtd: m === curMonth })

    // species mix (excl. VAT)
    const mix = { chicken: 0, mutton: 0 }
    for (const i of periodInv)
      for (const l of i.lines) {
        const p = db.products.find((x) => x.id === l.productId)
        if (p) mix[p.species] += l.qtyKg * l.price
      }

    // driver-wise collections
    const byDriver = db.drivers
      .map((d) => {
        const ps = periodPays.filter((p) => p.driverId === d.id)
        return { id: d.id, name: name(d).split(' ').slice(0, 2).join(' '), cash: ps.filter((p) => p.method === 'cash').reduce((s, p) => s + p.amount, 0), bank: ps.filter((p) => p.method === 'bank').reduce((s, p) => s + p.amount, 0) }
      })
      .filter((x) => x.cash + x.bank > 0)
      .sort((a, b) => b.cash + b.bank - (a.cash + a.bank))

    const ageing = ageingFor(db)
    const recent = [...liveInv].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 7)
    const todayCollections = db.drivers
      .map((d) => {
        const ps = pays.filter((p) => p.driverId === d.id && p.date === today)
        return { driver: d, count: ps.length, cash: ps.filter((p) => p.method === 'cash').reduce((s, p) => s + p.amount, 0), bank: ps.filter((p) => p.method === 'bank').reduce((s, p) => s + p.amount, 0) }
      })
      .filter((x) => x.count > 0)
    const alerts = db.batches
      .filter((b) => b.qtyKg > 0.01)
      .map((b) => ({ b, state: batchState(db, b) }))
      .filter((x) => x.state !== 'ok')
      .sort((a, b) => a.b.expiryDate.localeCompare(b.b.expiryDate))

    return { sales, collections, outstanding, payables, availableKg, activeDrivers, onDuty, pendingDel, todayDel, pendingStl, daily, monthly, mix, byDriver, ageing, recent, todayCollections, alerts, invCount: periodInv.length, payCount: periodPays.length }
  }, [db, from, to, today, name, range])

  const lowStock = stock.filter((s) => s.status !== 'ok')
  const rangeLabel = t(RANGE_OPTIONS.find((r) => r.value === range)!.label)
  const isToday = range === 'today'
  const mixData = [
    { name: t('Chicken'), value: data.mix.chicken, color: CHART.brand },
    { name: t('Mutton'), value: data.mix.mutton, color: CHART.navy },
  ]
  const mixTotal = data.mix.chicken + data.mix.mutton
  const ageColors = [CHART.brand, CHART.amber, '#e0702b', CHART.red]
  const ageData = AGE_BUCKETS.map((b, i) => ({ bucket: `${b} ${t('days')}`, value: data.ageing[b], color: ageColors[i] }))

  return (
    <div className="space-y-5">
      <PageHeader
        title="Dashboard"
        icon={LayoutDashboard}
        description="Live view of sales, collections, stock and distribution across all warehouses and drivers."
        actions={
          <div className="flex items-center gap-2">
            <span className="hidden text-[12px] text-muted-foreground sm:inline">{t('Date range')}</span>
            <Picker<RangePreset> value={range} onChange={setRange} options={RANGE_OPTIONS} className="h-9 w-40" />
          </div>
        }
      />

      <FlowStrip />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label={isToday ? "Today's Sales" : 'Sales'} value={<Money value={data.sales} />} sub={`${fmtNum(data.invCount)} ${t('invoices')} · ${rangeLabel}`} icon={TrendingUp} to="/sales?tab=invoices" />
        <KpiCard label={isToday ? "Today's Collections" : 'Collections'} value={<Money value={data.collections} />} sub={`${fmtNum(data.payCount)} ${t('receipts')} · ${rangeLabel}`} icon={HandCoins} tone="success" to="/collections" />
        <KpiCard label="Customer Outstanding" value={<Money value={data.outstanding} />} sub={`${fmtSAR(data.ageing['90+'])} ${t('over 90 days')}`} icon={Wallet} tone="warning" to="/accounts" alert={data.ageing['90+'] > 0} />
        <KpiCard label="Supplier Payables" value={<Money value={data.payables} />} sub={t('Approved & received POs')} icon={ShoppingCart} tone="navy" to="/accounts?tab=payables" />
        <KpiCard label="Available Inventory" value={fmtKg(data.availableKg, 0)} sub={`${lowStock.length} ${t('low-stock products')}`} icon={Boxes} tone="brand" to="/inventory" alert={lowStock.length > 0} />
        <KpiCard label="Active Drivers" value={`${data.activeDrivers} / ${data.onDuty}`} sub={t('On route today / on duty')} icon={Users} tone="info" to="/fleet" />
        <KpiCard label="Pending Deliveries" value={fmtNum(data.pendingDel.length)} sub={`${data.todayDel.length - data.pendingDel.length} ${t('of')} ${data.todayDel.length} ${t('stops completed today')}`} icon={Truck} tone="warning" to="/distribution" />
        <KpiCard label="Pending Settlements" value={fmtNum(data.pendingStl.length)} sub={t('Awaiting supervisor approval')} icon={Scale} tone={data.pendingStl.length ? 'danger' : 'neutral'} to="/settlement" alert={data.pendingStl.length > 0} />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Panel title="Daily sales vs collections" description={rangeLabel} className="xl:col-span-2" actions={<Legend items={[{ label: t('Sales'), color: CHART.brand }, { label: t('Collections'), color: CHART.navy }]} />}>
          <div className="h-64">
            <ResponsiveContainer>
              <AreaChart data={data.daily} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="gSales" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={CHART.brand} stopOpacity={0.25} />
                    <stop offset="100%" stopColor={CHART.brand} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="label" {...axisProps} interval="preserveStartEnd" minTickGap={16} />
                <YAxis {...axisProps} tickFormatter={sarTick} width={44} />
                <Tooltip content={<ChartTip money />} />
                <Area isAnimationActive={false} type="monotone" dataKey="sales" name={t('Sales')} stroke={CHART.brand} strokeWidth={2} fill="url(#gSales)" />
                <Area isAnimationActive={false} type="monotone" dataKey="collections" name={t('Collections')} stroke={CHART.navy} strokeWidth={2} fill="transparent" strokeDasharray="4 3" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        <Panel title="Chicken vs mutton sales" description={`${rangeLabel} · ${t('excl. VAT')}`}>
          {mixTotal > 0 ? (
            <div className="flex h-64 flex-col">
              <div className="relative min-h-0 flex-1">
                <ResponsiveContainer>
                  <PieChart>
                    <Pie isAnimationActive={false} data={mixData} dataKey="value" nameKey="name" innerRadius="58%" outerRadius="85%" paddingAngle={2} stroke="none">
                      {mixData.map((d) => <Cell key={d.name} fill={d.color} />)}
                    </Pie>
                    <Tooltip content={<ChartTip money />} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-[11px] text-muted-foreground">{t('Total')}</span>
                  <span className="text-[15px] font-bold tabular">{fmtSAR(mixTotal, { compact: true })}</span>
                </div>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {mixData.map((d) => (
                  <div key={d.name} className="rounded-lg border px-3 py-2">
                    <div className="flex items-center gap-1.5 text-[11.5px] text-muted-foreground"><span className="size-2 rounded-sm" style={{ background: d.color }} />{d.name}</div>
                    <div className="text-[13.5px] font-semibold tabular">{fmtNum((d.value / mixTotal) * 100)}% · {fmtSAR(d.value, { compact: true })}</div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <EmptyState className="h-64" title="No sales in this period" />
          )}
        </Panel>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Panel title="Monthly sales trend" description="Register archive before go-live, live ERP data after" className="xl:col-span-2" actions={<Legend items={[{ label: t('Register archive'), color: CHART.slate }, { label: t('Live ERP'), color: CHART.brand }]} />}>
          <div className="h-60">
            <ResponsiveContainer>
              <BarChart data={data.monthly} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="label" {...axisProps} interval={0} tick={{ ...axisProps.tick, fontSize: 10 }} />
                <YAxis {...axisProps} tickFormatter={sarTick} width={44} />
                <Tooltip content={<ChartTip money />} cursor={{ fill: 'rgba(8,127,91,0.06)' }} />
                <Bar isAnimationActive={false} dataKey="sales" name={t('Sales')} radius={[4, 4, 0, 0]} maxBarSize={34}>
                  {data.monthly.map((m) => <Cell key={m.month} fill={m.archive ? CHART.slate : m.mtd ? CHART.mint : CHART.brand} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        <Panel title="Customer outstanding ageing" description={`${t('Total')} ${fmtSAR(data.outstanding)}`} actions={<Link to="/accounts?tab=ageing" className="text-[12px] font-medium text-brand hover:underline">{t('View all')}</Link>}>
          <div className="h-60">
            <ResponsiveContainer>
              <BarChart data={ageData} layout="vertical" margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid stroke={CHART.grid} horizontal={false} />
                <XAxis type="number" {...axisProps} tickFormatter={sarTick} />
                <YAxis type="category" dataKey="bucket" {...axisProps} width={78} />
                <Tooltip content={<ChartTip money />} cursor={{ fill: 'rgba(20,40,63,0.05)' }} />
                <Bar isAnimationActive={false} dataKey="value" name={t('Outstanding')} radius={[0, 4, 4, 0]} maxBarSize={26}>
                  {ageData.map((a) => <Cell key={a.bucket} fill={a.color} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Panel title="Driver-wise collections" description={rangeLabel} actions={<Legend items={[{ label: t('Cash'), color: CHART.brand }, { label: t('Bank'), color: CHART.navy }]} />}>
          {data.byDriver.length ? (
            <div className="h-64">
              <ResponsiveContainer>
                <BarChart data={data.byDriver} layout="vertical" margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke={CHART.grid} horizontal={false} />
                  <XAxis type="number" {...axisProps} tickFormatter={sarTick} />
                  <YAxis type="category" dataKey="name" {...axisProps} width={100} />
                  <Tooltip content={<ChartTip money />} cursor={{ fill: 'rgba(20,40,63,0.05)' }} />
                  <Bar isAnimationActive={false} dataKey="cash" name={t('Cash')} stackId="a" fill={CHART.brand} maxBarSize={22} />
                  <Bar isAnimationActive={false} dataKey="bank" name={t('Bank')} stackId="a" fill={CHART.navy} radius={[0, 4, 4, 0]} maxBarSize={22} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState className="h-64" icon={HandCoins} title="No driver collections in this period" />
          )}
        </Panel>
        <Panel title="Today's driver collections" bodyClassName="p-0" actions={<Link to="/collections" className="text-[12px] font-medium text-brand hover:underline">{t('View all')}</Link>}>
          {data.todayCollections.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('Driver')}</TableHead>
                  <TableHead className="text-end">{t('Collected')} <span className="font-normal normal-case">(SAR)</span></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.todayCollections.map((r) => (
                  <TableRow key={r.driver.id} className="cursor-pointer" onClick={() => nav(`/fleet/drivers/${r.driver.id}`)}>
                    <TableCell>
                      <div className="font-medium">{name(r.driver)}</div>
                      <div className="text-[11px] text-muted-foreground">{r.count} {t('receipts')}</div>
                    </TableCell>
                    <TableCell className="text-end">
                      <div className="font-semibold tabular">{fmtNum(r.cash + r.bank)}</div>
                      <div className="text-[11px] text-muted-foreground tabular">{t('Cash')} {fmtNum(r.cash)} · {t('Bank')} {fmtNum(r.bank)}</div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <EmptyState className="m-4" icon={HandCoins} title="No collections recorded today" />
          )}
        </Panel>
        <Panel title="Pending deliveries today" bodyClassName="p-0" actions={<Link to="/distribution" className="text-[12px] font-medium text-brand hover:underline">{t('View all')}</Link>}>
          {data.pendingDel.length ? (
            <div className="divide-y">
              {data.pendingDel.slice(0, 7).map((d) => {
                const c = db.customers.find((x) => x.id === d.customerId)
                const drv = db.drivers.find((x) => x.id === d.driverId)
                const kg = d.lines.reduce((s, l) => s + l.orderedKg, 0)
                return (
                  <button key={d.id} onClick={() => nav('/distribution')} className="flex w-full items-center gap-3 px-4 py-2.5 text-start hover:bg-muted/40">
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-semibold">{d.routeSeq}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium">{name(c)}</span>
                      <span className="block truncate text-[11.5px] text-muted-foreground">{name(drv)} · {fmtKg(kg, 0)}</span>
                    </span>
                    <StatusBadge status={d.status} />
                  </button>
                )
              })}
            </div>
          ) : (
            <EmptyState className="m-4" icon={Truck} title="All deliveries completed" />
          )}
        </Panel>
      </div>

      <div className="grid gap-4 xl:grid-cols-5">
        <Panel title="Recent sales" className="xl:col-span-3" bodyClassName="p-0" actions={<Link to="/sales?tab=invoices" className="text-[12px] font-medium text-brand hover:underline">{t('View all')}</Link>}>
          {data.recent.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('Invoice')}</TableHead>
                  <TableHead>{t('Customer')}</TableHead>
                  <TableHead className="hidden md:table-cell">{t('Type')}</TableHead>
                  <TableHead className="text-end">{t('Total')}</TableHead>
                  <TableHead>{t('Status')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.recent.map((i) => (
                  <TableRow key={i.id} className="cursor-pointer" onClick={() => nav(`/sales?tab=invoices&q=${i.invNo}`)}>
                    <TableCell>
                      <div className="font-medium">{i.invNo}</div>
                      <div className="text-[11px] text-muted-foreground">{fmtDate(i.date)} · {fmtTime(i.createdAt)}</div>
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate">{name(db.customers.find((c) => c.id === i.customerId))}</TableCell>
                    <TableCell className="hidden md:table-cell"><StatusBadge status={i.source} /></TableCell>
                    <TableCell className="text-end font-medium tabular">{fmtSAR(i.total)}</TableCell>
                    <TableCell><StatusBadge status={i.status} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <EmptyState className="m-4" title="No sales yet" />
          )}
        </Panel>
        <Panel title="Low-stock & near-expiry" className="xl:col-span-2" icon={AlertTriangle} bodyClassName="p-0" actions={<Link to="/inventory" className="text-[12px] font-medium text-brand hover:underline">{t('View all')}</Link>}>
          {lowStock.length + data.alerts.length ? (
            <div className="max-h-[360px] divide-y overflow-y-auto">
              {lowStock.map((s) => (
                <button key={s.product.id} onClick={() => nav(`/inventory?product=${s.product.id}`)} className="flex w-full items-center gap-3 px-4 py-2.5 text-start hover:bg-muted/40">
                  <Warehouse className="size-4 shrink-0 text-warning" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium">{name(s.product)}</span>
                    <span className="block text-[11.5px] text-muted-foreground">{fmtKg(s.available, 0)} / {t('reorder at')} {fmtKg(s.product.reorderLevelKg, 0)}</span>
                  </span>
                  <StatusBadge status={s.status === 'out' ? 'out' : 'low'} label={s.status === 'out' ? t('Out of stock') : t('Low stock')} />
                </button>
              ))}
              {data.alerts.map(({ b, state }) => {
                const p = db.products.find((x) => x.id === b.productId)
                const left = daysBetween(today, b.expiryDate)
                return (
                  <button key={b.id} onClick={() => nav(`/inventory?product=${b.productId}`)} className="flex w-full items-center gap-3 px-4 py-2.5 text-start hover:bg-muted/40">
                    <ClipboardCheck className={cn('size-4 shrink-0', state === 'expired' ? 'text-danger' : 'text-warning')} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium">{name(p)}</span>
                      <span className="block truncate text-[11.5px] text-muted-foreground">
                        {b.batchNo} · {fmtKg(b.qtyKg, 0)} · {name(db.warehouses.find((w) => w.id === b.warehouseId))}
                      </span>
                    </span>
                    <span className="text-end">
                      <StatusBadge status={state} />
                      <span className="mt-0.5 block text-[11px] text-muted-foreground">{left < 0 ? t('{n} days ago', { n: -left }) : left === 0 ? t('expires today') : t('in {n} days', { n: left })}</span>
                    </span>
                  </button>
                )
              })}
            </div>
          ) : (
            <EmptyState className="m-4" icon={Boxes} title="Stock levels are healthy" />
          )}
        </Panel>
      </div>
    </div>
  )
}

/** compact strip of the primary business flow with live counters */
function FlowStrip() {
  const t = useT()
  const db = useStore((s) => s.db)
  const today = todayKey()
  const steps = [
    { label: 'Purchase / Import', to: '/purchases', icon: ShoppingCart, n: db.purchaseOrders.filter((p) => ['pending_approval', 'approved', 'partially_received'].includes(p.status)).length, hint: 'open POs' },
    { label: 'GRN', to: '/grn', icon: ClipboardCheck, n: db.grns.filter((g) => g.status === 'received' || g.status === 'qc_passed').length, hint: 'awaiting QC / approval' },
    { label: 'Warehouse', to: '/inventory', icon: Warehouse, n: db.batches.filter((b) => b.qtyKg > 0).length, hint: 'live batches' },
    { label: 'Van loading', to: '/distribution', icon: Truck, n: db.vanLoads.filter((l) => l.date === today).length, hint: 'slips today' },
    { label: 'Deliveries', to: '/distribution', icon: Store, n: db.deliveries.filter((d) => d.date === today && ['delivered', 'partial'].includes(d.status)).length, hint: 'delivered today' },
    { label: 'Collections', to: '/collections', icon: HandCoins, n: db.payments.filter((p) => p.date === today).length, hint: 'receipts today' },
    { label: 'Settlement', to: '/settlement', icon: Scale, n: db.settlements.filter((s) => s.date === today).length, hint: 'submitted today' },
  ]
  return (
    <div className="overflow-x-auto rounded-xl border bg-card scrollbar-thin">
      <div className="flex min-w-max items-stretch">
        {steps.map((s, i) => (
          <Link key={s.label} to={s.to} className="group flex items-center gap-2.5 px-4 py-3 hover:bg-muted/40">
            <span className="flex size-8 items-center justify-center rounded-lg bg-brand-soft text-brand"><s.icon className="size-4" /></span>
            <span className="leading-tight">
              <span className="block text-[12.5px] font-semibold text-brand-ink">{t(s.label)}</span>
              <span className="block text-[11px] text-muted-foreground"><span className="font-semibold text-foreground tabular">{s.n}</span> {t(s.hint)}</span>
            </span>
            {i < steps.length - 1 && <ArrowRight className="flip-rtl ms-2 size-3.5 text-muted-foreground/60" />}
          </Link>
        ))}
      </div>
    </div>
  )
}
