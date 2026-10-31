import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { ColumnDef } from '@tanstack/react-table'
import { AlertTriangle, CheckCircle2, ClipboardList, Hourglass, Scale, Truck } from 'lucide-react'
import type { ID, Settlement } from '@/types'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { DataTable } from '@/components/tables/DataTable'
import { EmptyState, KpiCard, Money, PageHeader, Panel, StatusBadge } from '@/components/common'
import { useStore } from '@/store/useStore'
import { computeSettlement } from '@/store/derive'
import { useT, useName } from '@/i18n'
import { fmtDate, fmtKg, fmtNum, fmtSAR, todayKey } from '@/lib/format'
import { cn } from '@/lib/utils'
import { SettlementDetail } from './SettlementDetail'
import { PrepareSettlementDialog } from './PrepareSettlementDialog'

export default function SettlementPage() {
  const t = useT()
  const name = useName()
  const db = useStore((s) => s.db)
  const [params, setParams] = useSearchParams()
  const id = params.get('id')
  const [day, setDay] = useState(todayKey())
  const [prep, setPrep] = useState<{ driverId: ID; date: string } | null>(null)
  const open = (sid: ID) => setParams({ id: sid })
  const tol = db.settings.cashVarianceToleranceSAR

  // driver days with van activity and no live settlement
  const openDays = useMemo(() => {
    return db.drivers
      .map((d) => {
        const active = db.vanMovements.some((m) => m.driverId === d.id && m.date === day) || db.deliveries.some((x) => x.driverId === d.id && x.date === day)
        const settled = db.settlements.some((s) => s.driverId === d.id && s.date === day && s.status !== 'rejected')
        if (!active || settled) return null
        const calc = computeSettlement(db, d.id, day)
        const pending = db.deliveries.filter((x) => x.driverId === d.id && x.date === day && ['pending', 'out_for_delivery'].includes(x.status)).length
        return { d, calc, pending }
      })
      .filter(Boolean) as { d: (typeof db.drivers)[number]; calc: ReturnType<typeof computeSettlement>; pending: number }[]
  }, [db, day])

  if (id) return <SettlementDetail id={id} onBack={() => setParams({})} onOpen={open} />

  const list = [...db.settlements].sort((a, b) => b.date.localeCompare(a.date) || b.submittedAt.localeCompare(a.submittedAt))
  const awaiting = db.settlements.filter((s) => s.status === 'submitted')
  const inReview = db.settlements.filter((s) => s.status === 'under_review' || s.status === 'verified')
  const today = todayKey()
  const approvedToday = db.settlements.filter((s) => (s.status === 'approved' || s.status === 'closed') && s.history.some((h) => h.status === 'approved' && h.at.slice(0, 10) === today))
  const flagged = db.settlements.filter((s) => !['closed', 'rejected'].includes(s.status) && (Math.abs(s.cashVariance) > tol || Math.abs(s.stockDiscrepancyKg) > 0.5))

  const cols: ColumnDef<Settlement, any>[] = [
    { header: 'Settlement', accessorKey: 'settlementNo', cell: ({ row }) => <div><div className="font-medium">{row.original.settlementNo}</div><div className="text-[11px] text-muted-foreground">{fmtDate(row.original.date)}</div></div> },
    { header: 'Driver', id: 'driver', accessorFn: (s) => db.drivers.find((d) => d.id === s.driverId)?.name, cell: ({ row }) => <div><div className="font-medium">{name(db.drivers.find((d) => d.id === row.original.driverId))}</div><div className="text-[11px] text-muted-foreground">{db.vehicles.find((v) => v.id === row.original.vehicleId)?.plateNo}</div></div> },
    { header: 'Total sales', accessorKey: 'totalSales', cell: ({ row }) => <Money value={row.original.totalSales} /> },
    { header: 'Expected cash', accessorKey: 'expectedCash', cell: ({ row }) => <Money value={row.original.expectedCash} /> },
    { header: 'Bank transfers', accessorKey: 'bankTransfers', cell: ({ row }) => <Money value={row.original.bankTransfers} /> },
    { header: 'Cash handed over', accessorKey: 'cashHandedOver', cell: ({ row }) => <Money value={row.original.cashHandedOver} className="font-semibold" /> },
    { header: 'Shortage / excess', accessorKey: 'cashVariance', cell: ({ row }) => <Money value={row.original.cashVariance} className={cn('font-semibold', row.original.cashVariance < 0 ? 'text-danger' : row.original.cashVariance > 0 ? 'text-warning' : 'text-success')} /> },
    { header: 'Stock diff (kg)', accessorKey: 'stockDiscrepancyKg', cell: ({ row }) => <span className={cn('tabular', Math.abs(row.original.stockDiscrepancyKg) > 0.5 ? 'font-semibold text-danger' : 'text-muted-foreground')}>{fmtNum(row.original.stockDiscrepancyKg, 1)}</span> },
    { header: 'Status', id: 'status', accessorFn: (s) => s.status, cell: ({ row }) => <StatusBadge status={row.original.status} /> },
  ]

  return (
    <div>
      <PageHeader title="Daily Driver Settlement" description="End-of-day van stock and cash reconciliation: Driver submits → Supervisor reviews → Cash & stock verified → Approved → Day closed." icon={Scale} />
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Awaiting review" value={awaiting.length} icon={Hourglass} tone="warning" alert={awaiting.length > 0} />
        <KpiCard label="Under review / verified" value={inReview.length} icon={ClipboardList} tone="info" />
        <KpiCard label="Approved today" value={approvedToday.length} sub={fmtSAR(approvedToday.reduce((s, x) => s + x.cashHandedOver, 0))} icon={CheckCircle2} tone="success" />
        <KpiCard label="Variances flagged" value={flagged.length} sub={t('Cash > SAR {n} or stock mismatch', { n: tol })} icon={AlertTriangle} tone="danger" alert={flagged.length > 0} />
      </div>

      <Panel
        className="mb-5"
        title="Open driver days"
        description="Drivers with van activity and no settlement yet"
        icon={Truck}
        actions={<Input type="date" value={day} max={todayKey()} onChange={(e) => setDay(e.target.value || todayKey())} className="h-8 w-40" />}
      >
        {openDays.length === 0 ? (
          <EmptyState icon={CheckCircle2} title="No open driver days" description="Every driver with activity on this day has submitted a settlement." className="py-6" />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {openDays.map(({ d, calc, pending }) => (
              <Card key={d.id} className="gap-0 p-3.5">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-semibold">{name(d)}</div>
                    <div className="text-[11.5px] text-muted-foreground">{db.vehicles.find((v) => v.id === calc.vehicleId)?.plateNo} · {t('Deliveries')} {calc.deliveriesDone}/{calc.deliveriesTotal}</div>
                  </div>
                  {pending > 0 ? <StatusBadge status="pending" label={t(pending === 1 ? '1 stop pending' : '{n} stops pending', { n: pending })} /> : <StatusBadge status="delivered" label={t('Route complete')} />}
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-[12px]">
                  <div><div className="text-muted-foreground">{t('Loaded')}</div><div className="font-medium tabular">{fmtKg(calc.loadedKg)}</div></div>
                  <div><div className="text-muted-foreground">{t('On van')}</div><div className="font-medium tabular">{fmtKg(calc.closingKg)}</div></div>
                  <div><div className="text-muted-foreground">{t('Expected cash')}</div><div className="font-medium tabular">{fmtSAR(calc.expectedCash, { decimals: false })}</div></div>
                </div>
                <Button size="sm" className="mt-3" variant={pending ? 'outline' : 'default'} onClick={() => setPrep({ driverId: d.id, date: day })}>{t('Prepare settlement')}</Button>
              </Card>
            ))}
          </div>
        )}
      </Panel>

      <DataTable
        data={list}
        columns={cols}
        onRowClick={(s) => open(s.id)}
        exportName="driver-settlements"
        searchText={(s) => `${s.settlementNo} ${db.drivers.find((d) => d.id === s.driverId)?.name} ${s.date}`}
        facets={[
          { id: 'status', label: 'Status', value: (s) => s.status, options: ['submitted', 'under_review', 'verified', 'approved', 'closed', 'rejected'].map((v) => ({ value: v, label: v })) },
          { id: 'driver', label: 'Driver', value: (s) => s.driverId, options: db.drivers.map((d) => ({ value: d.id, label: name(d) })) },
          { id: 'date', label: 'Date', value: (s) => s.date, options: [...new Set(list.map((s) => s.date))].map((d) => ({ value: d, label: fmtDate(d) })) },
        ]}
        rowClassName={(s) => (Math.abs(s.cashVariance) > tol && !['closed', 'rejected'].includes(s.status) ? 'bg-danger-soft/40' : undefined)}
        emptyText="No settlements yet."
      />

      {prep && (
        <PrepareSettlementDialog driverId={prep.driverId} date={prep.date} open={!!prep} onOpenChange={(o) => !o && setPrep(null)} onSubmitted={open} />
      )}
    </div>
  )
}
