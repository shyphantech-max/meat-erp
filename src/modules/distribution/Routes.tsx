import { useMemo, useState, type ReactNode } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { ArrowDown, ArrowUp, CheckCircle2, ClipboardList, FileText, MapPin, Navigation, ShoppingBag, Undo2, UserPlus } from 'lucide-react'
import type { Delivery, ID, SalesOrder } from '@/types'
import { Button } from '@/components/ui/button'
import { DataTable } from '@/components/tables/DataTable'
import { EmptyState, EntityLink, Kg, MeterBar, Money, Panel, Picker, PrintDialog, StatusBadge, useAction, useDialog } from '@/components/common'
import { InvoiceDoc } from '@/components/docs'
import { useStore } from '@/store/useStore'
import { useT, useName } from '@/i18n'
import * as L from '@/store/logic'
import { fmtDate, fmtNum, fmtTime, round2, todayKey } from '@/lib/format'
import { cn } from '@/lib/utils'
import { driverDayStats } from '@/modules/fleet/shared'
import { useDistParams } from './params'
import { CustomerReturnDialog, DeliveryDialog, VanSaleDialog } from './Dialogs'

type SORow = SalesOrder & { kg: number; value: number; customerName: string; city: string; suggested?: ID }

export default function RoutesTab() {
  const t = useT()
  const name = useName()
  const act = useAction()
  const db = useStore((s) => s.db)
  const { date, driver, set } = useDistParams()
  const today = todayKey()
  const isToday = date === today
  const [assignTo, setAssignTo] = useState<ID>('')
  const deliver = useDialog<ID>()
  const vanSale = useDialog<ID>()
  const ret = useDialog<ID>()
  const invoice = useDialog<ID>()

  const openOrders = useMemo<SORow[]>(
    () =>
      db.salesOrders
        .filter((s) => s.status === 'open')
        .map((s) => {
          const c = db.customers.find((x) => x.id === s.customerId)
          return { ...s, kg: round2(s.lines.reduce((a, l) => a + l.qtyKg, 0)), value: round2(s.lines.reduce((a, l) => a + l.qtyKg * l.price, 0)), customerName: c?.name ?? '', city: c?.city ?? '', suggested: c?.driverId }
        })
        .sort((a, b) => a.deliveryDate.localeCompare(b.deliveryDate)),
    [db.salesOrders, db.customers],
  )
  const routes = useMemo(() => {
    const by: Record<ID, Delivery[]> = {}
    for (const d of db.deliveries) if (d.date === date && (!driver || d.driverId === driver)) (by[d.driverId] ??= []).push(d)
    return Object.entries(by)
      .map(([driverId, stops]) => ({ driverId, stops: stops.sort((a, b) => a.routeSeq - b.routeSeq), stats: driverDayStats(db, driverId, date) }))
      .sort((a, b) => b.stats.pending - a.stats.pending)
  }, [db, date, driver])
  const routeDrivers = [...new Set(db.deliveries.filter((d) => d.date === date).map((d) => d.driverId))]

  const assign = (rows: SORow[], clear: () => void) => {
    const drv = db.drivers.find((d) => d.id === assignTo)
    if (!drv) return
    const r = act((d, ctx) => {
      const groups: Record<string, ID[]> = {}
      for (const so of rows) (groups[so.deliveryDate < today ? today : so.deliveryDate] ??= []).push(so.id)
      let last: ReturnType<typeof L.assignOrders> = { ok: true }
      for (const [dd, ids] of Object.entries(groups)) {
        last = L.assignOrders(d, ctx, ids, drv.id, dd)
        if (!last.ok) return last
      }
      return last
    }, () => t('{n} order(s) assigned to {d}', { n: rows.length, d: name(drv) }))
    if (r.ok) clear()
  }

  const soCols: ColumnDef<SORow, any>[] = [
    { id: 'so', header: 'Order', accessorFn: (r) => r.soNo, cell: ({ row: { original: r } }) => <div><div className="font-medium">{r.soNo}</div><div className="text-[11px] text-muted-foreground">{t('Booked')} {fmtDate(r.date)}</div></div> },
    { id: 'customer', header: 'Customer', accessorFn: (r) => r.customerName, cell: ({ row: { original: r } }) => <div><EntityLink to={`/customers/${r.customerId}`}>{name(db.customers.find((c) => c.id === r.customerId))}</EntityLink><div className="text-[11px] text-muted-foreground">{r.city}</div></div> },
    { id: 'deliveryDate', header: 'Delivery date', accessorFn: (r) => r.deliveryDate, cell: ({ getValue }) => <span className={cn(getValue() < today && 'font-medium text-danger')}>{fmtDate(getValue())}</span> },
    { id: 'lines', header: 'Products', accessorFn: (r) => r.lines.length, cell: ({ row: { original: r } }) => <span className="text-[12px]">{r.lines.map((l) => `${db.products.find((p) => p.id === l.productId)?.code} ${fmtNum(l.qtyKg)}kg`).join(' · ')}</span> },
    { id: 'kg', header: 'KG', accessorFn: (r) => r.kg, cell: ({ getValue }) => <Kg value={getValue()} /> },
    { id: 'value', header: 'Value (excl. VAT)', accessorFn: (r) => r.value, cell: ({ getValue }) => <Money value={getValue()} /> },
    { id: 'pay', header: 'Payment', accessorFn: (r) => r.paymentType, cell: ({ getValue }) => <StatusBadge status={getValue()} /> },
    { id: 'suggested', header: 'Usual driver', accessorFn: (r) => db.drivers.find((d) => d.id === r.suggested)?.name ?? '', cell: ({ row: { original: r } }) => <span className="text-[12px] text-muted-foreground">{name(db.drivers.find((d) => d.id === r.suggested))}</span> },
  ]
  const availableDrivers = db.drivers.filter((d) => d.status === 'on_duty' && d.vehicleId)

  return (
    <div className="space-y-5">
      <Panel
        title="Unassigned sales orders"
        description="Select orders and assign them to a driver's delivery route. Overdue orders are routed for today."
        icon={ClipboardList}
        bodyClassName="p-3"
      >
        {openOrders.length === 0 ? (
          <EmptyState icon={CheckCircle2} title="All orders are assigned" description="New sales orders appear here until they are put on a route." />
        ) : (
          <DataTable
            data={openOrders}
            columns={soCols}
            selectable
            compact
            pageSize={6}
            exportName="unassigned-orders"
            searchText={(r) => `${r.soNo} ${r.customerName} ${r.city}`}
            facets={[{ id: 'city', label: 'City', value: (r) => r.city }]}
            bulkActions={(rows, clear) => (
              <>
                <Picker value={assignTo} onChange={setAssignTo} size="sm" className="h-8 w-56 bg-card" placeholder="Assign to driver…" options={availableDrivers.map((d) => ({ value: d.id, label: `${name(d)} · ${db.vehicles.find((v) => v.id === d.vehicleId)?.plateNo ?? ''}` }))} />
                <Button size="sm" disabled={!assignTo} onClick={() => assign(rows, clear)}><UserPlus /> {t('Assign to route')}</Button>
                {rows.length > 0 && rows[0].suggested && !assignTo && (
                  <button className="text-[12px] text-brand underline" onClick={() => setAssignTo(rows[0].suggested!)}>{t('Use usual driver')}</button>
                )}
              </>
            )}
          />
        )}
      </Panel>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[13px] font-semibold">{t('Delivery routes')} · {fmtDate(date)}</span>
        <div className="flex flex-wrap gap-1.5">
          <Chip active={!driver} onClick={() => set({ driver: '' })}>{t('All drivers')}</Chip>
          {routeDrivers.map((id) => (
            <Chip key={id} active={driver === id} onClick={() => set({ driver: id })}>{name(db.drivers.find((d) => d.id === id))}</Chip>
          ))}
          {driver && !routeDrivers.includes(driver) && <Chip active onClick={() => set({ driver: '' })}>{name(db.drivers.find((d) => d.id === driver))}</Chip>}
        </div>
      </div>

      {routes.length === 0 ? (
        <EmptyState icon={Navigation} title="No routes on this day" description="Assign open sales orders to a driver to build a route." />
      ) : (
        routes.map(({ driverId, stops, stats }) => {
          const d = db.drivers.find((x) => x.id === driverId)!
          const v = db.vehicles.find((x) => x.id === stops[0]?.vehicleId)
          const settled = !!stats.settlementStatus
          return (
            <Panel
              key={driverId}
              title={<span className="flex items-center gap-2">{name(d)} <span className="text-[12px] font-normal text-muted-foreground">{v?.plateNo}</span>{stats.settlementStatus && <StatusBadge status={stats.settlementStatus} />}</span>}
              description={
                <span className="flex flex-wrap items-center gap-x-3">
                  <span>{stats.done}/{stats.stops} {t('stops')}</span>
                  <span>{t('Van stock')} {fmtNum(stats.vanKg)} kg</span>
                  <span>{t('Sales')} <Money value={stats.sales} /></span>
                  <span>{t('Collected')} <Money value={stats.collections} /></span>
                </span>
              }
              actions={
                isToday && !settled ? (
                  <>
                    <Button size="sm" variant="outline" onClick={() => vanSale.open(driverId)}><ShoppingBag /> {t('Van sale')}</Button>
                    <Button size="sm" variant="outline" onClick={() => ret.open(driverId)}><Undo2 /> {t('Customer return')}</Button>
                  </>
                ) : undefined
              }
              bodyClassName="p-0"
            >
              <div className="px-4 pt-3"><MeterBar value={stats.done} max={stats.stops || 1} tone={stats.failed ? 'warning' : 'brand'} /></div>
              <ol className="divide-y">
                {stops.map((s, i) => {
                  const c = db.customers.find((x) => x.id === s.customerId)
                  const ordered = s.lines.reduce((a, l) => a + l.orderedKg, 0)
                  const delivered = s.lines.reduce((a, l) => a + l.deliveredKg, 0)
                  const open = s.status === 'pending' || s.status === 'out_for_delivery'
                  const inv = s.invoiceId ? db.invoices.find((x) => x.id === s.invoiceId) : undefined
                  return (
                    <li key={s.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                      <div className="flex items-center gap-1">
                        <span className={cn('flex size-8 items-center justify-center rounded-full text-[12px] font-bold', open ? 'bg-warning-soft text-warning' : s.status === 'failed' ? 'bg-danger-soft text-danger' : 'bg-brand text-white')}>{s.routeSeq}</span>
                        {isToday && open && !settled && (
                          <div className="flex flex-col">
                            <button className="text-muted-foreground hover:text-foreground disabled:opacity-30" disabled={i === 0} onClick={() => act((db2, ctx) => L.reorderRoute(db2, ctx, s.id, -1))} aria-label="Move up"><ArrowUp className="size-3.5" /></button>
                            <button className="text-muted-foreground hover:text-foreground disabled:opacity-30" disabled={i === stops.length - 1} onClick={() => act((db2, ctx) => L.reorderRoute(db2, ctx, s.id, 1))} aria-label="Move down"><ArrowDown className="size-3.5" /></button>
                          </div>
                        )}
                      </div>
                      <div className="min-w-48 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <EntityLink to={`/customers/${s.customerId}`}>{name(c)}</EntityLink>
                          <StatusBadge status={s.status} />
                        </div>
                        <div className="mt-0.5 flex flex-wrap gap-x-2 text-[11.5px] text-muted-foreground">
                          <span className="inline-flex items-center gap-1"><MapPin className="size-3" />{c?.district}, {c?.city}</span>
                          <span>{s.deliveryNo}</span>
                          {s.completedAt && <span>{fmtTime(s.completedAt)}</span>}
                        </div>
                        <div className="mt-1 text-[12px]">
                          {s.lines.map((l) => {
                            const p = db.products.find((x) => x.id === l.productId)
                            return (
                              <span key={l.productId} className="me-3 inline-block">
                                {p?.code} <span className="tabular">{open ? fmtNum(l.orderedKg) : `${fmtNum(l.deliveredKg)}/${fmtNum(l.orderedKg)}`} kg</span>
                              </span>
                            )
                          })}
                        </div>
                        {s.failReason && <div className="mt-0.5 text-[12px] text-danger">{s.failReason}</div>}
                      </div>
                      <div className="text-end text-[12.5px]">
                        <Kg value={open ? ordered : delivered} className="font-semibold" />
                        {inv && <div className="text-[11.5px] text-muted-foreground"><Money value={inv.total} /> · <StatusBadge status={inv.status} className="ms-1" /></div>}
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {open && isToday && !settled && (
                          <>
                            {s.status === 'pending' && <Button size="sm" variant="outline" onClick={() => act((db2, ctx) => L.setOutForDelivery(db2, ctx, s.id), 'Marked out for delivery')}><Navigation /> {t('Out')}</Button>}
                            <Button size="sm" onClick={() => deliver.open(s.id)}><CheckCircle2 /> {t('Complete')}</Button>
                          </>
                        )}
                        {inv && <Button size="sm" variant="ghost" onClick={() => invoice.open(inv.id)}><FileText /> {inv.invNo}</Button>}
                      </div>
                    </li>
                  )
                })}
              </ol>
            </Panel>
          )
        })
      )}

      {deliver.value && <DeliveryDialog deliveryId={deliver.value} onOpenChange={deliver.onOpenChange} onInvoice={(id) => invoice.open(id)} />}
      {vanSale.value && <VanSaleDialog driverId={vanSale.value} onOpenChange={vanSale.onOpenChange} onInvoice={(id) => invoice.open(id)} />}
      {ret.value && <CustomerReturnDialog driverId={ret.value} onOpenChange={ret.onOpenChange} />}
      <PrintDialog open={invoice.isOpen} onOpenChange={invoice.onOpenChange} title="Tax Invoice">{invoice.value && <InvoiceDoc invoiceId={invoice.value} />}</PrintDialog>
    </div>
  )
}

function Chip({ active, onClick, children }: { active?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button onClick={onClick} className={cn('rounded-full border px-3 py-1 text-[12px] font-medium transition-colors', active ? 'border-brand bg-brand text-white' : 'bg-card hover:bg-muted')}>
      {children}
    </button>
  )
}
