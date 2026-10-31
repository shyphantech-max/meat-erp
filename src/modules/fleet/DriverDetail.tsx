import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Boxes, HandCoins, Pencil, Phone, Printer, Receipt, Smartphone, Truck, Wallet } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { EmptyState, EntityLink, KpiCard, Kg, MeterBar, Money, Panel, PrintDialog, Stat, StatusBadge, useDialog } from '@/components/common'
import { LoadingSlipDoc, SettlementDoc } from '@/components/docs'
import { useStore } from '@/store/useStore'
import { useUI } from '@/store/useUI'
import { useT, useName } from '@/i18n'
import { vanStockByProduct } from '@/store/derive'
import { fmtDate, fmtDateShort, fmtKg, fmtNum, fmtTime, todayKey } from '@/lib/format'
import { DriverFormDialog, driverDayStats } from './shared'

export default function DriverDetail() {
  const { id = '' } = useParams()
  const t = useT()
  const name = useName()
  const nav = useNavigate()
  const setRole = useUI((s) => s.setRole)
  const db = useStore((s) => s.db)
  const [date, setDate] = useState(todayKey())
  const edit = useDialog()
  const slip = useDialog<string>()
  const stl = useDialog<string>()
  const d = db.drivers.find((x) => x.id === id)

  const data = useMemo(() => {
    if (!d) return null
    const day = driverDayStats(db, d.id, date)
    const deliveries = db.deliveries.filter((x) => x.driverId === d.id && x.date === date).sort((a, b) => a.routeSeq - b.routeSeq)
    const payments = db.payments.filter((p) => p.driverId === d.id && p.date === date).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    const van = vanStockByProduct(db, d.id)
    const loads = db.vanLoads.filter((l) => l.driverId === d.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 10)
    const settlements = db.settlements.filter((s) => s.driverId === d.id).sort((a, b) => b.date.localeCompare(a.date))
    const customers = db.customers.filter((c) => c.driverId === d.id)
    const last7 = Array.from({ length: 7 }, (_, i) => {
      const k = new Date(`${todayKey()}T00:00:00`)
      k.setDate(k.getDate() - (6 - i))
      const key = `${k.getFullYear()}-${String(k.getMonth() + 1).padStart(2, '0')}-${String(k.getDate()).padStart(2, '0')}`
      return { key, ...driverDayStats(db, d.id, key) }
    })
    return { day, deliveries, payments, van, loads, settlements, customers, last7 }
  }, [db, d, date])

  if (!d || !data) return <EmptyState title="Driver not found" action={<Button variant="outline" onClick={() => nav('/fleet')}>{t('Back')}</Button>} />
  const vehicle = db.vehicles.find((v) => v.id === d.vehicleId)
  const vanTotal = Object.values(data.van).reduce((s, v) => s + v, 0)
  const maxSales = Math.max(1, ...data.last7.map((x) => x.sales))

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <Button variant="ghost" size="icon" onClick={() => nav('/fleet')} aria-label={t('Back')}><ArrowLeft className="flip-rtl" /></Button>
          <div className="flex size-12 items-center justify-center rounded-full bg-brand text-base font-bold text-white">{d.name.split(' ').map((w) => w[0]).slice(0, 2).join('')}</div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-[22px] font-bold text-brand-ink">{name(d)}</h1>
              <StatusBadge status={d.status} />
            </div>
            <div className="mt-0.5 flex flex-wrap gap-x-3 text-[12.5px] text-muted-foreground">
              <span>{d.code}</span>
              <span dir="ltr" className="inline-flex items-center gap-1"><Phone className="size-3" />{d.mobile}</span>
              <span className="inline-flex items-center gap-1"><Truck className="size-3" />{vehicle ? `${vehicle.plateNo} · ${vehicle.type}` : t('No vehicle')}</span>
              <span>{name(db.warehouses.find((w) => w.id === d.warehouseId))}</span>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Input type="date" value={date} max={todayKey()} onChange={(e) => e.target.value && setDate(e.target.value)} className="h-9 w-40" />
          <Button variant="outline" onClick={() => edit.open(true)}><Pencil /> {t('Edit')}</Button>
          <Button variant="outline" asChild><Link to={`/distribution?tab=routes&driver=${d.id}&date=${date}`}><Truck /> {t('Route')}</Link></Button>
          <Button disabled={d.status === 'on_leave'} onClick={() => { setRole('driver', d.id); nav('/driver') }}><Smartphone /> {t('Open Driver View')}</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <KpiCard label="Deliveries" value={`${data.day.done}/${data.day.stops}`} sub={data.day.pending ? t('{n} pending', { n: data.day.pending }) : date === todayKey() ? t('Route complete') : undefined} icon={Truck} />
        <KpiCard label="Loaded" value={fmtKg(data.day.loadedKg)} icon={Boxes} tone="navy" />
        <KpiCard label="Delivered / sold" value={fmtKg(data.day.deliveredKg)} icon={Boxes} tone="info" />
        <KpiCard label="Sales" value={<Money value={data.day.sales} />} icon={Receipt} />
        <KpiCard label="Collections" value={<Money value={data.day.collections} />} sub={`${t('Cash')} ${fmtNum(data.day.cash)} · ${t('Bank')} ${fmtNum(data.day.bank)}`} icon={HandCoins} tone="success" />
        <KpiCard label="Van stock now" value={fmtKg(vanTotal)} sub={vehicle ? <MeterBar value={vanTotal} max={vehicle.capacityKg} showLabel /> : undefined} icon={Wallet} tone="warning" />
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        <Panel title="Deliveries" description={fmtDate(date)} className="xl:col-span-2" bodyClassName="p-0">
          {data.deliveries.length === 0 ? (
            <EmptyState className="m-4" icon={Truck} title="No deliveries on this day" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>{t('Customer')}</TableHead>
                  <TableHead className="text-end">{t('Ordered')}</TableHead>
                  <TableHead className="text-end">{t('Delivered')}</TableHead>
                  <TableHead>{t('Status')}</TableHead>
                  <TableHead>{t('Invoice')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.deliveries.map((x) => {
                  const c = db.customers.find((cc) => cc.id === x.customerId)
                  const inv = x.invoiceId ? db.invoices.find((i) => i.id === x.invoiceId) : undefined
                  return (
                    <TableRow key={x.id}>
                      <TableCell className="tabular">{x.routeSeq}</TableCell>
                      <TableCell>
                        <EntityLink to={`/customers/${x.customerId}`}>{name(c)}</EntityLink>
                        <div className="text-[11.5px] text-muted-foreground">{x.deliveryNo} · {c?.district}</div>
                      </TableCell>
                      <TableCell className="text-end"><Kg value={x.lines.reduce((s, l) => s + l.orderedKg, 0)} /></TableCell>
                      <TableCell className="text-end"><Kg value={x.lines.reduce((s, l) => s + l.deliveredKg, 0)} /></TableCell>
                      <TableCell><StatusBadge status={x.status} />{x.failReason && <div className="mt-0.5 text-[11px] text-danger">{x.failReason}</div>}</TableCell>
                      <TableCell>{inv ? <span className="text-[12.5px]">{inv.invNo}<div className="text-[11px] text-muted-foreground"><Money value={inv.total} /></div></span> : '-'}</TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </Panel>

        <Panel title="Current van stock" description={vehicle?.plateNo} bodyClassName="p-0">
          {Object.keys(data.van).length === 0 ? (
            <EmptyState className="m-4" icon={Boxes} title="Van is empty" />
          ) : (
            <div className="divide-y">
              {Object.entries(data.van).sort((a, b) => b[1] - a[1]).map(([pid, q]) => {
                const p = db.products.find((x) => x.id === pid)
                return (
                  <div key={pid} className="flex items-center justify-between gap-2 px-4 py-2.5 text-[13px]">
                    <div className="min-w-0">
                      <div className="truncate font-medium">{name(p)}</div>
                      <div className="text-[11px] text-muted-foreground">{p ? `${fmtNum(q / p.cartonKg, 1)} ${t(p.packLabel)}` : ''}</div>
                    </div>
                    <Kg value={q} className="font-semibold" />
                  </div>
                )
              })}
            </div>
          )}
        </Panel>
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        <Panel title="Collections" description={fmtDate(date)} bodyClassName="p-0">
          {data.payments.length === 0 ? (
            <EmptyState className="m-4" icon={HandCoins} title="No collections on this day" />
          ) : (
            <div className="divide-y">
              {data.payments.map((p) => (
                <div key={p.id} className="flex items-center justify-between gap-2 px-4 py-2.5 text-[13px]">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{name(db.customers.find((c) => c.id === p.customerId))}</div>
                    <div className="text-[11px] text-muted-foreground">{p.receiptNo} · {fmtTime(p.createdAt)} · {t(p.method === 'cash' ? 'Cash' : 'Bank')} · {t(p.collectionType)}</div>
                  </div>
                  <div className="text-end">
                    <Money value={p.amount} className="font-semibold" />
                    <div><StatusBadge status={p.verification} className="mt-0.5" /></div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel title="Last 7 days" description="Sales and collections per day">
          <div className="space-y-2">
            {data.last7.map((x) => (
              <div key={x.key} className="grid grid-cols-[56px_1fr_auto] items-center gap-2 text-[12px]">
                <span className="text-muted-foreground">{fmtDateShort(x.key)}</span>
                <div className="space-y-0.5">
                  <div className="h-2 rounded-full bg-brand" style={{ width: `${(x.sales / maxSales) * 100}%`, minWidth: x.sales ? 4 : 0 }} />
                  <div className="h-2 rounded-full bg-navy/70" style={{ width: `${(x.collections / maxSales) * 100}%`, minWidth: x.collections ? 4 : 0 }} />
                </div>
                <span className="text-end tabular">{x.stops ? `${x.done}/${x.stops}` : '-'}</span>
              </div>
            ))}
            <div className="flex gap-3 pt-1 text-[11px] text-muted-foreground">
              <span className="inline-flex items-center gap-1"><span className="size-2 rounded-sm bg-brand" />{t('Sales')}</span>
              <span className="inline-flex items-center gap-1"><span className="size-2 rounded-sm bg-navy/70" />{t('Collections')}</span>
              <span className="ms-auto">{t('Stops')}</span>
            </div>
          </div>
        </Panel>

        <Panel title="Assigned customers" description={t('{n} customers', { n: data.customers.length })} bodyClassName="p-0">
          {data.customers.length === 0 ? (
            <EmptyState className="m-4" title="No customers assigned" />
          ) : (
            <div className="divide-y">
              {data.customers.map((c) => (
                <div key={c.id} className="flex items-center justify-between gap-2 px-4 py-2.5 text-[13px]">
                  <div className="min-w-0">
                    <EntityLink to={`/customers/${c.id}`}>{name(c)}</EntityLink>
                    <div className="text-[11px] text-muted-foreground">{t(c.businessType.replace(/^\w/, (m) => m.toUpperCase()))} · {c.district}, {c.city}</div>
                  </div>
                  <StatusBadge status={c.defaultPayment} />
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <Panel title="Loading slips" bodyClassName="p-0">
          {data.loads.length === 0 ? (
            <EmptyState className="m-4" icon={Boxes} title="No loading slips yet" />
          ) : (
            <div className="divide-y">
              {data.loads.map((l) => (
                <div key={l.id} className="flex items-center justify-between gap-2 px-4 py-2.5 text-[13px]">
                  <div>
                    <div className="font-medium">{l.slipNo}</div>
                    <div className="text-[11px] text-muted-foreground">{fmtDate(l.date)} · {fmtTime(l.createdAt)} · {l.lines.length} {t('products')}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Kg value={l.lines.reduce((s, x) => s + x.qtyKg, 0)} className="font-semibold" />
                    <Button size="icon-sm" variant="ghost" onClick={() => slip.open(l.id)} aria-label={t('Print')}><Printer /></Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>
        <Panel title="Settlement history" bodyClassName="p-0" actions={<Button variant="ghost" size="sm" asChild><Link to="/settlement">{t('View all')}</Link></Button>}>
          {data.settlements.length === 0 ? (
            <EmptyState className="m-4" title="No settlements yet" />
          ) : (
            <div className="divide-y">
              {data.settlements.map((s) => (
                <div key={s.id} className="flex items-center justify-between gap-2 px-4 py-2.5 text-[13px]">
                  <div>
                    <div className="font-medium">{s.settlementNo} · {fmtDate(s.date)}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {t('Sales')} {fmtNum(s.totalSales)} · {t('Cash')} {fmtNum(s.cashHandedOver)}
                      {Math.abs(s.cashVariance) > 0.009 && <span className={s.cashVariance < 0 ? 'text-danger' : 'text-success'}> · {t('Variance')} {fmtNum(s.cashVariance, 2)}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={s.status} />
                    <Button size="icon-sm" variant="ghost" onClick={() => stl.open(s.id)} aria-label={t('Print')}><Printer /></Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>

      <Card className="grid grid-cols-2 gap-3 p-4 md:grid-cols-4">
        <Stat label="Iqama / ID no." value={d.iqamaNo} />
        <Stat label="License expiry" value={fmtDate(d.licenseExpiry)} />
        <Stat label="Vehicle capacity" value={vehicle ? fmtKg(vehicle.capacityKg, 0) : '-'} />
        <Stat label="Insurance expiry" value={vehicle ? fmtDate(vehicle.insuranceExpiry) : '-'} />
      </Card>

      <DriverFormDialog open={edit.isOpen} onOpenChange={edit.onOpenChange} driver={d} />
      <PrintDialog open={slip.isOpen} onOpenChange={slip.onOpenChange} title="Van Loading Slip">{slip.value && <LoadingSlipDoc loadId={slip.value} />}</PrintDialog>
      <PrintDialog open={stl.isOpen} onOpenChange={stl.onOpenChange} title="Daily Driver Settlement" wide>{stl.value && <SettlementDoc settlementId={stl.value} />}</PrintDialog>
    </div>
  )
}
