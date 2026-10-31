import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { CheckCircle2, CircleSlash, FileText, HandCoins, MapPin, Navigation, PackageCheck, Phone, Scissors, Undo2, XCircle } from 'lucide-react'
import type { ID } from '@/types'
import * as L from '@/store/logic'
import { useT, useName, tr } from '@/i18n'
import { fmtKg, fmtNum, fmtSAR, round2 } from '@/lib/format'
import { Alert, PrintDialog, StatusBadge, useAction, useConfirm, useDialog } from '@/components/common'
import { InvoiceDoc } from '@/components/docs'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Textarea } from '@/components/ui/textarea'
import { invoiceBalance } from '@/store/derive'
import { DONE, useDriverDay } from '../useDriverDay'
import { BigButton, Chip, KV, QtyStepper, Screen, SectionTitle, Segmented } from '../ui'

const FAIL_REASONS = ['Customer premises closed', 'Receiver not available', 'Customer refused', 'Wrong order / quantity', 'Cold room full', 'Vehicle breakdown']
const RETURN_REASONS = ['Packaging damaged', 'Temperature concern', 'Wrong product', 'Quality complaint', 'Excess quantity']

export default function StopScreen() {
  const { id } = useParams()
  const t = useT()
  const name = useName()
  const nav = useNavigate()
  const act = useAction()
  const confirm = useConfirm()
  const d = useDriverDay()
  const stop = d.db.deliveries.find((x) => x.id === id)
  const [mode, setMode] = useState<'view' | 'partial' | 'failed'>('view')
  const [qty, setQty] = useState<Record<ID, number>>({})
  const [reason, setReason] = useState('')
  const [notes, setNotes] = useState('')
  const invDialog = useDialog<ID>()
  const [returnOpen, setReturnOpen] = useState(false)

  useEffect(() => {
    if (stop) setQty(Object.fromEntries(stop.lines.map((l) => [l.productId, Math.min(l.orderedKg, d.van[l.productId] ?? 0)])))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stop?.id, mode])

  if (!stop) return <Screen title="Stop" back="/driver/route"><Alert>{t('Delivery not found')}</Alert></Screen>
  const c = d.db.customers.find((x) => x.id === stop.customerId)!
  const inv = stop.invoiceId ? d.db.invoices.find((i) => i.id === stop.invoiceId) : undefined
  const finished = DONE.includes(stop.status)
  const shortStock = stop.lines.filter((l) => (d.van[l.productId] ?? 0) < l.orderedKg - 0.001)

  const complete = async (lines: { productId: ID; deliveredKg: number }[], failed?: boolean) => {
    const input = { deliveryId: stop.id, lines, failed, failReason: failed ? reason : undefined, notes: notes || undefined }
    let r = act((db, ctx) => L.completeDelivery(db, ctx, input), undefined, { silentError: true })
    if (!r.ok && r.code === 'CREDIT_LIMIT') {
      if (!(await confirm({ title: t('Credit limit exceeded'), description: r.error, confirmText: t('Deliver anyway') }))) return
      r = act((db, ctx) => L.completeDelivery(db, ctx, { ...input, allowOverLimit: true }), undefined, { silentError: true })
    }
    if (!r.ok) {
      toast.error(tr(r.error))
      return
    }
    if (failed) {
      toast.warning(t('Delivery marked as failed'))
      setMode('view')
      return
    }
    toast.success(t('Delivery saved - invoice created'))
    if (r.invoiceId) nav(`/driver/collect?invoice=${r.invoiceId}`)
  }

  return (
    <Screen title={name(c)} back="/driver/route" action={<StatusBadge status={stop.status} />}>
      <div className="-mt-2 rounded-2xl border bg-card p-3.5">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-navy text-[15px] font-bold text-white">{stop.routeSeq}</span>
          <div className="min-w-0 flex-1 text-[13px]">
            <div className="font-medium">{c.contactPerson}</div>
            <div className="text-muted-foreground"><MapPin className="me-1 inline size-3" />{c.address}</div>
            <div className="mt-1 text-muted-foreground">{stop.deliveryNo} · {t(c.defaultPayment === 'cash' ? 'Cash' : 'Credit')} · {t('Outstanding')} {fmtSAR(d.outstanding[c.id] ?? 0)}</div>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <a href={`tel:${c.phone.replace(/\s/g, '')}`} className="flex h-12 items-center justify-center gap-2 rounded-xl bg-brand-soft text-[14px] font-semibold text-brand"><Phone className="size-4" />{t('Call')}</a>
          <a href={`https://maps.google.com/?q=${encodeURIComponent(c.address)}`} target="_blank" rel="noreferrer" className="flex h-12 items-center justify-center gap-2 rounded-xl bg-muted text-[14px] font-semibold"><Navigation className="size-4" />{t('Navigate')}</a>
        </div>
      </div>

      <SectionTitle>{finished ? t('Delivered items') : t('Ordered items')}</SectionTitle>
      <div className="space-y-2">
        {stop.lines.map((l) => {
          const p = d.db.products.find((x) => x.id === l.productId)!
          const onVan = d.van[l.productId] ?? 0
          return (
            <div key={l.productId} className="rounded-2xl border bg-card p-3.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-[14.5px] font-semibold">{name(p)}</div>
                  <div className="text-[12px] text-muted-foreground">{fmtSAR(l.price)} / {t('kg')} · {t('On van')}: {fmtKg(onVan)}</div>
                </div>
                <div className="text-end">
                  <div className="text-[17px] font-bold tabular">{fmtKg(finished ? l.deliveredKg : l.orderedKg)}</div>
                  <div className="text-[11.5px] text-muted-foreground">{fmtNum((finished ? l.deliveredKg : l.orderedKg) / p.cartonKg, 1)} {t(p.packLabel)}</div>
                </div>
              </div>
              {finished && l.deliveredKg < l.orderedKg && <div className="mt-1 text-[12px] text-warning">{t('Ordered')}: {fmtKg(l.orderedKg)}</div>}
              {mode === 'partial' && (
                <div className="mt-3">
                  <div className="mb-1 text-[12px] font-medium text-muted-foreground">{t('Delivered KG')}</div>
                  <QtyStepper value={qty[l.productId] ?? 0} onChange={(v) => setQty({ ...qty, [l.productId]: v })} step={p.cartonKg} max={Math.min(onVan, l.orderedKg * 1.05)} />
                </div>
              )}
            </div>
          )
        })}
      </div>

      {!finished && (
        <>
          {shortStock.length > 0 && mode === 'view' && (
            <Alert tone="warning">{t('Not enough stock on the van for: {list}. Use partial delivery.', { list: shortStock.map((l) => name(d.db.products.find((p) => p.id === l.productId))).join(', ') })}</Alert>
          )}
          {mode === 'view' && (
            <div className="space-y-2.5 pt-1">
              <BigButton icon={CheckCircle2} disabled={shortStock.length > 0} onClick={() => complete(stop.lines.map((l) => ({ productId: l.productId, deliveredKg: l.orderedKg })))}>
                {t('Delivered - full quantity')}
              </BigButton>
              <div className="grid grid-cols-2 gap-2.5">
                <BigButton variant="outline" icon={Scissors} onClick={() => setMode('partial')}>{t('Partial')}</BigButton>
                <BigButton variant="outline" icon={XCircle} className="text-danger" onClick={() => setMode('failed')}>{t('Failed')}</BigButton>
              </div>
              {stop.status === 'pending' && (
                <button className="w-full py-2 text-[13px] font-medium text-brand" onClick={() => act((db, ctx) => L.setOutForDelivery(db, ctx, stop.id), 'On the way - customer stop started')}>
                  {t('Mark as out for delivery')}
                </button>
              )}
            </div>
          )}
          {mode === 'partial' && (
            <div className="space-y-2.5">
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t('Note (why partial?)')} className="min-h-14 text-[14px]" />
              <BigButton icon={PackageCheck} onClick={() => complete(stop.lines.map((l) => ({ productId: l.productId, deliveredKg: round2(qty[l.productId] ?? 0) })))}>
                {t('Save delivered KG')}
              </BigButton>
              <BigButton variant="ghost" onClick={() => setMode('view')}>{t('Cancel')}</BigButton>
            </div>
          )}
          {mode === 'failed' && (
            <div className="space-y-3">
              <div className="text-[13px] font-medium">{t('Why did the delivery fail?')}</div>
              <div className="flex flex-wrap gap-2">
                {FAIL_REASONS.map((r) => <Chip key={r} tone="danger" active={reason === r} onClick={() => setReason(r)}>{t(r)}</Chip>)}
              </div>
              <BigButton variant="destructive" icon={CircleSlash} disabled={!reason} onClick={() => complete([], true)}>{t('Confirm failed delivery')}</BigButton>
              <BigButton variant="ghost" onClick={() => setMode('view')}>{t('Cancel')}</BigButton>
            </div>
          )}
        </>
      )}

      {stop.status === 'failed' && <Alert tone="danger">{t('Failed')}: {t(stop.failReason ?? '')}</Alert>}

      {inv && (
        <div className="space-y-2.5">
          <div className="rounded-2xl border bg-card p-3.5">
            <KV label={t('Invoice')} value={inv.invNo} />
            <KV label={t('Invoice amount')} value={fmtSAR(inv.total)} />
            <KV label={t('Paid')} value={fmtSAR(inv.paid)} />
            {inv.returned > 0 && <KV label={t('Returned')} value={fmtSAR(inv.returned)} />}
            <KV label={t('Balance')} value={fmtSAR(invoiceBalance(inv))} strong tone={invoiceBalance(inv) > 0 ? 'danger' : 'success'} />
          </div>
          {invoiceBalance(inv) > 0 && <BigButton icon={HandCoins} onClick={() => nav(`/driver/collect?invoice=${inv.id}`)}>{t('Record payment')}</BigButton>}
          <div className="grid grid-cols-2 gap-2.5">
            <BigButton variant="outline" icon={FileText} onClick={() => invDialog.open(inv.id)}>{t('Invoice')}</BigButton>
            <BigButton variant="outline" icon={Undo2} disabled={d.dayClosed} onClick={() => setReturnOpen(true)}>{t('Return')}</BigButton>
          </div>
        </div>
      )}

      <PrintDialog open={invDialog.isOpen} onOpenChange={invDialog.onOpenChange} title="Tax Invoice">
        {invDialog.value && <InvoiceDoc invoiceId={invDialog.value} />}
      </PrintDialog>
      {inv && <ReturnSheet open={returnOpen} onOpenChange={setReturnOpen} invoiceId={inv.id} />}
    </Screen>
  )
}

/** customer hands goods back to the driver → stock goes back on the van, invoice is credited */
export function ReturnSheet({ open, onOpenChange, invoiceId }: { open: boolean; onOpenChange: (o: boolean) => void; invoiceId: ID }) {
  const t = useT()
  const name = useName()
  const act = useAction()
  const d = useDriverDay()
  const inv = d.db.invoices.find((i) => i.id === invoiceId)
  const [qty, setQty] = useState<Record<ID, number>>({})
  const [reason, setReason] = useState('')
  const [condition, setCondition] = useState<'resaleable' | 'damaged'>('resaleable')
  useEffect(() => {
    if (open) { setQty({}); setReason(''); setCondition('resaleable') }
  }, [open])
  if (!inv) return null
  const returned = (pid: ID) => d.db.salesReturns.filter((r) => r.invoiceId === inv.id).reduce((s, r) => s + (r.lines.find((x) => x.productId === pid)?.qtyKg ?? 0), 0)
  const save = () => {
    const r = act(
      (db, ctx) => L.salesReturn(db, ctx, { invoiceId: inv.id, date: d.today, lines: Object.entries(qty).map(([productId, qtyKg]) => ({ productId, qtyKg })), reason, destination: 'van', condition, driverId: d.driverId }),
      'Return recorded - invoice credited',
    )
    if (r.ok) onOpenChange(false)
  }
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="mx-auto max-w-[430px]">
        <SheetHeader><SheetTitle>{t('Customer return')} · {inv.invNo}</SheetTitle></SheetHeader>
        <div className="space-y-3 overflow-y-auto p-4">
          {inv.lines.map((l) => {
            const p = d.db.products.find((x) => x.id === l.productId)!
            const max = round2(l.qtyKg - returned(l.productId))
            return (
              <div key={l.productId}>
                <div className="mb-1 flex justify-between text-[13px]"><span className="font-medium">{name(p)}</span><span className="text-muted-foreground">{t('Max')} {fmtKg(max)}</span></div>
                <QtyStepper value={qty[l.productId] ?? 0} onChange={(v) => setQty({ ...qty, [l.productId]: v })} step={1} max={max} />
              </div>
            )
          })}
          <Segmented value={condition} onChange={setCondition} options={[{ value: 'resaleable', label: 'Resaleable' }, { value: 'damaged', label: 'Damaged' }]} />
          <div className="flex flex-wrap gap-2">{RETURN_REASONS.map((r) => <Chip key={r} active={reason === r} onClick={() => setReason(r)}>{t(r)}</Chip>)}</div>
          <BigButton icon={Undo2} disabled={!reason || !Object.values(qty).some((v) => v > 0)} onClick={save}>{t('Save return')}</BigButton>
        </div>
      </SheetContent>
    </Sheet>
  )
}
