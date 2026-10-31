/**
 * Executive dashboard: today at a glance, period KPIs with trend vs the previous period,
 * sales / profit / collection analytics, customer & product rankings, receivables and
 * payables timelines, stock value & expiry risk, distribution performance and alerts.
 */
import { useNavigate } from 'react-router-dom'
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ComposedChart, Line, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import {
  AlertTriangle, BadgePercent, Bell, Boxes, ClipboardCheck, CreditCard, HandCoins, LayoutDashboard, PackageCheck, Scale, ShieldAlert, ShoppingCart, Truck, Users, Wallet,
  Warehouse, Weight, TrendingUp, FileWarning, Timer,
} from 'lucide-react'
import { useStore } from '@/store/useStore'
import { useUI, type RangePreset } from '@/store/useUI'
import { useT, useName } from '@/i18n'
import { EmptyState, PageHeader, Panel, Picker, StatusBadge } from '@/components/common'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { CHART, ChartTip, Legend, axisProps, gridProps, sarTick } from '@/components/charts'
import { AGE_BUCKETS } from '@/store/derive'
import { useStockSummary } from '@/store/selectors'
import { daysBetween, fmtDate, fmtKg, fmtNum, fmtSAR, fmtTime } from '@/lib/format'
import { cn } from '@/lib/utils'
import { RANGE_OPTIONS } from './range'
import { pctChange, useDashboardData, type DashboardData } from './data'
import { ChartBox, Gauge, GlanceTile, HeroKpi, MiniKpi, MixBar, ViewAll, shortName } from './widgets'

const AGE_COLORS = [CHART.brand, CHART.amber, '#e0702b', CHART.red]
const TYPE_COLORS = [CHART.brand, CHART.maroon, CHART.mint, CHART.amber, '#2f6fb3', CHART.slate]
const CAT_COLORS = { fresh: CHART.brand, chilled: CHART.mint, frozen: '#2f6fb3' }
const RISK_COLORS = [CHART.red, '#e0702b', CHART.amber, CHART.mint, CHART.brand]
const compact = (n: number) => fmtSAR(n, { compact: true })

export default function Dashboard() {
  const t = useT()
  const db = useStore((s) => s.db)
  const range = useUI((s) => s.range)
  const setRange = useUI((s) => s.setRange)
  const d = useDashboardData(db, range)
  const stock = useStockSummary()
  const lowStock = stock.filter((s) => s.status !== 'ok')
  const rangeLabel = t(RANGE_OPTIONS.find((r) => r.value === range)!.label)
  const vsLabel = t('vs previous period')

  return (
    <div className="space-y-4 sm:space-y-5">
      <PageHeader
        title="Dashboard"
        icon={LayoutDashboard}
        description="Live view of sales, collections, stock and distribution across all warehouses and drivers."
        actions={
          <div className="flex w-full items-center gap-2 sm:w-auto">
            <span className="hidden text-[12px] text-muted-foreground sm:inline">{t('Date range')}</span>
            <Picker<RangePreset> value={range} onChange={setRange} options={RANGE_OPTIONS} className="h-9 w-full sm:w-40" />
          </div>
        }
      />

      <TodayGlance d={d} />

      {/* headline KPIs with trend */}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <HeroKpi label="Sales" full={fmtSAR(d.cur.sales)} compact={compact(d.cur.sales)} delta={pctChange(d.cur.sales, d.before.sales)} sub={`${fmtNum(d.cur.invCount)} ${t('invoices')}`} spark={d.daily.map((x) => ({ v: x.sales }))} color={CHART.brand} icon={TrendingUp} to="/sales?tab=invoices" />
        <HeroKpi label="Collections" full={fmtSAR(d.cur.collections)} compact={compact(d.cur.collections)} delta={pctChange(d.cur.collections, d.before.collections)} sub={`${fmtNum(d.cur.payCount)} ${t('receipts')}`} spark={d.daily.map((x) => ({ v: x.collections }))} color={CHART.maroon} icon={HandCoins} tone="maroon" to="/collections" />
        <HeroKpi label="Gross profit" full={fmtSAR(d.cur.gp)} compact={compact(d.cur.gp)} delta={pctChange(d.cur.gp, d.before.gp)} sub={`${t('Margin')} ${fmtNum(d.cur.margin, 1)}%`} spark={d.daily.map((x) => ({ v: x.gp }))} color={CHART.mint} icon={BadgePercent} tone="success" to="/reports?r=profitability" />
        <HeroKpi label="KG sold" full={fmtKg(d.cur.kg, 0)} compact={fmtKg(d.cur.kg, 0)} delta={pctChange(d.cur.kg, d.before.kg)} sub={rangeLabel} spark={d.daily.map((x) => ({ v: x.kg }))} color={CHART.amber} icon={Weight} tone="warning" to="/reports?r=daily-sales" />
      </div>
      <p className="-mt-2 text-[11px] text-muted-foreground">{rangeLabel} · {vsLabel} ({fmtDate(d.prev.from)} - {fmtDate(d.prev.to)})</p>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MiniKpi label="Customer Outstanding" value={<span className="block truncate">{compact(d.outstanding)}</span>} sub={`${t('Overdue')} ${fmtSAR(d.overdue, { compact: true })} · 90+ ${fmtSAR(d.ageing['90+'], { compact: true })}`} icon={Wallet} tone="warning" to="/accounts" alert={d.ageing['90+'] > 0} />
        <MiniKpi label="Supplier Payables" value={compact(d.payables)} sub={`${t('Due in 30 days')} ${fmtSAR(d.payDue30, { compact: true })}`} icon={ShoppingCart} tone="maroon" to="/accounts?tab=payables" />
        <MiniKpi label="Available Inventory" value={fmtKg(d.availableKg, 0)} sub={`${t('Value')} ${fmtSAR(d.stockValue, { compact: true })} · ${lowStock.length} ${t('low-stock products')}`} icon={Boxes} tone="brand" to="/inventory" alert={lowStock.length > 0} />
        <MiniKpi label="Active Drivers" value={`${d.activeDrivers} / ${d.onDuty}`} sub={t('On route today / on duty')} icon={Users} tone="info" to="/fleet" />
      </div>

      {/* sales trend + alerts */}
      <div className="grid gap-4 xl:grid-cols-3">
        <Panel title="Daily sales vs collections" description={rangeLabel} className="xl:col-span-2" actions={<Legend items={[{ label: t('Sales'), color: CHART.brand }, { label: t('Collections'), color: CHART.maroon }]} />}>
          <ChartBox>
            <ResponsiveContainer>
              <AreaChart data={d.daily} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="gSales" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={CHART.brand} stopOpacity={0.25} />
                    <stop offset="100%" stopColor={CHART.brand} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="label" {...axisProps} interval="preserveStartEnd" minTickGap={18} />
                <YAxis {...axisProps} tickFormatter={sarTick} width={42} />
                <Tooltip content={<ChartTip money />} />
                <Area isAnimationActive={false} type="monotone" dataKey="sales" name={t('Sales')} stroke={CHART.brand} strokeWidth={2} fill="url(#gSales)" />
                <Area isAnimationActive={false} type="monotone" dataKey="collections" name={t('Collections')} stroke={CHART.maroon} strokeWidth={2} fill="transparent" strokeDasharray="4 3" />
              </AreaChart>
            </ResponsiveContainer>
          </ChartBox>
        </Panel>
        <AlertsPanel d={d} />
      </div>

      {/* profit + collection efficiency */}
      <div className="grid gap-4 xl:grid-cols-3">
        <Panel title="Gross profit & margin" description={`${d.weekly ? t('Weekly') : t('Daily')} · ${t('excl. VAT, net of returns')}`} className="xl:col-span-2" actions={<Legend items={[{ label: t('Revenue'), color: CHART.slate }, { label: t('Gross profit'), color: CHART.brand }, { label: t('Margin %'), color: CHART.maroon }]} />}>
          <ChartBox>
            <ResponsiveContainer>
              <ComposedChart data={d.gpTrend} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="label" {...axisProps} interval="preserveStartEnd" minTickGap={18} />
                <YAxis yAxisId="sar" {...axisProps} tickFormatter={sarTick} width={42} />
                <YAxis yAxisId="pct" orientation="right" {...axisProps} tickFormatter={(v: number) => `${v}%`} width={36} domain={[0, 'auto']} />
                <Tooltip content={<GpTip />} />
                <Bar isAnimationActive={false} yAxisId="sar" dataKey="revenue" name={t('Revenue')} fill={CHART.slate} fillOpacity={0.35} radius={[3, 3, 0, 0]} maxBarSize={22} />
                <Bar isAnimationActive={false} yAxisId="sar" dataKey="gp" name={t('Gross profit')} fill={CHART.brand} radius={[3, 3, 0, 0]} maxBarSize={22} />
                <Line isAnimationActive={false} yAxisId="pct" type="monotone" dataKey="margin" name={t('Margin %')} stroke={CHART.maroon} strokeWidth={2} dot={{ r: 2 }} connectNulls />
              </ComposedChart>
            </ResponsiveContainer>
          </ChartBox>
        </Panel>
        <Panel title="Collection efficiency" description={`${rangeLabel} · ${t('collected ÷ sales')}`}>
          <Gauge value={d.cur.sales > 0 ? (d.cur.collections / d.cur.sales) * 100 : null} color={CHART.brand} label="Collected vs billed" sub={`${compact(d.cur.collections)} / ${compact(d.cur.sales)}`} />
          <div className="mt-2 space-y-4">
            <MixBar title="Sales by payment type" format={compact} parts={[{ label: 'Cash', value: d.payType.cash, color: CHART.brand }, { label: 'Credit', value: d.payType.credit, color: CHART.maroon }]} />
            <MixBar title="Collections by method" format={compact} parts={[{ label: 'Cash', value: d.collMethod.cash, color: CHART.mint }, { label: 'Bank transfer', value: d.collMethod.bank, color: '#2f6fb3' }]} />
          </div>
        </Panel>
      </div>

      {/* rankings & mix */}
      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <TopCustomers d={d} />
        <TopProducts d={d} />
        <BusinessTypes d={d} />
      </div>

      {/* monthly + species */}
      <div className="grid gap-4 xl:grid-cols-3">
        <Panel title="Monthly sales trend" description="Register archive before go-live, live ERP data after" className="xl:col-span-2" actions={<Legend items={[{ label: t('Register archive'), color: CHART.slate }, { label: t('Live ERP'), color: CHART.brand }]} />}>
          <ChartBox>
            <ResponsiveContainer>
              <BarChart data={d.monthly} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="label" {...axisProps} interval="preserveStartEnd" minTickGap={8} tick={{ ...axisProps.tick, fontSize: 10 }} />
                <YAxis {...axisProps} tickFormatter={sarTick} width={42} />
                <Tooltip content={<ChartTip money />} cursor={{ fill: 'rgba(4,122,63,0.06)' }} />
                <Bar isAnimationActive={false} dataKey="sales" name={t('Sales')} radius={[4, 4, 0, 0]} maxBarSize={32}>
                  {d.monthly.map((m) => <Cell key={m.month} fill={m.archive ? CHART.slate : m.mtd ? CHART.mint : CHART.brand} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartBox>
        </Panel>
        <SpeciesMix d={d} rangeLabel={rangeLabel} />
      </div>

      {/* receivables & payables */}
      <div className="grid gap-4 xl:grid-cols-3">
        <Panel title="Receivables trend by age" description="Outstanding balance at each week end (last 8 weeks)" className="xl:col-span-2" actions={<Legend items={AGE_BUCKETS.map((b, i) => ({ label: `${b} ${t('days')}`, color: AGE_COLORS[i] }))} />}>
          <ChartBox>
            <ResponsiveContainer>
              <BarChart data={d.receivablesTrend} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="label" {...axisProps} interval="preserveStartEnd" minTickGap={10} />
                <YAxis {...axisProps} tickFormatter={sarTick} width={42} />
                <Tooltip content={<ChartTip money />} cursor={{ fill: 'rgba(4,122,63,0.06)' }} />
                {AGE_BUCKETS.map((b, i) => (
                  <Bar isAnimationActive={false} key={b} dataKey={b} name={`${b} ${t('days')}`} stackId="a" fill={AGE_COLORS[i]} maxBarSize={34} radius={i === AGE_BUCKETS.length - 1 ? [4, 4, 0, 0] : undefined} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </ChartBox>
        </Panel>
        <Panel title="Customer outstanding ageing" description={`${t('Total')} ${fmtSAR(d.outstanding)}`} actions={<ViewAll to="/accounts?tab=ageing" />}>
          <ChartBox>
            <ResponsiveContainer>
              <BarChart data={AGE_BUCKETS.map((b, i) => ({ bucket: `${b} ${t('days')}`, value: d.ageing[b], color: AGE_COLORS[i] }))} layout="vertical" margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid stroke={CHART.grid} horizontal={false} />
                <XAxis type="number" {...axisProps} tickFormatter={sarTick} />
                <YAxis type="category" dataKey="bucket" {...axisProps} width={74} />
                <Tooltip content={<ChartTip money />} cursor={{ fill: 'rgba(4,122,63,0.05)' }} />
                <Bar isAnimationActive={false} dataKey="value" name={t('Outstanding')} radius={[0, 4, 4, 0]} maxBarSize={26}>
                  {AGE_BUCKETS.map((b, i) => <Cell key={b} fill={AGE_COLORS[i]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartBox>
        </Panel>
      </div>

      {/* stock & payables */}
      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <Panel title="Stock value by warehouse" description={`${t('Total')} ${fmtSAR(d.stockValue)}`} actions={<Legend items={[{ label: t('Fresh'), color: CAT_COLORS.fresh }, { label: t('Chilled'), color: CAT_COLORS.chilled }, { label: t('Frozen'), color: CAT_COLORS.frozen }]} />}>
          <ChartBox>
            <ResponsiveContainer>
              <BarChart data={d.stockByWh.map((w) => ({ ...w, name: t(w.name) }))} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="name" {...axisProps} />
                <YAxis {...axisProps} tickFormatter={sarTick} width={42} />
                <Tooltip content={<ChartTip money />} cursor={{ fill: 'rgba(4,122,63,0.06)' }} />
                <Bar isAnimationActive={false} dataKey="frozen" name={t('Frozen')} stackId="a" fill={CAT_COLORS.frozen} maxBarSize={56} />
                <Bar isAnimationActive={false} dataKey="chilled" name={t('Chilled')} stackId="a" fill={CAT_COLORS.chilled} maxBarSize={56} />
                <Bar isAnimationActive={false} dataKey="fresh" name={t('Fresh')} stackId="a" fill={CAT_COLORS.fresh} radius={[4, 4, 0, 0]} maxBarSize={56} />
              </BarChart>
            </ResponsiveContainer>
          </ChartBox>
        </Panel>
        <Panel title="Expiry risk" description={`${fmtKg(d.expiryRisk.reduce((s, e) => s + e.kg, 0), 0)} ${t('on hand')}`} actions={<ViewAll to="/inventory?tab=batches" />}>
          <ChartBox>
            <ResponsiveContainer>
              <BarChart data={d.expiryRisk.map((e) => ({ ...e, label: t(e.label) }))} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="label" {...axisProps} interval={0} tick={{ ...axisProps.tick, fontSize: 10 }} />
                <YAxis {...axisProps} tickFormatter={(v: number) => (v >= 1000 ? `${fmtNum(v / 1000, 0)}K` : fmtNum(v))} width={38} />
                <Tooltip content={<ChartTip unit="kg" />} cursor={{ fill: 'rgba(4,122,63,0.06)' }} />
                <Bar isAnimationActive={false} dataKey="kg" name={t('Stock (KG)')} radius={[4, 4, 0, 0]} maxBarSize={44}>
                  {d.expiryRisk.map((e, i) => <Cell key={e.key} fill={RISK_COLORS[i]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartBox>
        </Panel>
        <Panel title="Supplier payables due" description={`${t('Total')} ${fmtSAR(d.payables)}`} className="lg:col-span-2 xl:col-span-1" actions={<ViewAll to="/accounts?tab=payables" />}>
          <ChartBox>
            <ResponsiveContainer>
              <BarChart data={d.payBuckets.map((b) => ({ ...b, label: t(b.label) }))} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="label" {...axisProps} interval={0} tick={{ ...axisProps.tick, fontSize: 10 }} />
                <YAxis {...axisProps} tickFormatter={sarTick} width={42} />
                <Tooltip content={<ChartTip money />} cursor={{ fill: 'rgba(4,122,63,0.06)' }} />
                <Bar isAnimationActive={false} dataKey="value" name={t('Payable')} radius={[4, 4, 0, 0]} maxBarSize={44}>
                  {d.payBuckets.map((b, i) => <Cell key={b.key} fill={i === 0 ? CHART.red : i === 1 ? CHART.amber : CHART.maroon} fillOpacity={i > 1 ? 0.55 + 0.15 * (4 - i) : 1} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartBox>
        </Panel>
      </div>

      {/* distribution */}
      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <DeliveryPerformance d={d} />
        <PendingDeliveries d={d} />
        <DriverCollections d={d} rangeLabel={rangeLabel} />
      </div>

      <div className="grid gap-4 xl:grid-cols-5">
        <RecentSales d={d} />
        <StockAlerts d={d} lowStock={lowStock} />
      </div>
    </div>
  )
}

// ───────────── sections ─────────────

function TodayGlance({ d }: { d: DashboardData }) {
  const t = useT()
  const done = d.todayDel.length - d.pendingDel.length
  return (
    <div>
      <div className="mb-2 flex items-center gap-2 text-[12px] font-semibold tracking-wide text-muted-foreground uppercase">
        <Timer className="size-3.5" /> {t('Today at a glance')}
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-7">
        <GlanceTile label="Van loads" value={fmtNum(d.loadsToday.length)} hint={fmtKg(d.loadedKgToday, 0)} icon={Truck} to="/distribution?tab=loading" />
        <GlanceTile label="KG on vans" value={fmtKg(d.kgOnVans, 0)} hint={t('across all vans')} icon={PackageCheck} to="/distribution?tab=vanstock" />
        <GlanceTile label="Stops" value={`${done} / ${d.todayDel.length}`} hint={`${d.pendingDel.length} ${t('pending')}`} icon={ClipboardCheck} to="/distribution?tab=routes" highlight={d.pendingDel.length > 0} />
        <GlanceTile label="Collected today" value={compact(d.collectedToday)} hint={`${d.receiptsToday} ${t('receipts')}`} icon={HandCoins} to="/collections" />
        <GlanceTile label="Settlements pending" value={fmtNum(d.pendingStl.length)} hint={t('Awaiting supervisor approval')} icon={Scale} to="/settlement" highlight={d.pendingStl.length > 0} />
        <GlanceTile label="GRNs to approve" value={fmtNum(d.grnsToApprove)} hint={t('awaiting QC / approval')} icon={Warehouse} to="/grn" highlight={d.grnsToApprove > 0} />
        <GlanceTile label="POs to approve" value={fmtNum(d.posToApprove)} hint={`${d.paymentsToVerify} ${t('payments to verify')}`} icon={ShoppingCart} to="/purchases?tab=orders" highlight={d.posToApprove > 0} />
      </div>
    </div>
  )
}

function AlertsPanel({ d }: { d: DashboardData }) {
  const t = useT()
  const name = useName()
  const nav = useNavigate()
  const db = useStore((s) => s.db)
  const icon = { credit: CreditCard, expired: FileWarning, variance: Scale, overdue: AlertTriangle }
  const text = (a: DashboardData['alerts'][number]) => {
    const parts = a.detail.split('|')
    if (a.kind === 'credit') return { title: name(db.customers.find((c) => c.id === a.title)), body: t('Over credit limit: {out} of {limit}', { out: fmtSAR(+parts[0], { compact: true }), limit: fmtSAR(+parts[1], { compact: true }) }) }
    if (a.kind === 'expired') return { title: name(db.products.find((p) => p.id === a.title)), body: t('{kg} expired in stock - write off', { kg: fmtKg(+parts[0], 0) }) }
    if (a.kind === 'variance')
      return { title: name(db.drivers.find((x) => x.id === a.title)), body: t('{no}: cash {cash}, stock {kg}', { no: parts[0], cash: fmtSAR(+parts[1]), kg: fmtKg(+parts[2], 1) }) }
    return { title: name(db.customers.find((c) => c.id === a.title)), body: t('{amount} overdue on {n} invoice(s), oldest {days} days', { amount: fmtSAR(+parts[0], { compact: true }), n: parts[1], days: parts[2] }) }
  }
  return (
    <Panel
      title={<span className="flex items-center gap-2">{t('Needs attention')} {d.alerts.length > 0 && <span className="rounded-full bg-red px-1.5 text-[11px] leading-5 font-bold text-white">{d.alerts.length}</span>}</span>}
      icon={ShieldAlert}
      bodyClassName="p-0"
    >
      {d.alerts.length ? (
        <div className="max-h-[300px] divide-y overflow-y-auto sm:max-h-[256px]">
          {d.alerts.map((a) => {
            const I = icon[a.kind]
            const x = text(a)
            return (
              <button key={a.key} onClick={() => nav(a.to)} className="flex w-full items-start gap-3 px-4 py-2.5 text-start hover:bg-muted/40">
                <span className={cn('mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg', a.severity === 'danger' ? 'bg-danger-soft text-danger' : 'bg-warning-soft text-warning')}><I className="size-3.5" /></span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium">{x.title}</span>
                  <span className="block text-[11.5px] leading-snug text-muted-foreground">{x.body}</span>
                </span>
              </button>
            )
          })}
        </div>
      ) : (
        <EmptyState className="m-4" icon={Bell} title="Nothing needs attention" />
      )}
    </Panel>
  )
}

function TopCustomers({ d }: { d: DashboardData }) {
  const t = useT()
  const name = useName()
  const nav = useNavigate()
  const rows = d.topCustomers.map((c) => ({ id: c.id, name: shortName(name(c.customer), 18), value: c.value }))
  return (
    <Panel title="Top 10 customers" description={t('By sales incl. VAT')} actions={<ViewAll to="/customers" />}>
      {rows.length ? (
        <div className="h-[300px]">
          <ResponsiveContainer>
            <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 12, left: 0, bottom: 0 }} onClick={(e: any) => { const id = e?.activePayload?.[0]?.payload?.id; if (id) nav(`/customers/${id}`) }}>
              <CartesianGrid stroke={CHART.grid} horizontal={false} />
              <XAxis type="number" {...axisProps} tickFormatter={sarTick} />
              <YAxis type="category" dataKey="name" {...axisProps} width={118} tick={{ ...axisProps.tick, fontSize: 10.5 }} interval={0} />
              <Tooltip content={<ChartTip money />} cursor={{ fill: 'rgba(4,122,63,0.06)' }} />
              <Bar isAnimationActive={false} dataKey="value" name={t('Sales')} fill={CHART.brand} radius={[0, 4, 4, 0]} maxBarSize={18} className="cursor-pointer" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <EmptyState className="h-[300px]" title="No sales in this period" />
      )}
    </Panel>
  )
}

function TopProducts({ d }: { d: DashboardData }) {
  const t = useT()
  const name = useName()
  const nav = useNavigate()
  const max = Math.max(1, ...d.topProducts.map((p) => p.revenue))
  return (
    <Panel title="Top products" description={t('By revenue excl. VAT')} bodyClassName="p-0" actions={<ViewAll to="/reports?r=profitability" />}>
      {d.topProducts.length ? (
        <div className="divide-y">
          {d.topProducts.map((p, i) => (
            <button key={p.id} onClick={() => nav(`/inventory?product=${p.id}`)} className="block w-full px-4 py-2 text-start hover:bg-muted/40">
              <div className="flex items-center gap-2">
                <span className="w-4 shrink-0 text-[11px] font-semibold text-muted-foreground tabular">{i + 1}</span>
                <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium">{name(p.product)}</span>
                <span className="shrink-0 text-[12px] font-semibold tabular">{compact(p.revenue)}</span>
              </div>
              <div className="mt-1 flex items-center gap-2 ps-6">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full" style={{ width: `${(p.revenue / max) * 100}%`, background: p.product.species === 'chicken' ? CHART.brand : CHART.maroon }} />
                </div>
                <span className="w-16 shrink-0 text-end text-[11px] text-muted-foreground tabular">{fmtKg(p.kg, 0)}</span>
              </div>
            </button>
          ))}
        </div>
      ) : (
        <EmptyState className="m-4" title="No sales in this period" />
      )}
    </Panel>
  )
}

function BusinessTypes({ d }: { d: DashboardData }) {
  const t = useT()
  const total = d.businessTypes.reduce((s, x) => s + x.value, 0)
  const label = (k: string) => t(k.charAt(0).toUpperCase() + k.slice(1))
  return (
    <Panel title="Sales by customer type" description={t('Restaurants, hotels, supermarkets, wholesale, catering')} className="lg:col-span-2 xl:col-span-1">
      {total > 0 ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center xl:flex-col xl:items-stretch">
          <div className="relative h-[190px] sm:w-1/2 xl:w-full">
            <ResponsiveContainer>
              <PieChart>
                <Pie isAnimationActive={false} data={d.businessTypes.map((x) => ({ name: label(x.type), value: x.value }))} dataKey="value" nameKey="name" innerRadius="58%" outerRadius="88%" paddingAngle={2} stroke="none">
                  {d.businessTypes.map((x, i) => <Cell key={x.type} fill={TYPE_COLORS[i % TYPE_COLORS.length]} />)}
                </Pie>
                <Tooltip content={<ChartTip money />} />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-[11px] text-muted-foreground">{t('Total')}</span>
              <span className="text-[14px] font-bold tabular">{compact(total)}</span>
            </div>
          </div>
          <div className="grid flex-1 grid-cols-1 gap-1.5">
            {d.businessTypes.map((x, i) => (
              <div key={x.type} className="flex items-center gap-2 text-[12px]">
                <span className="size-2.5 shrink-0 rounded-sm" style={{ background: TYPE_COLORS[i % TYPE_COLORS.length] }} />
                <span className="min-w-0 flex-1 truncate">{label(x.type)}</span>
                <span className="text-muted-foreground tabular">{fmtNum((x.value / total) * 100)}%</span>
                <span className="w-16 text-end font-medium tabular">{compact(x.value)}</span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <EmptyState className="h-[220px]" title="No sales in this period" />
      )}
    </Panel>
  )
}

function SpeciesMix({ d, rangeLabel }: { d: DashboardData; rangeLabel: string }) {
  const t = useT()
  const data = [
    { name: t('Chicken'), value: d.species.chicken, color: CHART.brand },
    { name: t('Mutton'), value: d.species.mutton, color: CHART.maroon },
  ]
  const total = d.species.chicken + d.species.mutton
  return (
    <Panel title="Chicken vs mutton sales" description={`${rangeLabel} · ${t('excl. VAT')}`}>
      {total > 0 ? (
        <div className="flex flex-col">
          <div className="relative h-[190px] sm:h-[200px]">
            <ResponsiveContainer>
              <PieChart>
                <Pie isAnimationActive={false} data={data} dataKey="value" nameKey="name" innerRadius="58%" outerRadius="88%" paddingAngle={2} stroke="none">
                  {data.map((x) => <Cell key={x.name} fill={x.color} />)}
                </Pie>
                <Tooltip content={<ChartTip money />} />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-[11px] text-muted-foreground">{t('Total')}</span>
              <span className="text-[15px] font-bold tabular">{compact(total)}</span>
            </div>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {data.map((x) => (
              <div key={x.name} className="min-w-0 rounded-lg border px-3 py-2">
                <div className="flex items-center gap-1.5 text-[11.5px] text-muted-foreground"><span className="size-2 rounded-sm" style={{ background: x.color }} />{x.name}</div>
                <div className="truncate text-[13px] font-semibold tabular">{fmtNum((x.value / total) * 100)}% · {compact(x.value)}</div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <EmptyState className="h-[240px]" title="No sales in this period" />
      )}
    </Panel>
  )
}

function DeliveryPerformance({ d }: { d: DashboardData }) {
  const t = useT()
  const s = d.delStatus
  const data = [
    { name: t('Delivered'), value: s.delivered, color: CHART.brand },
    { name: t('Partial'), value: s.partial, color: CHART.amber },
    { name: t('Failed'), value: s.failed, color: CHART.red },
    { name: t('Pending'), value: s.pending, color: CHART.slate },
  ]
  const total = d.todayDel.length
  const donePct = total ? ((s.delivered + s.partial + s.failed) / total) * 100 : 0
  return (
    <Panel title="Delivery performance today" description={`${total} ${t('stops')}`} actions={<ViewAll to="/distribution?tab=routes" />}>
      {total ? (
        <div className="flex items-center gap-3">
          <div className="relative h-[170px] w-[46%] shrink-0">
            <ResponsiveContainer>
              <PieChart>
                <Pie isAnimationActive={false} data={data.filter((x) => x.value > 0)} dataKey="value" nameKey="name" innerRadius="60%" outerRadius="92%" paddingAngle={2} stroke="none">
                  {data.filter((x) => x.value > 0).map((x) => <Cell key={x.name} fill={x.color} />)}
                </Pie>
                <Tooltip content={<ChartTip />} />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-[18px] font-bold tabular">{fmtNum(donePct)}%</span>
              <span className="text-[10.5px] text-muted-foreground">{t('completed')}</span>
            </div>
          </div>
          <div className="min-w-0 flex-1 space-y-1.5">
            {data.map((x) => (
              <div key={x.name} className="flex items-center gap-2 text-[12.5px]">
                <span className="size-2.5 shrink-0 rounded-sm" style={{ background: x.color }} />
                <span className="min-w-0 flex-1 truncate">{x.name}</span>
                <span className="font-semibold tabular">{x.value}</span>
              </div>
            ))}
            <div className="mt-2 rounded-lg bg-muted/60 px-2.5 py-2 text-[11.5px]">
              <div className="text-muted-foreground">{t('Fill rate (delivered ÷ ordered KG)')}</div>
              <div className="text-[15px] font-bold tabular">{d.fillRate === null ? '-' : `${fmtNum(d.fillRate, 1)}%`}</div>
            </div>
          </div>
        </div>
      ) : (
        <EmptyState className="h-[200px]" icon={Truck} title="No deliveries scheduled today" />
      )}
    </Panel>
  )
}

function PendingDeliveries({ d }: { d: DashboardData }) {
  const name = useName()
  const nav = useNavigate()
  const db = useStore((s) => s.db)
  return (
    <Panel title="Pending deliveries today" bodyClassName="p-0" actions={<ViewAll to="/distribution" />}>
      {d.pendingDel.length ? (
        <div className="max-h-[260px] divide-y overflow-y-auto">
          {d.pendingDel.map((x) => {
            const c = db.customers.find((y) => y.id === x.customerId)
            const drv = db.drivers.find((y) => y.id === x.driverId)
            const kg = x.lines.reduce((s, l) => s + l.orderedKg, 0)
            return (
              <button key={x.id} onClick={() => nav('/distribution?tab=routes')} className="flex w-full items-center gap-3 px-4 py-2.5 text-start hover:bg-muted/40">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-semibold">{x.routeSeq}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium">{name(c)}</span>
                  <span className="block truncate text-[11.5px] text-muted-foreground">{name(drv)} · {fmtKg(kg, 0)}</span>
                </span>
                <StatusBadge status={x.status} />
              </button>
            )
          })}
        </div>
      ) : (
        <EmptyState className="m-4" icon={Truck} title="All deliveries completed" />
      )}
    </Panel>
  )
}

function DriverCollections({ d, rangeLabel }: { d: DashboardData; rangeLabel: string }) {
  const t = useT()
  const name = useName()
  const nav = useNavigate()
  const rows = d.byDriver.map((x) => ({ id: x.id, name: shortName(name(x.driver), 15), cash: x.cash, bank: x.bank }))
  const today = d.todayCollections.reduce((s, x) => s + x.cash + x.bank, 0)
  return (
    <Panel title="Driver-wise collections" description={`${rangeLabel} · ${t('today')} ${compact(today)}`} className="lg:col-span-2 xl:col-span-1" actions={<Legend items={[{ label: t('Cash'), color: CHART.brand }, { label: t('Bank'), color: CHART.maroon }]} />}>
      {rows.length ? (
        <div className="h-[240px] sm:h-[260px]">
          <ResponsiveContainer>
            <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 12, left: 0, bottom: 0 }} onClick={(e: any) => { const id = e?.activePayload?.[0]?.payload?.id; if (id) nav(`/fleet/drivers/${id}`) }}>
              <CartesianGrid stroke={CHART.grid} horizontal={false} />
              <XAxis type="number" {...axisProps} tickFormatter={sarTick} />
              <YAxis type="category" dataKey="name" {...axisProps} width={104} interval={0} tick={{ ...axisProps.tick, fontSize: 10.5 }} />
              <Tooltip content={<ChartTip money />} cursor={{ fill: 'rgba(4,122,63,0.05)' }} />
              <Bar isAnimationActive={false} dataKey="cash" name={t('Cash')} stackId="a" fill={CHART.brand} maxBarSize={20} />
              <Bar isAnimationActive={false} dataKey="bank" name={t('Bank')} stackId="a" fill={CHART.maroon} radius={[0, 4, 4, 0]} maxBarSize={20} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <EmptyState className="h-[240px]" icon={HandCoins} title="No driver collections in this period" />
      )}
    </Panel>
  )
}

function RecentSales({ d }: { d: DashboardData }) {
  const t = useT()
  const name = useName()
  const nav = useNavigate()
  const db = useStore((s) => s.db)
  return (
    <Panel title="Recent sales" className="xl:col-span-3" bodyClassName="p-0" actions={<ViewAll to="/sales?tab=invoices" />}>
      {d.recent.length ? (
        <>
          {/* phones: compact list */}
          <div className="divide-y md:hidden">
            {d.recent.map((i) => (
              <button key={i.id} onClick={() => nav(`/sales?tab=invoices&q=${i.invNo}`)} className="flex w-full items-center gap-3 px-4 py-2.5 text-start">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium">{name(db.customers.find((c) => c.id === i.customerId))}</span>
                  <span className="block truncate text-[11.5px] text-muted-foreground">{i.invNo} · {fmtTime(i.createdAt)}</span>
                </span>
                <span className="text-end">
                  <span className="block text-[13px] font-semibold tabular">{fmtSAR(i.total, { compact: true })}</span>
                  <StatusBadge status={i.status} />
                </span>
              </button>
            ))}
          </div>
          <Table className="hidden md:table">
            <TableHeader>
              <TableRow>
                <TableHead>{t('Invoice')}</TableHead>
                <TableHead>{t('Customer')}</TableHead>
                <TableHead>{t('Type')}</TableHead>
                <TableHead className="text-end">{t('Total')}</TableHead>
                <TableHead>{t('Status')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {d.recent.map((i) => (
                <TableRow key={i.id} className="cursor-pointer" onClick={() => nav(`/sales?tab=invoices&q=${i.invNo}`)}>
                  <TableCell>
                    <div className="font-medium">{i.invNo}</div>
                    <div className="text-[11px] text-muted-foreground">{fmtDate(i.date)} · {fmtTime(i.createdAt)}</div>
                  </TableCell>
                  <TableCell className="max-w-[200px] truncate">{name(db.customers.find((c) => c.id === i.customerId))}</TableCell>
                  <TableCell><StatusBadge status={i.source} /></TableCell>
                  <TableCell className="text-end font-medium tabular">{fmtSAR(i.total)}</TableCell>
                  <TableCell><StatusBadge status={i.status} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </>
      ) : (
        <EmptyState className="m-4" title="No sales yet" />
      )}
    </Panel>
  )
}

function StockAlerts({ d, lowStock }: { d: DashboardData; lowStock: ReturnType<typeof useStockSummary> }) {
  const t = useT()
  const name = useName()
  const nav = useNavigate()
  const db = useStore((s) => s.db)
  return (
    <Panel title="Low-stock & near-expiry" className="xl:col-span-2" icon={AlertTriangle} bodyClassName="p-0" actions={<ViewAll to="/inventory" />}>
      {lowStock.length + d.batchAlerts.length ? (
        <div className="max-h-[360px] divide-y overflow-y-auto">
          {lowStock.map((s) => (
            <button key={s.product.id} onClick={() => nav(`/inventory?product=${s.product.id}`)} className="flex w-full items-center gap-3 px-4 py-2.5 text-start hover:bg-muted/40">
              <Warehouse className="size-4 shrink-0 text-warning" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium">{name(s.product)}</span>
                <span className="block truncate text-[11.5px] text-muted-foreground">{fmtKg(s.available, 0)} / {t('reorder at')} {fmtKg(s.product.reorderLevelKg, 0)}</span>
              </span>
              <StatusBadge status={s.status === 'out' ? 'out' : 'low'} label={s.status === 'out' ? t('Out of stock') : t('Low stock')} />
            </button>
          ))}
          {d.batchAlerts.map(({ b, state }) => {
            const left = daysBetween(d.today, b.expiryDate)
            return (
              <button key={b.id} onClick={() => nav(`/inventory?product=${b.productId}`)} className="flex w-full items-center gap-3 px-4 py-2.5 text-start hover:bg-muted/40">
                <ClipboardCheck className={cn('size-4 shrink-0', state === 'expired' ? 'text-danger' : 'text-warning')} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium">{name(db.products.find((x) => x.id === b.productId))}</span>
                  <span className="block truncate text-[11.5px] text-muted-foreground">{b.batchNo} · {fmtKg(b.qtyKg, 0)} · {name(db.warehouses.find((w) => w.id === b.warehouseId))}</span>
                </span>
                <span className="shrink-0 text-end">
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
  )
}

/** tooltip for the profit chart: SAR for bars, % for margin */
function GpTip({ active, payload, label }: { active?: boolean; payload?: any[]; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-lg">
      <div className="mb-1 font-semibold">{label}</div>
      {payload.map((p) => (
        <div key={p.dataKey} className="flex items-center gap-2">
          <span className="size-2 rounded-full" style={{ background: p.color }} />
          <span className="text-muted-foreground">{p.name}</span>
          <span className="ms-auto ps-3 font-medium tabular">{p.dataKey === 'margin' ? (p.value == null ? '-' : `${fmtNum(p.value, 1)}%`) : fmtSAR(p.value)}</span>
        </div>
      ))}
    </div>
  )
}
