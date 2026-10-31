/** Delivery completion, van sale and customer-return dialogs used on the routes board. */
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { CheckCircle2, PackageX, Undo2, XCircle } from 'lucide-react'
import type { DB, ID, Result, SalesLine } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Alert, Field, LineItemsEditor, NumInput, Picker, SummaryRow, useAction, useConfirm } from '@/components/common'
import { useStore } from '@/store/useStore'
import { useT, useName, tr } from '@/i18n'
import * as L from '@/store/logic'
import type { Ctx } from '@/store/logic'
import { customerPrice, invoiceTotals, vanStockByProduct, customerOutstanding } from '@/store/derive'
import { fmtKg, fmtNum, fmtSAR, round2, shiftDay, todayKey, fmtDate } from '@/lib/format'
import { cn } from '@/lib/utils'

/** post a sales transaction; on a credit-limit block ask the supervisor to override */
export function usePostWithOverride() {
  const act = useAction()
  const confirm = useConfirm()
  const t = useT()
  return async <R extends Result<any>>(fn: (db: DB, ctx: Ctx, allowOverLimit: boolean) => R, success: string): Promise<R> => {
    let r = act((d, c) => fn(d, c, false), success, { silentError: true }) as R & { ok: boolean; error?: string; code?: string }
    if (!r.ok && r.code === 'CREDIT_LIMIT') {
      const ok = await confirm({ title: t('Credit limit exceeded'), description: r.error, confirmText: t('Override & post') })
      if (!ok) return r
      r = act((d, c) => fn(d, c, true), success) as typeof r
    } else if (!r.ok) toast.error(tr(r.error ?? 'Something went wrong'))
    return r
  }
}

export const FAIL_REASONS = ['Customer premises closed', 'Receiver not available', 'Customer refused - quality / temperature', 'Customer refused - asked to deliver tomorrow', 'Wrong address / cannot locate', 'Vehicle breakdown']

export function DeliveryDialog({ deliveryId, onOpenChange, onInvoice }: { deliveryId: ID | null; onOpenChange: (o: boolean) => void; onInvoice?: (invoiceId: ID) => void }) {
  const t = useT()
  const name = useName()
  const post = usePostWithOverride()
  const db = useStore((s) => s.db)
  const dl = deliveryId ? db.deliveries.find((d) => d.id === deliveryId) : undefined
  const [mode, setMode] = useState<'deliver' | 'fail'>('deliver')
  const [qty, setQty] = useState<Record<ID, number>>({})
  const [reason, setReason] = useState('')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const van = useMemo(() => (dl ? vanStockByProduct(db, dl.driverId) : {}), [db, dl])
  useEffect(() => {
    if (dl) {
      setMode('deliver')
      setQty(Object.fromEntries(dl.lines.map((l) => [l.productId, Math.min(l.orderedKg, van[l.productId] ?? 0)])))
      setReason('')
      setNotes('')
    }
  }, [dl?.id]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!dl) return null
  const c = db.customers.find((x) => x.id === dl.customerId)!
  const so = db.salesOrders.find((s) => s.id === dl.soId)
  const lines = dl.lines.map((l) => ({ productId: l.productId, qtyKg: qty[l.productId] ?? 0, price: l.price }))
  const totals = invoiceTotals(lines.filter((l) => l.qtyKg > 0), db.settings.vatRate)
  const partial = dl.lines.some((l) => (qty[l.productId] ?? 0) < l.orderedKg - 0.001)
  const shortVan = dl.lines.some((l) => (van[l.productId] ?? 0) < l.orderedKg - 0.001)
  const outstanding = customerOutstanding(db, c.id)
  const submit = async () => {
    setBusy(true)
    const r = await post(
      (d, ctx, allow) =>
        mode === 'fail'
          ? L.completeDelivery(d, ctx, { deliveryId: dl.id, lines: [], failed: true, failReason: reason, notes })
          : L.completeDelivery(d, ctx, { deliveryId: dl.id, lines: lines.map((l) => ({ productId: l.productId, deliveredKg: l.qtyKg })), notes, allowOverLimit: allow }),
      mode === 'fail' ? 'Delivery marked as failed' : partial ? 'Partial delivery recorded · invoice created' : 'Delivered · invoice created',
    )
    setBusy(false)
    if (r.ok) {
      onOpenChange(false)
      const inv = (r as any).invoiceId as ID | undefined
      if (inv && onInvoice) onInvoice(inv)
    }
  }
  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('Stop {n}', { n: dl.routeSeq })} · {name(c)}</DialogTitle>
          <p className="text-xs text-muted-foreground">{dl.deliveryNo} · {so?.soNo} · {c.address} · {t(so?.paymentType === 'cash' ? 'Cash' : 'Credit')}</p>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => setMode('deliver')} className={cn('flex items-center justify-center gap-2 rounded-lg border-2 px-3 py-2.5 text-[13px] font-semibold', mode === 'deliver' ? 'border-brand bg-brand-soft text-brand' : 'border-border text-muted-foreground')}>
            <CheckCircle2 className="size-4" /> {t('Delivered / partial')}
          </button>
          <button onClick={() => setMode('fail')} className={cn('flex items-center justify-center gap-2 rounded-lg border-2 px-3 py-2.5 text-[13px] font-semibold', mode === 'fail' ? 'border-danger bg-danger-soft text-danger' : 'border-border text-muted-foreground')}>
            <XCircle className="size-4" /> {t('Failed delivery')}
          </button>
        </div>
        {mode === 'deliver' ? (
          <div className="space-y-3">
            {shortVan && <Alert tone="warning">{t('Van stock is lower than the ordered quantity for some products - delivered KG is limited to what is on the van.')}</Alert>}
            <div className="overflow-hidden rounded-lg border">
              <div className="grid grid-cols-[1fr_80px_80px_110px] gap-2 bg-muted/60 px-3 py-2 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                <span>{t('Product')}</span><span className="text-end">{t('Ordered')}</span><span className="text-end">{t('On van')}</span><span>{t('Delivered KG')}</span>
              </div>
              {dl.lines.map((l) => {
                const max = Math.min(round2(l.orderedKg * 1.05), van[l.productId] ?? 0)
                return (
                  <div key={l.productId} className="grid grid-cols-[1fr_80px_80px_110px] items-center gap-2 border-t px-3 py-2 text-[13px]">
                    <div className="min-w-0">
                      <div className="truncate font-medium">{name(db.products.find((p) => p.id === l.productId))}</div>
                      <div className="text-[11px] text-muted-foreground">{fmtSAR(l.price)} / kg</div>
                    </div>
                    <span className="text-end tabular">{fmtNum(l.orderedKg, 1)}</span>
                    <span className={cn('text-end tabular', (van[l.productId] ?? 0) < l.orderedKg && 'text-warning')}>{fmtNum(van[l.productId] ?? 0, 1)}</span>
                    <NumInput value={qty[l.productId] ?? 0} onChange={(v) => setQty((q) => ({ ...q, [l.productId]: Math.max(0, Math.min(v, max)) }))} aria-label="Delivered KG" />
                  </div>
                )
              })}
            </div>
            <div className="ms-auto w-full max-w-xs space-y-1 rounded-lg bg-muted/60 p-3 text-[13px]">
              <SummaryRow label={t('Subtotal')} value={fmtSAR(totals.subtotal)} />
              <SummaryRow label={`${t('VAT')} ${db.settings.vatRate}%`} value={fmtSAR(totals.vat)} />
              <SummaryRow label={t('Invoice total')} value={fmtSAR(totals.total)} strong />
            </div>
            {so?.paymentType === 'credit' && outstanding + totals.total > c.creditLimit && (
              <Alert tone="danger">{t('This invoice takes {c} over its credit limit ({used} of {limit}).', { c: name(c), used: fmtSAR(outstanding + totals.total), limit: fmtSAR(c.creditLimit) })}</Alert>
            )}
            {partial && <Alert tone="info">{t('Partial delivery: the invoice is raised only for the delivered KG; the remainder stays on the van.')}</Alert>}
          </div>
        ) : (
          <Field label="Reason" required>
            <Picker value={reason} onChange={setReason} options={FAIL_REASONS.map((r) => ({ value: r, label: r }))} placeholder="Select a reason" />
          </Field>
        )}
        <Field label="Notes"><Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t('Cancel')}</Button>
          <Button variant={mode === 'fail' ? 'destructive' : 'default'} disabled={busy || (mode === 'fail' ? !reason : totals.total <= 0)} onClick={submit}>
            {mode === 'fail' ? t('Mark failed') : partial ? t('Confirm partial delivery') : t('Confirm delivery')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function VanSaleDialog({ driverId, onOpenChange, onInvoice }: { driverId: ID | null; onOpenChange: (o: boolean) => void; onInvoice?: (id: ID) => void }) {
  const t = useT()
  const name = useName()
  const post = usePostWithOverride()
  const db = useStore((s) => s.db)
  const driver = driverId ? db.drivers.find((d) => d.id === driverId) : undefined
  const [customerId, setCustomerId] = useState<ID>('')
  const [pay, setPay] = useState<'cash' | 'credit'>('cash')
  const [lines, setLines] = useState<SalesLine[]>([{ productId: '', qtyKg: 0, price: 0 }])
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    setCustomerId('')
    setPay('cash')
    setLines([{ productId: '', qtyKg: 0, price: 0 }])
  }, [driverId])
  const van = useMemo(() => (driverId ? vanStockByProduct(db, driverId) : {}), [db, driverId])
  if (!driver) return null
  const city = db.warehouses.find((w) => w.id === driver.warehouseId)?.city
  const c = db.customers.find((x) => x.id === customerId)
  const custs = [...db.customers].filter((x) => x.active).sort((a, b) => Number(b.city === city) - Number(a.city === city) || a.name.localeCompare(b.name))
  const vanIds = Object.keys(van).filter((k) => van[k] > 0)
  const submit = async () => {
    setBusy(true)
    const r = await post((d, ctx, allow) => L.vanSale(d, ctx, { driverId: driver.id, customerId, date: todayKey(), lines: lines.filter((l) => l.productId), paymentType: pay, allowOverLimit: allow }), 'Van sale invoice created')
    setBusy(false)
    if (r.ok) {
      onOpenChange(false)
      onInvoice?.(r.id!)
    }
  }
  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t('Direct van sale')} · {name(driver)}</DialogTitle>
          <p className="text-xs text-muted-foreground">{t('Sell from stock currently on the van. The invoice is created immediately and van stock is reduced.')}</p>
        </DialogHeader>
        {vanIds.length === 0 ? (
          <Alert tone="warning" icon={PackageX}>{t('The van is empty - load stock first.')}</Alert>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Customer" required>
                <Picker
                  value={customerId}
                  onChange={(v) => {
                    setCustomerId(v)
                    const cc = db.customers.find((x) => x.id === v)
                    setPay(cc?.defaultPayment ?? 'cash')
                    setLines((ls) => ls.map((l) => (l.productId ? { ...l, price: customerPrice(cc, db.products.find((p) => p.id === l.productId)) } : l)))
                  }}
                  options={custs.map((x) => ({ value: x.id, label: `${name(x)} · ${x.city}` }))}
                  placeholder="Select customer"
                />
              </Field>
              <Field label="Payment type">
                <Picker value={pay} onChange={(v) => setPay(v as 'cash' | 'credit')} options={[{ value: 'cash', label: 'Cash' }, { value: 'credit', label: 'Credit' }]} />
              </Field>
            </div>
            <LineItemsEditor lines={lines} onChange={setLines} products={db.products} available={van} allowedProductIds={vanIds} priceFor={(pid) => customerPrice(c, db.products.find((p) => p.id === pid))} vatRate={db.settings.vatRate} />
          </>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t('Cancel')}</Button>
          <Button disabled={busy || !customerId || !lines.some((l) => l.productId && l.qtyKg > 0) || lines.some((l) => l.productId && l.qtyKg > (van[l.productId] ?? 0) + 0.001)} onClick={submit}>{t('Create van sale')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function CustomerReturnDialog({ driverId, onOpenChange }: { driverId: ID | null; onOpenChange: (o: boolean) => void }) {
  const t = useT()
  const name = useName()
  const act = useAction()
  const db = useStore((s) => s.db)
  const driver = driverId ? db.drivers.find((d) => d.id === driverId) : undefined
  const [invoiceId, setInvoiceId] = useState<ID>('')
  const [qty, setQty] = useState<Record<ID, number>>({})
  const [reason, setReason] = useState('')
  const [condition, setCondition] = useState<'resaleable' | 'damaged'>('resaleable')
  useEffect(() => {
    setInvoiceId('')
    setQty({})
    setReason('')
    setCondition('resaleable')
  }, [driverId])
  if (!driver) return null
  const since = shiftDay(todayKey(), -14)
  const invoices = db.invoices
    .filter((i) => i.status !== 'void' && i.date >= since && (i.driverId === driver.id || db.customers.find((c) => c.id === i.customerId)?.driverId === driver.id))
    .sort((a, b) => b.date.localeCompare(a.date))
  const inv = db.invoices.find((i) => i.id === invoiceId)
  const returned = (pid: ID) => db.salesReturns.filter((r) => r.invoiceId === invoiceId).reduce((s, r) => s + (r.lines.find((l) => l.productId === pid)?.qtyKg ?? 0), 0)
  const rLines = inv ? inv.lines.map((l) => ({ ...l, qtyKg: qty[l.productId] ?? 0 })).filter((l) => l.qtyKg > 0) : []
  const credit = inv ? invoiceTotals(rLines, inv.vatRate).total : 0
  const submit = () => {
    const r = act(
      (d, ctx) => L.salesReturn(d, ctx, { invoiceId, date: todayKey(), lines: rLines.map((l) => ({ productId: l.productId, qtyKg: l.qtyKg })), reason, destination: 'van', condition, driverId: driver.id }),
      condition === 'resaleable' ? 'Return recorded · stock added back to van' : 'Return recorded · damaged stock written off',
    )
    if (r.ok) onOpenChange(false)
  }
  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('Customer return to van')} · {name(driver)}</DialogTitle>
          <p className="text-xs text-muted-foreground">{t('Issues a credit note against the invoice. Resaleable goods go back into van stock; damaged goods are recorded as loss.')}</p>
        </DialogHeader>
        <Field label="Invoice" required>
          <Picker
            value={invoiceId}
            onChange={(v) => { setInvoiceId(v); setQty({}) }}
            options={invoices.map((i) => ({ value: i.id, label: `${i.invNo} · ${name(db.customers.find((c) => c.id === i.customerId))} · ${fmtDate(i.date)}` }))}
            placeholder={invoices.length ? 'Select invoice' : 'No recent invoices for this driver'}
          />
        </Field>
        {inv && (
          <div className="overflow-hidden rounded-lg border">
            {inv.lines.map((l) => {
              const max = round2(l.qtyKg - returned(l.productId))
              return (
                <div key={l.productId} className="grid grid-cols-[1fr_100px_110px] items-center gap-2 border-b px-3 py-2 text-[13px] last:border-0">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{name(db.products.find((p) => p.id === l.productId))}</div>
                    <div className="text-[11px] text-muted-foreground">{t('Invoiced')} {fmtKg(l.qtyKg)} · {fmtSAR(l.price)}/kg</div>
                  </div>
                  <span className="text-end text-[12px] text-muted-foreground tabular">{t('Returnable')} {fmtNum(max, 1)}</span>
                  <NumInput value={qty[l.productId] ?? 0} disabled={max <= 0} onChange={(v) => setQty((q) => ({ ...q, [l.productId]: Math.max(0, Math.min(v, max)) }))} aria-label="Return KG" />
                </div>
              )
            })}
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Condition">
            <Picker value={condition} onChange={(v) => setCondition(v as 'resaleable' | 'damaged')} options={[{ value: 'resaleable', label: 'Resaleable - back to van stock' }, { value: 'damaged', label: 'Damaged - write off as loss' }]} />
          </Field>
          <Field label="Reason" required><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t('e.g. packaging torn')} /></Field>
        </div>
        {credit > 0 && <Alert tone="info" icon={Undo2}>{t('Credit note value')}: <b>{fmtSAR(credit)}</b></Alert>}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t('Cancel')}</Button>
          <Button disabled={!inv || !rLines.length || !reason.trim()} onClick={submit}>{t('Record return')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
