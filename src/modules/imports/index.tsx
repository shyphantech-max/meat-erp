/** Imports & Shipments: international chicken / mutton imports with tracking timeline and landed cost. */
import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import type { ColumnDef } from '@tanstack/react-table'
import { Anchor, ArrowRight, Calculator, CheckCircle2, ClipboardCheck, Container, FileCheck2, Info, Plus, Ship, Timer, Truck, Warehouse as WarehouseIcon } from 'lucide-react'
import { SHIPMENT_FLOW, type ID, type Shipment, type ShipmentStatus } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { DataTable } from '@/components/tables/DataTable'
import { Alert, EmptyState, Field, KpiCard, Money, NumInput, PageHeader, Panel, Picker, Stat, StatusBadge, useAction } from '@/components/common'
import { useStore } from '@/store/useStore'
import { useT, useName } from '@/i18n'
import * as L from '@/store/logic'
import { landedCost } from '@/store/logic'
import { daysBetween, fmtDate, fmtKg, fmtNum, fmtSAR, round2, shiftDay, todayKey } from '@/lib/format'
import { cn } from '@/lib/utils'

const STAGE_LABEL: Record<ShipmentStatus, string> = {
  booked: 'Booked',
  in_transit: 'In transit',
  arrived_port: 'Arrived at port',
  customs_clearance: 'Customs clearance',
  cleared: 'Cleared',
  delivered: 'Delivered to warehouse',
}
const STAGE_ICON: Record<ShipmentStatus, typeof Ship> = { booked: FileCheck2, in_transit: Ship, arrived_port: Anchor, customs_clearance: Container, cleared: CheckCircle2, delivered: WarehouseIcon }

function etaText(t: (s: string, v?: Record<string, string | number>) => string, s: Shipment) {
  if (s.status === 'delivered') return t('Delivered')
  const d = daysBetween(todayKey(), s.eta)
  if (['arrived_port', 'customs_clearance', 'cleared'].includes(s.status)) return t('At port')
  if (d > 0) return t('{n} days to arrival', { n: d })
  if (d === 0) return t('Arriving today')
  return t('{n} days late', { n: -d })
}

export default function ImportsPage() {
  const t = useT()
  const [params, setParams] = useSearchParams()
  const db = useStore((s) => s.db)
  const [openId, setOpenId] = useState<ID | null>(params.get('id'))
  const [createFor, setCreateFor] = useState<ID | null | ''>(params.get('new'))
  useEffect(() => {
    if (params.get('id') || params.get('new')) setParams((p) => { p.delete('id'); p.delete('new'); return p }, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const rows = useMemo(
    () => db.shipments.map((s) => ({ s, supplier: db.suppliers.find((x) => x.id === s.supplierId), po: db.purchaseOrders.find((p) => p.id === s.poId), lc: landedCost(s) })).sort((a, b) => b.s.shipDate.localeCompare(a.s.shipDate)),
    [db.shipments, db.suppliers, db.purchaseOrders],
  )
  const active = rows.filter((r) => r.s.status !== 'delivered')
  const atPort = rows.filter((r) => ['arrived_port', 'customs_clearance', 'cleared'].includes(r.s.status))
  const pendingPOs = db.purchaseOrders.filter((p) => p.kind === 'import' && ['approved', 'partially_received'].includes(p.status) && !db.shipments.some((s) => s.poId === p.id))
  const inTransitKg = active.reduce((a, r) => a + r.lc.kg, 0)
  const delivered = rows.filter((r) => r.s.status === 'delivered')
  const avgExtra = delivered.length ? delivered.reduce((a, r) => a + r.lc.extraPerKg, 0) / delivered.length : 0

  type Row = (typeof rows)[number]
  const cols: ColumnDef<Row, any>[] = [
    { id: 'ref', header: 'Import ref.', accessorFn: (r) => r.s.ref, cell: ({ row }) => <div><div className="font-semibold">{row.original.s.ref}</div><div className="text-[11px] text-muted-foreground">{row.original.po?.poNo}</div></div> },
    { id: 'supplier', header: 'Supplier', accessorFn: (r) => r.supplier?.name, cell: ({ row }) => <div className="max-w-56"><div className="truncate font-medium">{row.original.supplier?.name}</div><div className="text-[11px] text-muted-foreground">{row.original.s.originCountry} · {row.original.s.originPort}</div></div> },
    { id: 'container', header: 'Container', accessorFn: (r) => r.s.containerNo, cell: ({ row }) => <div><div className="font-mono text-[12px]">{row.original.s.containerNo}</div><div className="text-[11px] text-muted-foreground">{row.original.s.vessel}</div></div> },
    { id: 'ship', header: 'Shipped', accessorFn: (r) => r.s.shipDate, cell: ({ getValue }) => fmtDate(getValue()) },
    { id: 'eta', header: 'ETA', accessorFn: (r) => r.s.eta, cell: ({ row }) => <div><div>{fmtDate(row.original.s.eta)}</div><div className={cn('text-[11px]', daysBetween(todayKey(), row.original.s.eta) < 0 && row.original.s.status === 'in_transit' ? 'text-danger' : 'text-muted-foreground')}>{etaText(t, row.original.s)}</div></div> },
    { id: 'kg', header: 'Qty (KG)', accessorFn: (r) => r.lc.kg, cell: ({ getValue }) => <span className="tabular">{fmtNum(getValue())}</span> },
    { id: 'landed', header: 'Landed cost / kg', accessorFn: (r) => r.lc.perKg, cell: ({ row }) => <div className="text-end"><div className="font-semibold tabular">{fmtSAR(row.original.lc.perKg)}</div><div className="text-[11px] text-muted-foreground">+{fmtNum(row.original.lc.extraPerKg, 2)} {t('charges/kg')}</div></div> },
    { id: 'status', header: 'Status', accessorFn: (r) => r.s.status, cell: ({ getValue }) => <StatusBadge status={getValue()} label={t(STAGE_LABEL[getValue() as ShipmentStatus])} /> },
    { id: 'progress', header: '', enableSorting: false, cell: ({ row }) => <MiniTrack status={row.original.s.status} /> },
  ]
  return (
    <div>
      <PageHeader
        title="Imports & Shipments"
        description="Track international chicken and mutton imports from booking to warehouse, with freight, customs and clearance rolled into landed cost per KG."
        icon={Ship}
        actions={<Button onClick={() => setCreateFor('')} disabled={!pendingPOs.length}><Plus /> {t('New shipment')}</Button>}
      />
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Active shipments" value={active.length} sub={`${fmtKg(inTransitKg, 0)} ${t('on the way')}`} icon={Ship} tone="info" />
        <KpiCard label="At port / customs" value={atPort.length} sub={t('Awaiting clearance & GRN')} icon={Anchor} tone="warning" alert={atPort.length > 0} />
        <KpiCard label="Import POs without shipment" value={pendingPOs.length} sub={t('Approved, booking pending')} icon={FileCheck2} tone="navy" />
        <KpiCard label="Avg. import charges / kg" value={fmtSAR(avgExtra)} sub={t('Freight + customs + clearance')} icon={Calculator} tone="brand" />
      </div>
      {atPort.length > 0 && (
        <div className="mb-4 grid gap-3 md:grid-cols-2">
          {atPort.map((r) => (
            <button key={r.s.id} onClick={() => setOpenId(r.s.id)} className="rounded-xl border bg-card p-4 text-start transition hover:border-brand/40 hover:shadow-sm">
              <div className="flex items-center justify-between gap-2">
                <div className="font-semibold">{r.s.ref} · {r.supplier?.name}</div>
                <StatusBadge status={r.s.status} label={t(STAGE_LABEL[r.s.status])} />
              </div>
              <div className="mt-1 text-[12px] text-muted-foreground">{r.s.containerNo} · {r.s.destinationPort} · {fmtKg(r.lc.kg, 0)}</div>
              <ShipmentTimeline s={r.s} compact className="mt-3" />
            </button>
          ))}
        </div>
      )}
      {rows.length === 0 ? (
        <EmptyState icon={Ship} title="No shipments yet" description="Create a shipment for an approved import purchase order." />
      ) : (
        <DataTable
          data={rows}
          columns={cols}
          onRowClick={(r) => setOpenId(r.s.id)}
          searchPlaceholder="Search ref., container, supplier…"
          searchText={(r) => `${r.s.ref} ${r.s.containerNo} ${r.s.vessel} ${r.supplier?.name} ${r.s.originCountry} ${r.po?.poNo}`}
          facets={[
            { id: 'status', label: 'Status', value: (r) => r.s.status, options: SHIPMENT_FLOW.map((v) => ({ value: v, label: STAGE_LABEL[v] })) },
            { id: 'origin', label: 'Origin', value: (r) => r.s.originCountry },
          ]}
          exportName="import-shipments"
        />
      )}
      <ShipmentSheet id={openId} onOpenChange={(o) => !o && setOpenId(null)} />
      <CreateShipmentDialog poId={createFor} onOpenChange={(o) => !o && setCreateFor(null)} onCreated={(id) => setOpenId(id)} />
    </div>
  )
}

function MiniTrack({ status }: { status: ShipmentStatus }) {
  const idx = SHIPMENT_FLOW.indexOf(status)
  return (
    <div className="flex items-center gap-0.5">
      {SHIPMENT_FLOW.map((s, i) => <span key={s} className={cn('h-1.5 w-4 rounded-full', i <= idx ? 'bg-brand' : 'bg-muted')} />)}
    </div>
  )
}

export function ShipmentTimeline({ s, compact, className }: { s: Shipment; compact?: boolean; className?: string }) {
  const t = useT()
  const idx = SHIPMENT_FLOW.indexOf(s.status)
  if (compact)
    return (
      <ol className={cn('flex items-start', className)}>
        {SHIPMENT_FLOW.map((st, i) => {
          const Icon = STAGE_ICON[st]
          return (
            <li key={st} className="relative flex flex-1 flex-col items-center text-center">
              {i > 0 && <span className={cn('absolute top-3.5 end-1/2 h-0.5 w-full -translate-y-1/2', i <= idx ? 'bg-brand' : 'bg-border')} />}
              <span className={cn('relative z-10 flex size-7 items-center justify-center rounded-full border-2', i < idx || (i === idx && st === 'delivered') ? 'border-brand bg-brand text-white' : i === idx ? 'border-brand bg-card text-brand ring-4 ring-brand/15' : 'border-border bg-card text-muted-foreground')}>
                <Icon className="size-3.5" />
              </span>
              <span className="mt-1 hidden text-[10.5px] leading-tight text-muted-foreground sm:block">{t(STAGE_LABEL[st])}</span>
            </li>
          )
        })}
      </ol>
    )
  return (
    <ol className={cn('relative space-y-0', className)}>
      {SHIPMENT_FLOW.map((st, i) => {
        const ev = [...s.events].reverse().find((e) => e.status === st)
        const done = i <= idx
        const current = i === idx && st !== 'delivered'
        const Icon = STAGE_ICON[st]
        return (
          <li key={st} className="relative flex gap-3 pb-5 last:pb-0">
            {i < SHIPMENT_FLOW.length - 1 && <span className={cn('absolute start-[15px] top-8 h-[calc(100%-1.5rem)] w-0.5', i < idx ? 'bg-brand' : 'bg-border')} />}
            <span className={cn('relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full border-2', done && !current ? 'border-brand bg-brand text-white' : current ? 'border-brand bg-card text-brand ring-4 ring-brand/15' : 'border-border bg-card text-muted-foreground')}>
              <Icon className="size-4" />
            </span>
            <div className="min-w-0 pt-1">
              <div className={cn('text-[13px] font-semibold', !done && 'text-muted-foreground')}>{t(STAGE_LABEL[st])}{current && <span className="ms-2 rounded-full bg-brand-soft px-2 py-0.5 text-[10.5px] font-medium text-brand">{t('Current')}</span>}</div>
              <div className="text-[12px] text-muted-foreground">
                {ev ? `${fmtDate(ev.at)}${ev.note ? ` · ${ev.note}` : ''}` : st === 'arrived_port' && !done ? `${t('ETA')} ${fmtDate(s.eta)}` : '-'}
              </div>
            </div>
          </li>
        )
      })}
    </ol>
  )
}

function ShipmentSheet({ id, onOpenChange }: { id: ID | null; onOpenChange: (o: boolean) => void }) {
  const t = useT()
  const name = useName()
  const act = useAction()
  const db = useStore((s) => s.db)
  const s = db.shipments.find((x) => x.id === id)
  const [note, setNote] = useState('')
  const [date, setDate] = useState(todayKey())
  useEffect(() => { setNote(''); setDate(todayKey()) }, [id])
  if (!s) return <Sheet open={false} onOpenChange={onOpenChange}><SheetContent /></Sheet>
  const sup = db.suppliers.find((x) => x.id === s.supplierId)
  const po = db.purchaseOrders.find((p) => p.id === s.poId)
  const grns = db.grns.filter((g) => g.shipmentId === s.id || g.poId === s.poId)
  const lc = landedCost(s)
  const idx = SHIPMENT_FLOW.indexOf(s.status)
  const next = SHIPMENT_FLOW[idx + 1]
  const canAdvance = next && next !== 'delivered'
  const charges = s.freightSAR + s.customsSAR + s.clearanceSAR
  return (
    <Sheet open={!!s} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto sm:max-w-2xl">
        <SheetHeader>
          <div className="flex flex-wrap items-center gap-2">
            <SheetTitle>{s.ref}</SheetTitle>
            <StatusBadge status={s.status} label={t(STAGE_LABEL[s.status])} />
          </div>
          <SheetDescription>{sup?.name} · {po?.poNo} · {s.originPort} → {s.destinationPort}</SheetDescription>
        </SheetHeader>
        <div className="space-y-5 p-5">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="Container" value={<span className="font-mono text-[13px]">{s.containerNo}</span>} />
            <Stat label="Vessel" value={<span className="text-[13px]">{s.vessel}</span>} />
            <Stat label="Shipped" value={fmtDate(s.shipDate)} />
            <Stat label="ETA" value={fmtDate(s.eta)} tone={s.status === 'in_transit' && s.eta < todayKey() ? 'danger' : undefined} />
          </div>
          <div className="flex items-center gap-2 rounded-lg border bg-brand-soft/40 px-3 py-2 text-[13px]">
            <Timer className="size-4 text-brand" /> <span className="font-medium">{etaText(t, s)}</span>
          </div>
          <Panel title="Shipment tracking" icon={Truck}>
            <ShipmentTimeline s={s} />
            {canAdvance && (
              <div className="mt-4 space-y-2 rounded-lg border bg-muted/40 p-3">
                <div className="text-[12.5px] font-medium">{t('Advance to')}: {t(STAGE_LABEL[next])}</div>
                <div className="grid gap-2 sm:grid-cols-[150px_1fr_auto]">
                  <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                  <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('Note (optional)')} />
                  <Button onClick={() => { if (act((d, c) => L.advanceShipment(d, c, s.id, next, date, note || undefined), 'Shipment status updated').ok) setNote('') }}>
                    <ArrowRight className="flip-rtl" /> {t('Advance')}
                  </Button>
                </div>
              </div>
            )}
            {s.status === 'cleared' && (
              <Alert tone="info" icon={Info} className="mt-4">
                {t('“Delivered to warehouse” is set automatically when the GRN for this shipment is approved and stock is posted.')}
                {po && ['approved', 'partially_received'].includes(po.status) && (
                  <div className="mt-2"><Button size="sm" asChild><Link to={`/grn?po=${po.id}`}><ClipboardCheck /> {t('Create GRN')}</Link></Button></div>
                )}
              </Alert>
            )}
          </Panel>
          <Panel title="Estimated landed cost" icon={Calculator}>
            <div className="space-y-1.5 text-[13px]">
              <CostLine label="Goods value (CFR)" value={s.goodsValueSAR} total={lc.total} />
              <CostLine label="Freight charges" value={s.freightSAR} total={lc.total} />
              <CostLine label="Customs charges" value={s.customsSAR} total={lc.total} />
              <CostLine label="Clearance expenses" value={s.clearanceSAR} total={lc.total} />
              <div className="flex justify-between border-t pt-2 font-semibold"><span>{t('Total landed cost')}</span><Money value={lc.total} /></div>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2">
              <Stat label="Total KG" value={fmtNum(lc.kg)} />
              <Stat label="Charges / kg" value={fmtSAR(lc.extraPerKg)} />
              <Stat label="Landed / kg" value={fmtSAR(lc.perKg)} tone="brand" />
            </div>
            <div className="mt-3 overflow-x-auto rounded-lg border">
              <table className="w-full text-[12.5px]">
                <thead className="bg-muted/50 text-[11px] text-muted-foreground uppercase">
                  <tr>
                    <th className="px-3 py-2 text-start">{t('Product')}</th>
                    <th className="px-3 py-2 text-end">{t('Qty (KG)')}</th>
                    <th className="px-3 py-2 text-end">{t('FOB / CFR per kg')}</th>
                    <th className="px-3 py-2 text-end">{t('Landed / kg')}</th>
                    <th className="px-3 py-2 text-end">{t('List price')}</th>
                    <th className="px-3 py-2 text-end">{t('Margin')}</th>
                  </tr>
                </thead>
                <tbody>
                  {s.lines.map((l) => {
                    const p = db.products.find((x) => x.id === l.productId)
                    const pl = po?.lines.find((x) => x.productId === l.productId)
                    const base = pl && po ? pl.rate * po.fxRate : 0
                    const landed = round2(base + lc.extraPerKg)
                    const margin = p && p.sellPrice ? ((p.sellPrice - landed) / p.sellPrice) * 100 : 0
                    return (
                      <tr key={l.productId} className="border-t">
                        <td className="px-3 py-2 font-medium">{name(p)}</td>
                        <td className="px-3 py-2 text-end tabular">{fmtNum(l.qtyKg)}</td>
                        <td className="px-3 py-2 text-end tabular">{fmtSAR(base)}</td>
                        <td className="px-3 py-2 text-end font-semibold tabular">{fmtSAR(landed)}</td>
                        <td className="px-3 py-2 text-end tabular">{fmtSAR(p?.sellPrice ?? 0)}</td>
                        <td className={cn('px-3 py-2 text-end tabular', margin < 10 ? 'text-danger' : 'text-success')}>{fmtNum(margin, 1)}%</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-[11.5px] text-muted-foreground">{t('Charges are allocated by weight. Landed cost becomes the batch unit cost when the GRN is created.')} ({fmtNum((charges / Math.max(1, lc.total)) * 100, 1)}% {t('of landed cost')})</p>
          </Panel>
          <Panel title="Goods received notes">
            {grns.length === 0 ? (
              <p className="text-center text-[12px] text-muted-foreground">{t('No GRN yet')}</p>
            ) : (
              <div className="divide-y">
                {grns.map((g) => (
                  <Link key={g.id} to={`/grn?id=${g.id}`} className="flex items-center justify-between gap-2 py-2 text-[12.5px] hover:text-brand">
                    <span className="font-medium">{g.grnNo}</span>
                    <span className="text-muted-foreground">{fmtDate(g.receivedDate)} · {fmtKg(g.lines.reduce((a, l) => a + l.acceptedKg, 0), 0)}</span>
                    <StatusBadge status={g.status} />
                  </Link>
                ))}
              </div>
            )}
          </Panel>
        </div>
      </SheetContent>
    </Sheet>
  )
}

function CostLine({ label, value, total }: { label: string; value: number; total: number }) {
  const t = useT()
  return (
    <div className="flex items-center gap-3">
      <span className="w-40 shrink-0 text-muted-foreground">{t(label)}</span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-brand" style={{ width: `${total ? (value / total) * 100 : 0}%` }} /></div>
      <Money value={value} className="w-32 text-end" />
    </div>
  )
}

function CreateShipmentDialog({ poId, onOpenChange, onCreated }: { poId: ID | null | ''; onOpenChange: (o: boolean) => void; onCreated: (id: ID) => void }) {
  const t = useT()
  const act = useAction()
  const db = useStore((s) => s.db)
  const eligible = db.purchaseOrders.filter((p) => p.kind === 'import' && ['approved', 'partially_received'].includes(p.status) && !db.shipments.some((s) => s.poId === p.id))
  const open = poId !== null
  const [f, setF] = useState({ poId: '', originPort: '', destinationPort: 'Jeddah Islamic Port', containerNo: '', vessel: '', shipDate: todayKey(), eta: shiftDay(todayKey(), 28), freightSAR: 0, customsSAR: 0, clearanceSAR: 0, notes: '' })
  const [tried, setTried] = useState(false)
  const choose = (id: ID) => {
    const po = db.purchaseOrders.find((p) => p.id === id)
    if (!po) return
    const kg = po.lines.reduce((s, l) => s + l.qtyKg, 0)
    const containers = Math.max(1, Math.round(kg / 25000))
    setF((x) => ({ ...x, poId: id, destinationPort: po.warehouseId === 'wh_2' ? 'Jeddah Islamic Port' : 'Dammam King Abdulaziz Port', freightSAR: containers * 16500, customsSAR: Math.round(po.totalSAR * 0.05), clearanceSAR: containers * 3500, eta: shiftDay(x.shipDate, 28) }))
  }
  useEffect(() => {
    if (!open) return
    setTried(false)
    setF((x) => ({ ...x, poId: '', containerNo: '', vessel: '', originPort: '', notes: '', shipDate: todayKey(), eta: shiftDay(todayKey(), 28) }))
    const first = poId || eligible[0]?.id
    if (first) setTimeout(() => choose(first), 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, poId])
  const po = db.purchaseOrders.find((p) => p.id === f.poId)
  const sup = po && db.suppliers.find((s) => s.id === po.supplierId)
  const kg = po?.lines.reduce((s, l) => s + l.qtyKg, 0) ?? 0
  const perKg = kg ? (po!.totalSAR + f.freightSAR + f.customsSAR + f.clearanceSAR) / kg : 0
  const errors: Record<string, string> = {}
  if (!f.poId) errors.po = 'Select a purchase order'
  if (!/^[A-Z]{4}\d{7}$/.test(f.containerNo.trim().toUpperCase())) errors.container = 'Container no. format: 4 letters + 7 digits (e.g. MSCU1234567)'
  if (!f.vessel.trim()) errors.vessel = 'Vessel name is required'
  if (!f.originPort.trim()) errors.origin = 'Origin port is required'
  if (f.eta < f.shipDate) errors.eta = 'Expected arrival must be after the shipment date'
  const save = () => {
    setTried(true)
    if (Object.keys(errors).length || !po || !sup) return
    const r = act((d, c) => L.createShipment(d, c, {
      poId: po.id, supplierId: sup.id, originCountry: sup.country, originPort: f.originPort, destinationPort: f.destinationPort, containerNo: f.containerNo.trim().toUpperCase(),
      vessel: f.vessel, shipDate: f.shipDate, eta: f.eta, freightSAR: f.freightSAR, customsSAR: f.customsSAR, clearanceSAR: f.clearanceSAR,
    }), 'Shipment created')
    if (r.ok && r.id) { onOpenChange(false); onCreated(r.id) }
  }
  const e = (k: string) => (tried ? errors[k] : undefined)
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('New import shipment')}</DialogTitle>
        </DialogHeader>
        {eligible.length === 0 ? (
          <EmptyState icon={Ship} title="No eligible purchase orders" description="Approve an import purchase order first; each import PO can have one shipment." />
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Import purchase order" required error={e('po')} className="sm:col-span-2">
                <Picker value={f.poId} onChange={choose} options={eligible.map((p) => ({ value: p.id, label: `${p.poNo} · ${db.suppliers.find((s) => s.id === p.supplierId)?.name} · ${fmtSAR(p.totalSAR)}` }))} />
              </Field>
              <Field label="Origin port" required error={e('origin')}>
                <Input value={f.originPort} onChange={(x) => setF({ ...f, originPort: x.target.value })} placeholder={sup?.country} />
              </Field>
              <Field label="Destination port">
                <Picker value={f.destinationPort} onChange={(v) => setF({ ...f, destinationPort: v })} options={['Jeddah Islamic Port', 'Dammam King Abdulaziz Port', 'Dammam King Abdulaziz Port → Riyadh Dry Port'].map((v) => ({ value: v, label: v }))} />
              </Field>
              <Field label="Container number" required error={e('container')}>
                <Input value={f.containerNo} onChange={(x) => setF({ ...f, containerNo: x.target.value.toUpperCase() })} placeholder="MSCU1234567" className="font-mono" dir="ltr" />
              </Field>
              <Field label="Vessel" required error={e('vessel')}>
                <Input value={f.vessel} onChange={(x) => setF({ ...f, vessel: x.target.value })} />
              </Field>
              <Field label="Shipment date">
                <Input type="date" value={f.shipDate} onChange={(x) => setF({ ...f, shipDate: x.target.value })} />
              </Field>
              <Field label="Expected arrival" error={e('eta')}>
                <Input type="date" value={f.eta} onChange={(x) => setF({ ...f, eta: x.target.value })} />
              </Field>
              <Field label="Freight charges (SAR)">
                <NumInput value={f.freightSAR} onChange={(v) => setF({ ...f, freightSAR: v })} />
              </Field>
              <Field label="Customs charges (SAR)" hint="Default 5% of goods value">
                <NumInput value={f.customsSAR} onChange={(v) => setF({ ...f, customsSAR: v })} />
              </Field>
              <Field label="Clearance expenses (SAR)">
                <NumInput value={f.clearanceSAR} onChange={(v) => setF({ ...f, clearanceSAR: v })} />
              </Field>
              <Field label="Notes">
                <Textarea rows={1} value={f.notes} onChange={(x) => setF({ ...f, notes: x.target.value })} />
              </Field>
            </div>
            {po && (
              <div className="grid grid-cols-3 gap-2">
                <Stat label="Goods value" value={fmtSAR(po.totalSAR, { compact: true })} />
                <Stat label="Total KG" value={fmtNum(kg)} />
                <Stat label="Est. landed / kg" value={fmtSAR(perKg)} tone="brand" />
              </div>
            )}
          </>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t('Cancel')}</Button>
          <Button onClick={save} disabled={!eligible.length}>{t('Create shipment')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
