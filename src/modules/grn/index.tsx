/** Goods Received Notes: receive → quality check → approve (posts batches to inventory) / reject. */
import { useEffect, useMemo, useState } from 'react'
import { BRAND } from '@/lib/brand'
import { Link, useSearchParams } from 'react-router-dom'
import type { ColumnDef } from '@tanstack/react-table'
import { CheckCircle2, ClipboardCheck, FlaskConical, PackageCheck, PackageX, Plus, Printer, ShieldCheck, Thermometer, XCircle } from 'lucide-react'
import type { GRN, ID, PurchaseOrder } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { DataTable } from '@/components/tables/DataTable'
import { Alert, DocFooterNote, DocHeader, EmptyState, Field, KpiCard, Kg, NumInput, PageHeader, Panel, Picker, PrintDialog, Stat, StatusBadge, Stepper, useAction } from '@/components/common'
import { ReasonDialog } from '@/modules/purchases/dialogs'
import { useStore } from '@/store/useStore'
import { useT, useName } from '@/i18n'
import * as L from '@/store/logic'
import { fmtDate, fmtDateTime, fmtKg, fmtNum, fmtSAR, round2, shiftDay, todayKey } from '@/lib/format'
import { cn } from '@/lib/utils'

const GRN_STEPS = ['Purchase', 'Goods received', 'Quality check', 'GRN approval', 'Inventory updated']
const grnStep = (g: GRN) => (g.status === 'received' ? 2 : g.status === 'qc_passed' ? 3 : g.status === 'approved' ? 4 : g.qcBy ? 3 : 2)

export default function GRNPage() {
  const t = useT()
  const [params, setParams] = useSearchParams()
  const db = useStore((s) => s.db)
  const [createPo, setCreatePo] = useState<ID | null | ''>(params.get('po'))
  const [openId, setOpenId] = useState<ID | null>(params.get('id'))
  const [qcId, setQcId] = useState<ID | null>(null)
  useEffect(() => {
    if (params.get('po') || params.get('id')) setParams((p) => { p.delete('po'); p.delete('id'); return p }, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const rows = useMemo(
    () => db.grns.map((g) => ({
      g,
      supplier: db.suppliers.find((s) => s.id === g.supplierId),
      po: db.purchaseOrders.find((p) => p.id === g.poId),
      wh: db.warehouses.find((w) => w.id === g.warehouseId),
      recv: g.lines.reduce((s, l) => s + l.receivedKg, 0),
      acc: g.lines.reduce((s, l) => s + l.acceptedKg, 0),
      rej: g.lines.reduce((s, l) => s + l.rejectedKg, 0),
      value: g.lines.reduce((s, l) => s + l.acceptedKg * l.unitCostSAR, 0),
    })).sort((a, b) => b.g.receivedDate.localeCompare(a.g.receivedDate) || b.g.grnNo.localeCompare(a.g.grnNo)),
    [db.grns, db.suppliers, db.purchaseOrders, db.warehouses],
  )
  const awaitingQC = rows.filter((r) => r.g.status === 'received')
  const awaitingApproval = rows.filter((r) => r.g.status === 'qc_passed')
  const month = todayKey().slice(0, 7)
  const approvedMonth = rows.filter((r) => r.g.status === 'approved' && r.g.receivedDate.startsWith(month))
  const rejectedKg = rows.filter((r) => r.g.receivedDate.startsWith(month)).reduce((s, r) => s + r.rej, 0)
  const receivable = db.purchaseOrders.filter((p) => ['approved', 'partially_received'].includes(p.status))

  type Row = (typeof rows)[number]
  const name = useName()
  const cols: ColumnDef<Row, any>[] = [
    { id: 'grn', header: 'GRN no.', accessorFn: (r) => r.g.grnNo, cell: ({ row }) => <div><div className="font-semibold">{row.original.g.grnNo}</div><div className="text-[11px] text-muted-foreground">{row.original.po?.poNo}</div></div> },
    { id: 'date', header: 'Received', accessorFn: (r) => r.g.receivedDate, cell: ({ getValue }) => fmtDate(getValue()) },
    { id: 'supplier', header: 'Supplier', accessorFn: (r) => r.supplier?.name, cell: ({ getValue }) => <span className="block max-w-52 truncate">{getValue()}</span> },
    { id: 'products', header: 'Products', accessorFn: (r) => r.g.lines.map((l) => db.products.find((p) => p.id === l.productId)?.name).join(', '), cell: ({ row }) => <span className="block max-w-56 truncate text-[12.5px]">{row.original.g.lines.map((l) => name(db.products.find((p) => p.id === l.productId))).join(', ')}</span> },
    { id: 'wh', header: 'Warehouse', accessorFn: (r) => r.wh?.name, cell: ({ row }) => name(row.original.wh) },
    { id: 'recv', header: 'Received KG', accessorFn: (r) => r.recv, cell: ({ getValue }) => <span className="tabular">{fmtNum(getValue())}</span> },
    { id: 'acc', header: 'Accepted KG', accessorFn: (r) => r.acc, cell: ({ row }) => <span className="font-medium tabular">{row.original.g.status === 'received' ? '-' : fmtNum(row.original.acc)}</span> },
    { id: 'rej', header: 'Rejected KG', accessorFn: (r) => r.rej, cell: ({ getValue }) => <span className={cn('tabular', getValue() > 0 ? 'text-danger' : 'text-muted-foreground')}>{fmtNum(getValue())}</span> },
    { id: 'status', header: 'Status', accessorFn: (r) => r.g.status, cell: ({ getValue }) => <StatusBadge status={getValue()} /> },
    {
      id: 'actions', header: '', enableSorting: false,
      cell: ({ row }) => (
        <div className="flex justify-end" onClick={(e) => e.stopPropagation()}>
          {row.original.g.status === 'received' && <Button size="sm" variant="outline" onClick={() => setQcId(row.original.g.id)}><FlaskConical /> {t('QC')}</Button>}
          {row.original.g.status === 'qc_passed' && <Button size="sm" onClick={() => setOpenId(row.original.g.id)}><ShieldCheck /> {t('Review')}</Button>}
        </div>
      ),
    },
  ]
  return (
    <div>
      <PageHeader
        title="Goods Received Notes"
        description="Receive local purchases and imports, run the quality check, then approve the GRN to post batches into warehouse inventory."
        icon={ClipboardCheck}
        actions={<Button onClick={() => setCreatePo('')} disabled={!receivable.length}><Plus /> {t('New GRN')}</Button>}
      />
      <Panel className="mb-5" bodyClassName="py-5">
        <Stepper steps={GRN_STEPS} current={awaitingQC.length ? 2 : awaitingApproval.length ? 3 : 4} />
        <p className="mt-3 text-center text-[12px] text-muted-foreground">{t('Stock is added to the warehouse only once, when the GRN is approved. Rejected quantities never enter inventory.')}</p>
      </Panel>
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Awaiting quality check" value={awaitingQC.length} sub={fmtKg(awaitingQC.reduce((s, r) => s + r.recv, 0), 0)} icon={FlaskConical} tone="warning" alert={awaitingQC.length > 0} />
        <KpiCard label="Awaiting approval" value={awaitingApproval.length} sub={fmtKg(awaitingApproval.reduce((s, r) => s + r.acc, 0), 0)} icon={ShieldCheck} tone="info" alert={awaitingApproval.length > 0} />
        <KpiCard label="Approved this month" value={approvedMonth.length} sub={fmtKg(approvedMonth.reduce((s, r) => s + r.acc, 0), 0)} icon={PackageCheck} tone="success" />
        <KpiCard label="Rejected this month" value={fmtKg(rejectedKg, 0)} sub={t('Quality rejections')} icon={PackageX} tone="danger" />
      </div>
      {(awaitingQC.length > 0 || awaitingApproval.length > 0) && (
        <div className="mb-5 grid gap-3 md:grid-cols-2">
          {[...awaitingQC, ...awaitingApproval].map((r) => (
            <div key={r.g.id} className="flex items-center gap-3 rounded-xl border bg-card p-3.5">
              <div className={cn('flex size-10 shrink-0 items-center justify-center rounded-lg', r.g.status === 'received' ? 'bg-warning-soft text-warning' : 'bg-info-soft text-info')}>
                {r.g.status === 'received' ? <FlaskConical className="size-5" /> : <ShieldCheck className="size-5" />}
              </div>
              <button className="min-w-0 flex-1 text-start" onClick={() => setOpenId(r.g.id)}>
                <div className="truncate text-[13px] font-semibold">{r.g.grnNo} · {r.supplier?.name}</div>
                <div className="text-[12px] text-muted-foreground">{fmtDate(r.g.receivedDate)} · {fmtKg(r.recv, 0)} · {name(r.wh)}</div>
              </button>
              {r.g.status === 'received' ? (
                <Button size="sm" onClick={() => setQcId(r.g.id)}>{t('Quality check')}</Button>
              ) : (
                <Button size="sm" onClick={() => setOpenId(r.g.id)}>{t('Approve')}</Button>
              )}
            </div>
          ))}
        </div>
      )}
      {rows.length === 0 ? (
        <EmptyState icon={ClipboardCheck} title="No GRNs yet" description="Receive goods against an approved purchase order." />
      ) : (
        <DataTable
          data={rows}
          columns={cols}
          onRowClick={(r) => setOpenId(r.g.id)}
          searchPlaceholder="Search GRN, PO, supplier, batch…"
          searchText={(r) => `${r.g.grnNo} ${r.po?.poNo} ${r.supplier?.name} ${r.g.lines.map((l) => `${l.batchNo} ${db.products.find((p) => p.id === l.productId)?.name}`).join(' ')}`}
          facets={[
            { id: 'status', label: 'Status', value: (r) => r.g.status, options: ['received', 'qc_passed', 'approved', 'rejected'].map((v) => ({ value: v, label: v })) },
            { id: 'wh', label: 'Warehouse', value: (r) => r.g.warehouseId, options: db.warehouses.map((w) => ({ value: w.id, label: w.name })) },
            { id: 'type', label: 'Type', value: (r) => r.po?.kind, options: [{ value: 'local', label: 'Local' }, { value: 'import', label: 'Import' }] },
          ]}
          exportName="grn-register"
        />
      )}
      <CreateGRNDialog poId={createPo} onOpenChange={(o) => !o && setCreatePo(null)} onCreated={(id) => setQcId(id)} />
      <QCDialog grnId={qcId} onOpenChange={(o) => !o && setQcId(null)} onDone={(id) => setOpenId(id)} />
      <GRNSheet id={openId} onOpenChange={(o) => !o && setOpenId(null)} onQC={(id) => { setOpenId(null); setQcId(id) }} />
    </div>
  )
}

// ───────────────────────── create ─────────────────────────
interface LineForm { productId: ID; include: boolean; openKg: number; receivedKg: number; cartons: number; batchNo: string; productionDate: string; expiryDate: string }

function CreateGRNDialog({ poId, onOpenChange, onCreated }: { poId: ID | null | ''; onOpenChange: (o: boolean) => void; onCreated: (id: ID) => void }) {
  const t = useT()
  const name = useName()
  const act = useAction()
  const db = useStore((s) => s.db)
  const open = poId !== null
  const eligible = db.purchaseOrders.filter((p) => ['approved', 'partially_received'].includes(p.status))
  const [sel, setSel] = useState<ID>('')
  const [warehouseId, setWarehouseId] = useState<ID>('')
  const [date, setDate] = useState(todayKey())
  const [receivedBy, setReceivedBy] = useState('Store Keeper · Ramesh Pillai')
  const [temp, setTemp] = useState<number>(-18)
  const [lines, setLines] = useState<LineForm[]>([])
  const [tried, setTried] = useState(false)

  const build = (po: PurchaseOrder, d: string) => {
    setWarehouseId(po.warehouseId)
    const pending = (pid: ID) => db.grns.filter((g) => g.poId === po.id && (g.status === 'received' || g.status === 'qc_passed')).reduce((s, g) => s + (g.lines.find((l) => l.productId === pid)?.receivedKg ?? 0), 0)
    const frozen = po.lines.every((l) => db.products.find((p) => p.id === l.productId)?.category === 'frozen')
    setTemp(frozen ? -18 : 2)
    setLines(po.lines.map((l, i) => {
      const p = db.products.find((x) => x.id === l.productId)!
      const openKg = Math.max(0, round2(l.qtyKg - l.receivedKg - pending(l.productId)))
      return {
        productId: l.productId, include: openKg > 0, openKg, receivedKg: openKg, cartons: Math.round(openKg / p.cartonKg),
        batchNo: `${p.code.split('-')[1]}${d.replace(/-/g, '').slice(2)}${String.fromCharCode(65 + i)}`,
        productionDate: shiftDay(d, p.category === 'frozen' ? -30 : -1),
        expiryDate: shiftDay(d, p.category === 'frozen' ? 330 : p.shelfLifeDays),
      }
    }))
  }
  useEffect(() => {
    if (!open) return
    setTried(false)
    const d = todayKey()
    setDate(d)
    const first = eligible.find((p) => p.id === poId) ?? eligible[0]
    setSel(first?.id ?? '')
    if (first) build(first, d)
    else setLines([])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, poId])
  const po = db.purchaseOrders.find((p) => p.id === sel)
  const setLine = (i: number, patch: Partial<LineForm>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)))
  const chosen = lines.filter((l) => l.include && l.receivedKg > 0)
  const lineErr = (l: LineForm) => {
    if (!l.include) return undefined
    if (!(l.receivedKg > 0)) return 'Enter received KG'
    if (l.receivedKg > l.openKg * 1.02 + 0.5) return 'Exceeds open PO quantity (2% tolerance)'
    if (!l.batchNo.trim()) return 'Batch number required'
    if (!l.expiryDate || l.expiryDate <= date) return 'Expiry must be after the received date'
    return undefined
  }
  const anyErr = !po || !chosen.length || lines.some((l) => lineErr(l))
  const save = () => {
    setTried(true)
    if (anyErr || !po) return
    const r = act((d, c) => L.createGRN(d, c, {
      poId: po.id, warehouseId, receivedDate: date, receivedBy, vehicleTempC: temp,
      lines: chosen.map((l) => ({ productId: l.productId, receivedKg: l.receivedKg, cartons: l.cartons, batchNo: l.batchNo.trim(), productionDate: l.productionDate, expiryDate: l.expiryDate })),
    }), 'Goods received - send to quality check')
    if (r.ok && r.id) { onOpenChange(false); onCreated(r.id) }
  }
  const tempWarn = po && (lines.some((l) => l.include && db.products.find((p) => p.id === l.productId)?.category === 'frozen') ? temp > -15 : temp > 4)
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>{t('New goods received note')}</DialogTitle>
        </DialogHeader>
        {eligible.length === 0 ? (
          <EmptyState icon={ClipboardCheck} title="Nothing to receive" description="There are no approved purchase orders with open quantities." />
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-5">
              <Field label="Purchase reference" required className="sm:col-span-2">
                <Picker value={sel} onChange={(v) => { setSel(v); const p = db.purchaseOrders.find((x) => x.id === v); if (p) build(p, date) }} options={eligible.map((p) => ({ value: p.id, label: `${p.poNo} · ${db.suppliers.find((s) => s.id === p.supplierId)?.name}` }))} />
              </Field>
              <Field label="Warehouse" required>
                <Picker value={warehouseId} onChange={setWarehouseId} options={db.warehouses.map((w) => ({ value: w.id, label: name(w) }))} />
              </Field>
              <Field label="Received date">
                <Input type="date" value={date} max={todayKey()} onChange={(e) => setDate(e.target.value)} />
              </Field>
              <Field label="Truck temp. (°C)" error={tempWarn ? 'Temperature outside cold-chain limit' : undefined}>
                <NumInput value={temp} min={-40} onChange={setTemp} step="0.1" />
              </Field>
              <Field label="Received by" className="sm:col-span-2">
                <Input value={receivedBy} onChange={(e) => setReceivedBy(e.target.value)} />
              </Field>
              {po && <div className="flex items-end text-[12px] text-muted-foreground sm:col-span-3">{t('Supplier')}: <span className="ms-1 font-medium text-foreground">{db.suppliers.find((s) => s.id === po.supplierId)?.name}</span> · {t(po.kind === 'import' ? 'Import' : 'Local purchase')}{po.kind === 'import' && db.shipments.find((s) => s.poId === po.id) && ` · ${db.shipments.find((s) => s.poId === po.id)!.ref}`}</div>}
            </div>
            <div className="space-y-2">
              {lines.map((l, i) => {
                const p = db.products.find((x) => x.id === l.productId)!
                const err = tried ? lineErr(l) : undefined
                return (
                  <div key={l.productId} className={cn('rounded-lg border p-3', !l.include && 'opacity-55', err && 'border-danger/50')}>
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <Checkbox checked={l.include} onCheckedChange={(v) => setLine(i, { include: !!v })} disabled={l.openKg <= 0} />
                      <span className="font-medium">{name(p)}</span>
                      <StatusBadge status={p.category} label={t(p.category === 'frozen' ? 'Frozen' : p.category === 'chilled' ? 'Chilled' : 'Fresh')} />
                      <span className="ms-auto text-[12px] text-muted-foreground">{t('Open on PO')}: <span className="font-medium tabular">{fmtKg(l.openKg, 0)}</span></span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
                      <Field label="Received KG"><NumInput value={l.receivedKg} onChange={(v) => setLine(i, { receivedKg: v, cartons: Math.round(v / p.cartonKg) })} disabled={!l.include} /></Field>
                      <Field label="Cartons"><NumInput value={l.cartons} onChange={(v) => setLine(i, { cartons: v })} disabled={!l.include} /></Field>
                      <Field label="Batch no."><Input value={l.batchNo} onChange={(e) => setLine(i, { batchNo: e.target.value })} disabled={!l.include} className="font-mono" dir="ltr" /></Field>
                      <Field label="Production date"><Input type="date" value={l.productionDate} onChange={(e) => setLine(i, { productionDate: e.target.value })} disabled={!l.include} /></Field>
                      <Field label="Expiry date"><Input type="date" value={l.expiryDate} onChange={(e) => setLine(i, { expiryDate: e.target.value })} disabled={!l.include} /></Field>
                    </div>
                    {err && <p className="mt-1.5 text-[11.5px] text-danger">{t(err)}</p>}
                  </div>
                )
              })}
              {tried && !chosen.length && <p className="text-[11.5px] text-danger">{t('Enter received quantity for at least one product')}</p>}
            </div>
            <div className="flex justify-end gap-6 text-[13px]">
              <span>{t('Total received')}: <span className="font-semibold tabular">{fmtKg(chosen.reduce((s, l) => s + l.receivedKg, 0))}</span></span>
            </div>
          </>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t('Cancel')}</Button>
          <Button onClick={save} disabled={!eligible.length}><PackageCheck /> {t('Save & send to QC')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ───────────────────────── quality check ─────────────────────────
const REJECT_REASONS = ['Torn cartons', 'Thawed / refrozen packs', 'Short weight packs', 'Packaging damage', 'Temperature abuse', 'Missing halal label']

function QCDialog({ grnId, onOpenChange, onDone }: { grnId: ID | null; onOpenChange: (o: boolean) => void; onDone: (id: ID) => void }) {
  const t = useT()
  const name = useName()
  const act = useAction()
  const g = useStore((s) => s.db.grns.find((x) => x.id === grnId))
  const products = useStore((s) => s.db.products)
  const [rows, setRows] = useState<{ productId: ID; acceptedKg: number; rejectReason: string }[]>([])
  const [notes, setNotes] = useState('')
  const [checks, setChecks] = useState({ temp: false, pack: false, label: false, halal: false })
  const [tried, setTried] = useState(false)
  useEffect(() => {
    if (g) {
      setRows(g.lines.map((l) => ({ productId: l.productId, acceptedKg: l.receivedKg, rejectReason: '' })))
      setNotes('')
      setChecks({ temp: false, pack: false, label: false, halal: false })
      setTried(false)
    }
  }, [g?.id]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!g) return null
  const allChecked = Object.values(checks).every(Boolean)
  const errFor = (i: number) => {
    const l = g.lines[i]
    const r = rows[i]
    if (!r) return undefined
    if (r.acceptedKg < 0 || r.acceptedKg > l.receivedKg + 0.001) return 'Accepted KG must be between 0 and received KG'
    if (r.acceptedKg < l.receivedKg - 0.001 && !r.rejectReason.trim()) return 'Give a reason for the rejected quantity'
    return undefined
  }
  const save = () => {
    setTried(true)
    if (!allChecked || rows.some((_, i) => errFor(i))) return
    const r = act((d, c) => L.qcGRN(d, c, g.id, rows.map((x) => ({ productId: x.productId, acceptedKg: x.acceptedKg, rejectReason: x.rejectReason || undefined })), notes || 'Quality check completed'), 'Quality check passed - ready for approval')
    if (r.ok) { onOpenChange(false); onDone(g.id) }
  }
  return (
    <Dialog open={!!grnId} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t('Quality check')} · {g.grnNo}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {([['temp', 'Core temperature checked'], ['pack', 'Packaging intact'], ['label', 'Labels & expiry verified'], ['halal', 'Halal / health certificate']] as const).map(([k, label]) => (
            <label key={k} className={cn('flex items-center gap-2 rounded-lg border px-3 py-2 text-[12.5px]', checks[k] && 'border-brand/40 bg-brand-soft/50', tried && !checks[k] && 'border-danger/50')}>
              <Checkbox checked={checks[k]} onCheckedChange={(v) => setChecks((c) => ({ ...c, [k]: !!v }))} /> {t(label)}
            </label>
          ))}
        </div>
        {g.vehicleTempC !== undefined && (
          <div className="flex items-center gap-2 text-[12.5px] text-muted-foreground"><Thermometer className="size-4" /> {t('Truck temperature on arrival')}: <span className="font-semibold text-foreground">{g.vehicleTempC}°C</span></div>
        )}
        <div className="space-y-2">
          {g.lines.map((l, i) => {
            const p = products.find((x) => x.id === l.productId)
            const r = rows[i]
            if (!r) return null
            const rej = round2(l.receivedKg - r.acceptedKg)
            const err = tried ? errFor(i) : undefined
            return (
              <div key={l.productId} className={cn('rounded-lg border p-3', err && 'border-danger/50')}>
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">{name(p)} <span className="font-mono text-[11.5px] text-muted-foreground">{l.batchNo}</span></span>
                  <span className="text-[12px] text-muted-foreground">{t('Received')}: <span className="font-semibold tabular">{fmtKg(l.receivedKg)}</span></span>
                </div>
                <div className="grid gap-2 sm:grid-cols-[140px_120px_1fr]">
                  <Field label="Accepted KG"><NumInput value={r.acceptedKg} onChange={(v) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, acceptedKg: v } : x)))} /></Field>
                  <Field label="Rejected KG"><div className={cn('flex h-9 items-center rounded-md bg-muted px-3 font-medium tabular', rej > 0 && 'text-danger')}>{fmtNum(rej, 1)}</div></Field>
                  <Field label="Reject reason">
                    <Picker value={r.rejectReason} disabled={rej <= 0} onChange={(v) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, rejectReason: v } : x)))} options={REJECT_REASONS.map((x) => ({ value: x, label: x }))} placeholder={rej > 0 ? 'Select reason' : '-'} />
                  </Field>
                </div>
                {err && <p className="mt-1.5 text-[11.5px] text-danger">{t(err)}</p>}
              </div>
            )
          })}
        </div>
        <Field label="QC notes">
          <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t('Core temperature, packaging, labelling and halal certificate checked')} />
        </Field>
        {tried && !allChecked && <Alert tone="danger">{t('Complete all inspection checks before passing QC')}</Alert>}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t('Cancel')}</Button>
          <Button onClick={save}><FlaskConical /> {t('Pass quality check')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ───────────────────────── detail / approval ─────────────────────────
function GRNSheet({ id, onOpenChange, onQC }: { id: ID | null; onOpenChange: (o: boolean) => void; onQC: (id: ID) => void }) {
  const t = useT()
  const name = useName()
  const act = useAction()
  const db = useStore((s) => s.db)
  const g = db.grns.find((x) => x.id === id)
  const [rejecting, setRejecting] = useState(false)
  const [printing, setPrinting] = useState(false)
  const [posted, setPosted] = useState(false)
  useEffect(() => { setPosted(false) }, [id])
  const po = g && db.purchaseOrders.find((p) => p.id === g.poId)
  const sup = g && db.suppliers.find((s) => s.id === g.supplierId)
  const wh = g && db.warehouses.find((w) => w.id === g.warehouseId)
  const batches = g ? db.batches.filter((b) => b.grnId === g.id) : []
  const accepted = g?.lines.reduce((s, l) => s + l.acceptedKg, 0) ?? 0
  const value = g?.lines.reduce((s, l) => s + l.acceptedKg * l.unitCostSAR, 0) ?? 0
  return (
    <>
      <Sheet open={!!g} onOpenChange={onOpenChange}>
        <SheetContent className="overflow-y-auto sm:max-w-2xl">
          {g && (
            <>
              <SheetHeader>
                <div className="flex flex-wrap items-center gap-2">
                  <SheetTitle>{g.grnNo}</SheetTitle>
                  <StatusBadge status={g.status} />
                </div>
                <SheetDescription>{sup?.name} · {po?.poNo} · {name(wh)} · {fmtDate(g.receivedDate)}</SheetDescription>
              </SheetHeader>
              <div className="space-y-5 p-5">
                <Stepper steps={GRN_STEPS} current={grnStep(g)} failed={g.status === 'rejected'} />
                {g.status === 'rejected' && <Alert tone="danger" icon={XCircle}>{t('Rejected')}: {g.rejectReason}</Alert>}
                {g.status === 'approved' && (
                  <Alert tone="success" icon={CheckCircle2}>
                    {t('Inventory updated')}: {fmtKg(accepted)} {t('posted to')} {name(wh)} {t('as')} {batches.length} {t('batch(es)')}.{' '}
                    <Link to="/inventory" className="font-semibold underline">{t('View inventory')}</Link>
                  </Alert>
                )}
                {posted && g.status === 'approved' && <p className="-mt-3 text-[12px] text-success">{t('Stock posted once - approving again is blocked.')}</p>}
                <div className="flex flex-wrap gap-2">
                  {g.status === 'received' && <Button size="sm" onClick={() => onQC(g.id)}><FlaskConical /> {t('Quality check')}</Button>}
                  {g.status === 'qc_passed' && (
                    <Button size="sm" onClick={() => { if (act((d, c) => L.approveGRN(d, c, g.id), 'GRN approved - warehouse stock increased').ok) setPosted(true) }}>
                      <ShieldCheck /> {t('Approve & post to inventory')}
                    </Button>
                  )}
                  {(g.status === 'received' || g.status === 'qc_passed') && <Button size="sm" variant="outline" className="text-danger" onClick={() => setRejecting(true)}><XCircle /> {t('Reject GRN')}</Button>}
                  <Button size="sm" variant="outline" onClick={() => setPrinting(true)}><Printer /> {t('Print GRN')}</Button>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <Stat label="Received KG" value={fmtNum(g.lines.reduce((s, l) => s + l.receivedKg, 0))} />
                  <Stat label="Accepted KG" value={g.status === 'received' ? '-' : fmtNum(accepted)} tone="success" />
                  <Stat label="Rejected KG" value={fmtNum(g.lines.reduce((s, l) => s + l.rejectedKg, 0))} tone={g.lines.some((l) => l.rejectedKg > 0) ? 'danger' : undefined} />
                  <Stat label="Stock value" value={fmtSAR(value, { compact: true })} />
                </div>
                <div className="overflow-x-auto rounded-lg border">
                  <table className="w-full text-[12.5px]">
                    <thead className="bg-muted/50 text-[11px] text-muted-foreground uppercase">
                      <tr>
                        <th className="px-3 py-2 text-start">{t('Product / batch')}</th>
                        <th className="px-3 py-2 text-end">{t('Received')}</th>
                        <th className="px-3 py-2 text-end">{t('Accepted')}</th>
                        <th className="px-3 py-2 text-end">{t('Rejected')}</th>
                        <th className="px-3 py-2 text-end">{t('Expiry')}</th>
                        <th className="px-3 py-2 text-end">{t('Unit cost')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {g.lines.map((l) => (
                        <tr key={l.productId} className="border-t align-top">
                          <td className="px-3 py-2">
                            <div className="font-medium">{name(db.products.find((p) => p.id === l.productId))}</div>
                            <div className="font-mono text-[11px] text-muted-foreground">{l.batchNo} · {fmtNum(l.cartons)} {t('cartons')}</div>
                            {l.rejectReason && <div className="text-[11px] text-danger">{t(l.rejectReason)}</div>}
                          </td>
                          <td className="px-3 py-2 text-end tabular">{fmtNum(l.receivedKg, 1)}</td>
                          <td className="px-3 py-2 text-end font-medium tabular">{g.status === 'received' ? '-' : fmtNum(l.acceptedKg, 1)}</td>
                          <td className={cn('px-3 py-2 text-end tabular', l.rejectedKg > 0 && 'text-danger')}>{fmtNum(l.rejectedKg, 1)}</td>
                          <td className="px-3 py-2 text-end">{fmtDate(l.expiryDate)}</td>
                          <td className="px-3 py-2 text-end tabular">{fmtSAR(l.unitCostSAR)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {batches.length > 0 && (
                  <Panel title="Batches posted to inventory" bodyClassName="p-0">
                    <div className="divide-y">
                      {batches.map((b) => (
                        <div key={b.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-[12.5px]">
                          <span className="font-mono">{b.batchNo}</span>
                          <span className="text-muted-foreground">{name(db.products.find((p) => p.id === b.productId))}</span>
                          <span>{t('Initial')} <Kg value={b.initialKg} /> · {t('Now')} <Kg value={b.qtyKg} className="font-semibold" /></span>
                        </div>
                      ))}
                    </div>
                  </Panel>
                )}
                <div className="space-y-1 text-[12px] text-muted-foreground">
                  <div>{t('Received by')}: {g.receivedBy} · {fmtDateTime(g.createdAt)}{g.vehicleTempC !== undefined && ` · ${g.vehicleTempC}°C`}</div>
                  {g.qcBy && <div>{t('QC by')}: {g.qcBy}{g.qcNotes && ` - ${g.qcNotes}`}</div>}
                  {g.approvedBy && <div>{t('Approved by')}: {g.approvedBy} · {fmtDateTime(g.approvedAt)}</div>}
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
      <ReasonDialog
        open={rejecting}
        onOpenChange={setRejecting}
        title="Reject goods received note"
        suggestions={['Truck temperature above limit - product refused', 'Product does not match PO specification', 'Expired or short shelf life on arrival']}
        onConfirm={(reason) => !!g && act((d, c) => L.rejectGRN(d, c, g.id, reason), 'GRN rejected - no stock posted').ok}
      />
      {g && (
        <PrintDialog open={printing} onOpenChange={setPrinting} title="Goods Received Note">
          <GRNDoc grn={g} />
        </PrintDialog>
      )}
    </>
  )
}

function GRNDoc({ grn: g }: { grn: GRN }) {
  const t = useT()
  const name = useName()
  const db = useStore((s) => s.db)
  const po = db.purchaseOrders.find((p) => p.id === g.poId)
  const sup = db.suppliers.find((s) => s.id === g.supplierId)
  const wh = db.warehouses.find((w) => w.id === g.warehouseId)
  const th = 'border-b border-[#d5dce6] bg-[#f1f4f8] px-2 py-1.5 text-start text-[11px] font-semibold uppercase text-[#5f6b7a]'
  const td = 'border-b border-[#edf1f5] px-2 py-1.5'
  return (
    <div>
      <DocHeader title="Goods Received Note" number={g.grnNo} date={fmtDate(g.receivedDate)} extra={<div className="mt-1 text-[11px] font-semibold uppercase">{t(g.status)}</div>} />
      <div className="mb-5 grid grid-cols-2 gap-6 text-[12px]">
        <div>
          <div className="mb-1 text-[10.5px] font-semibold text-[#5f6b7a] uppercase">{t('Supplier')}</div>
          <div className="font-semibold">{sup?.name}</div>
          <div>{sup?.city}, {sup?.country}</div>
          <div>{t('PO')}: {po?.poNo}</div>
        </div>
        <div>
          <div className="mb-1 text-[10.5px] font-semibold text-[#5f6b7a] uppercase">{t('Received at')}</div>
          <div className="font-semibold">{name(wh)}</div>
          <div>{t('Received by')}: {g.receivedBy}</div>
          {g.vehicleTempC !== undefined && <div>{t('Truck temperature')}: {g.vehicleTempC}°C</div>}
        </div>
      </div>
      <table className="w-full border-collapse text-[12px]">
        <thead>
          <tr>
            <th className={th}>{t('Product')}</th>
            <th className={th}>{t('Batch no.')}</th>
            <th className={th}>{t('Expiry')}</th>
            <th className={`${th} text-end`}>{t('Cartons')}</th>
            <th className={`${th} text-end`}>{t('Received KG')}</th>
            <th className={`${th} text-end`}>{t('Accepted KG')}</th>
            <th className={`${th} text-end`}>{t('Rejected KG')}</th>
          </tr>
        </thead>
        <tbody>
          {g.lines.map((l) => (
            <tr key={l.productId}>
              <td className={td}>{name(db.products.find((p) => p.id === l.productId))}{l.rejectReason && <div className="text-[10.5px] text-[#c2341f]">{t(l.rejectReason)}</div>}</td>
              <td className={`${td} font-mono`}>{l.batchNo}</td>
              <td className={td}>{fmtDate(l.expiryDate)}</td>
              <td className={`${td} text-end`}>{fmtNum(l.cartons)}</td>
              <td className={`${td} text-end`}>{fmtNum(l.receivedKg, 1)}</td>
              <td className={`${td} text-end font-semibold`}>{fmtNum(l.acceptedKg, 1)}</td>
              <td className={`${td} text-end`}>{fmtNum(l.rejectedKg, 1)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {g.qcNotes && <p className="mt-3 text-[12px]">{t('QC notes')}: {g.qcNotes}</p>}
      {g.rejectReason && <p className="mt-1 text-[12px] text-[#c2341f]">{t('Rejected')}: {g.rejectReason}</p>}
      <div className="mt-12 grid grid-cols-3 gap-8 text-[11px] text-[#5f6b7a]">
        <div className="border-t pt-1">{t('Store keeper')}</div>
        <div className="border-t pt-1">{t('QC inspector')}{g.qcBy ? ` - ${g.qcBy}` : ''}</div>
        <div className="border-t pt-1">{t('Warehouse manager')}{g.approvedBy ? ` - ${g.approvedBy}` : ''}</div>
      </div>
      <DocFooterNote />
    </div>
  )
}
