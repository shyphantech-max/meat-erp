import { useMemo, type ReactNode } from 'react'
import { useDistParams, type Tab } from './params'
import { Boxes, ClipboardList, LayoutGrid, PackageCheck, Route as RouteIcon, Scale, Truck } from 'lucide-react'
import type { ID } from '@/types'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { EmptyState, KpiCard, Kg, MeterBar, Money, PageHeader, StatusBadge } from '@/components/common'
import { useStore } from '@/store/useStore'
import { useT, useName } from '@/i18n'
import { fmtKg, fmtNum, todayKey } from '@/lib/format'
import { cn } from '@/lib/utils'
import { driverDayStats } from '@/modules/fleet/shared'
import LoadingTab from './Loading'
import RoutesTab from './Routes'
import VanStockTab from './VanStock'

export { useDistParams } from './params'

export default function DistributionPage() {
  const t = useT()
  const { tab, date, set } = useDistParams()
  return (
    <div>
      <PageHeader
        title="Distribution & Deliveries"
        description="Load vans from the warehouse, run daily delivery routes and van sales, and reconcile van stock."
        icon={Truck}
        actions={<Input type="date" value={date} max={todayKey()} onChange={(e) => e.target.value && set({ date: e.target.value })} className="h-9 w-40" aria-label={t('Date')} />}
      />
      <Tabs value={tab} onValueChange={(v) => set({ tab: v as Tab })}>
        <TabsList>
          <TabsTrigger value="board"><LayoutGrid /> {t('Driver board')}</TabsTrigger>
          <TabsTrigger value="loading"><Boxes /> {t('Stock loading')}</TabsTrigger>
          <TabsTrigger value="routes"><RouteIcon /> {t('Routes & deliveries')}</TabsTrigger>
          <TabsTrigger value="vanstock"><Scale /> {t('Van stock & reconciliation')}</TabsTrigger>
        </TabsList>
        <TabsContent value="board"><Board /></TabsContent>
        <TabsContent value="loading"><LoadingTab /></TabsContent>
        <TabsContent value="routes"><RoutesTab /></TabsContent>
        <TabsContent value="vanstock"><VanStockTab /></TabsContent>
      </Tabs>
    </div>
  )
}

function Board() {
  const t = useT()
  const name = useName()
  const db = useStore((s) => s.db)
  const { date, set } = useDistParams()
  const rows = useMemo(
    () =>
      db.drivers
        .map((d) => ({ d, v: db.vehicles.find((x) => x.id === d.vehicleId), s: driverDayStats(db, d.id, date) }))
        .sort((a, b) => Number(b.s.stops > 0 || b.s.vanKg > 0) - Number(a.s.stops > 0 || a.s.vanKg > 0) || b.s.pending - a.s.pending),
    [db, date],
  )
  const tot = rows.reduce(
    (a, r) => ({ loaded: a.loaded + r.s.loadedKg, delivered: a.delivered + r.s.deliveredKg, stops: a.stops + r.s.stops, done: a.done + r.s.done, sales: a.sales + r.s.sales, coll: a.coll + r.s.collections, van: a.van + r.s.vanKg }),
    { loaded: 0, delivered: 0, stops: 0, done: 0, sales: 0, coll: 0, van: 0 },
  )
  const unassigned = db.salesOrders.filter((s) => s.status === 'open').length
  const open = (driverId: ID) => set({ tab: 'routes', driver: driverId })
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <KpiCard label="Loaded today" value={fmtKg(tot.loaded, 0)} icon={Boxes} tone="navy" />
        <KpiCard label="Delivered / sold" value={fmtKg(tot.delivered, 0)} icon={PackageCheck} />
        <KpiCard label="Stops completed" value={`${tot.done}/${tot.stops}`} sub={<MeterBar value={tot.done} max={tot.stops || 1} tone="brand" />} icon={RouteIcon} tone="info" />
        <KpiCard label="Van sales & deliveries" value={<Money value={tot.sales} compact />} icon={Truck} />
        <KpiCard label="Collected on route" value={<Money value={tot.coll} compact />} icon={Scale} tone="success" />
        <KpiCard label="Unassigned orders" value={unassigned} icon={ClipboardList} tone={unassigned ? 'warning' : 'neutral'} alert={unassigned > 0} />
      </div>
      {rows.length === 0 ? (
        <EmptyState title="No drivers" />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {rows.map(({ d, v, s }) => {
            const idle = !s.stops && !s.vanKg && !s.loadedKg
            return (
              <Card key={d.id} onClick={() => open(d.id)} className={cn('cursor-pointer gap-0 p-4 transition-all hover:border-brand/40 hover:shadow-md', idle && 'opacity-70')}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate font-semibold">{name(d)}</div>
                    <div className="text-[11.5px] text-muted-foreground">{v ? `${v.plateNo} · ${v.type}` : t('No vehicle')}</div>
                  </div>
                  {s.settlementStatus ? <StatusBadge status={s.settlementStatus} /> : d.status !== 'on_duty' ? <StatusBadge status={d.status} /> : s.stops ? <StatusBadge status={s.pending ? 'in_transit' : 'delivered'} label={s.pending ? t('On route') : t('Route complete')} /> : <StatusBadge status="draft" label={t('Idle')} />}
                </div>
                <div className="mt-3">
                  <div className="mb-1 flex justify-between text-[11.5px] text-muted-foreground">
                    <span>{t('Stops')}</span>
                    <span className="tabular">{s.done}/{s.stops}{s.failed ? ` · ${s.failed} ${t('failed')}` : ''}</span>
                  </div>
                  <MeterBar value={s.done} max={s.stops || 1} tone={s.failed ? 'warning' : 'brand'} />
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-[12px]">
                  <Item label={t('Loaded')} value={<Kg value={s.loadedKg} d={0} />} />
                  <Item label={t('Delivered')} value={<Kg value={s.deliveredKg} d={0} />} />
                  <Item label={t('Van stock')} value={<Kg value={s.vanKg} d={0} />} />
                  <Item label={t('Pending stops')} value={<span className={cn('tabular', s.pending && 'font-semibold text-warning')}>{fmtNum(s.pending)}</span>} />
                  <Item label={t('Sales')} value={<Money value={s.sales} />} />
                  <Item label={t('Collected')} value={<Money value={s.collections} />} />
                </dl>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
const Item = ({ label, value }: { label: string; value: ReactNode }) => (
  <div className="min-w-0">
    <dt className="text-[10.5px] tracking-wide text-muted-foreground uppercase">{label}</dt>
    <dd className="truncate font-medium">{value}</dd>
  </div>
)
