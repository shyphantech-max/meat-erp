/** Sales dialogs: sales order, direct invoice, sales return. */
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import type { DB, ID, Result, SalesLine } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Alert, Field, LineItemsEditor, NumInput, Picker, SummaryRow, useAction, useConfirm } from '@/components/common'
import { useStore } from '@/store/useStore'
import { useCustomerBalances } from '@/store/selectors'
import { customerPrice, invoiceTotals, sellableStock } from '@/store/derive'
import * as L from '@/store/logic'
import type { Ctx } from '@/store/logic'
import { useT, useName, tr } from '@/i18n'
import { fmtDate, fmtKg, fmtNum, fmtSAR, shiftDay, todayKey } from '@/lib/format'

const blankLine = (): SalesLine => ({ productId: '', qtyKg: 0, price: 0 })

/** run a sales transaction; on CREDIT_LIMIT ask for an owner override and retry */
export function useCreditAwareAction() {
  const act = useAction()
  const confirm = useConfirm()
  return async (fn: (allowOverLimit: boolean) => (db: DB, ctx: Ctx) => Result, success: string) => {
    const r = act(fn(false), success, { silentError: true }) as Result
    if (r.ok) return r
    if (r.code === 'CREDIT_LIMIT') {
      const ok = await confirm({ title: tr('Credit limit exceeded'), description: `${r.error}. ${tr('Approve this sale as an owner override?')}`, confirmText: tr('Override & post'), destructive: true })
      if (!ok) return r
      return act(fn(true), success) as Result
    }
    toast.error(tr(r.error))
    return r
  }
}

function CustomerCreditHint({ customerId, addTotal, paymentType }: { customerId: ID; addTotal: number; paymentType: 'cash' | 'credit' }) {
  const t = useT()
  const bal = useCustomerBalances()[customerId]
  const c = useStore((s) => s.db.customers.find((x) => x.id === customerId))
  if (!bal || !c) return null
  const after = bal.outstanding + (paymentType === 'credit' ? addTotal : 0)
  const over = paymentType === 'credit' && after > c.creditLimit
  return (
    <Alert tone={over ? 'danger' : bal.overdue > 0 ? 'warning' : 'info'}>
      {t('Outstanding')} <b className="tabular">{fmtSAR(bal.outstanding)}</b> · {t('Credit limit')} <b className="tabular">{fmtSAR(c.creditLimit)}</b>
      {bal.overdue > 0 && <> · {t('Overdue')} <b className="tabular">{fmtSAR(bal.overdue)}</b></>}
      {over && <div className="mt-0.5 font-medium">{t('This credit sale takes the customer over the limit ({n}). An override will be required.', { n: fmtSAR(after) })}</div>}
    </Alert>
  )
}

export function SalesOrderDialog({ open, onOpenChange, customerId }: { open: boolean; onOpenChange: (o: boolean) => void; customerId?: ID }) {
  const t = useT()
  const name = useName()
  const act = useAction()
  const db = useStore((s) => s.db)
  const today = todayKey()
  const [f, setF] = useState({ customerId: '', date: today, deliveryDate: shiftDay(today, 1), paymentType: 'credit' as 'cash' | 'credit', driverId: '', notes: '' })
  const [lines, setLines] = useState<SalesLine[]>([blankLine()])
  const [err, setErr] = useState<Record<string, string>>({})
  const c = db.customers.find((x) => x.id === f.customerId)
  const pickCustomer = (id: ID) => {
    const cc = db.customers.find((x) => x.id === id)
    setF((x) => ({ ...x, customerId: id, paymentType: cc?.defaultPayment ?? 'credit', driverId: cc?.driverId ?? '' }))
    setLines((ls) => ls.map((l) => (l.productId ? { ...l, price: customerPrice(cc, db.products.find((p) => p.id === l.productId)) } : l)))
  }
  useEffect(() => {
    if (!open) return
    setF({ customerId: '', date: today, deliveryDate: shiftDay(today, 1), paymentType: 'credit', driverId: '', notes: '' })
    setLines([blankLine()])
    setErr({})
    if (customerId) pickCustomer(customerId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, customerId])
  const totals = invoiceTotals(lines, db.settings.vatRate)
  const driverWh = db.drivers.find((d) => d.id === f.driverId)?.warehouseId ?? 'wh_1'
  const available = useMemo(() => Object.fromEntries(db.products.map((p) => [p.id, sellableStock(db, p.id, driverWh, f.deliveryDate)])), [db, driverWh, f.deliveryDate])
  const submit = () => {
    const e: Record<string, string> = {}
    if (!f.customerId) e.customerId = 'Select a customer'
    if (!lines.some((l) => l.productId && l.qtyKg > 0)) e.lines = 'Add at least one product with KG'
    if (lines.some((l) => l.productId && l.qtyKg > 0 && l.price <= 0)) e.lines = 'Selling price must be greater than zero'
    if (f.deliveryDate < f.date) e.deliveryDate = 'Delivery date cannot be before the order date'
    setErr(e)
    if (Object.keys(e).length) return
    const r = act((d, ctx) => L.createSalesOrder(d, ctx, { ...f, driverId: f.driverId || undefined, lines }), f.driverId ? 'Sales order created and assigned to driver' : 'Sales order created')
    if (r.ok) onOpenChange(false)
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>{t('New sales order')}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-4">
          <Field label="Customer" required error={err.customerId} className="sm:col-span-2">
            <Picker value={f.customerId} onChange={pickCustomer} options={db.customers.filter((x) => x.active).map((x) => ({ value: x.id, label: `${name(x)} · ${x.city}` }))} placeholder="Select customer" />
          </Field>
          <Field label="Order date">
            <Input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
          </Field>
          <Field label="Delivery date" error={err.deliveryDate}>
            <Input type="date" value={f.deliveryDate} min={f.date} onChange={(e) => setF({ ...f, deliveryDate: e.target.value })} />
          </Field>
          <Field label="Payment type">
            <PayType value={f.paymentType} onChange={(v) => setF({ ...f, paymentType: v })} />
          </Field>
          <Field label="Assign driver" hint="Optional - creates the delivery on the driver's route" className="sm:col-span-2">
            <Picker value={f.driverId || 'none'} onChange={(v) => setF({ ...f, driverId: v === 'none' ? '' : v })} options={[{ value: 'none', label: t('Assign later') }, ...db.drivers.filter((d) => d.status === 'on_duty' && d.vehicleId).map((d) => ({ value: d.id, label: `${name(d)} · ${db.vehicles.find((v) => v.id === d.vehicleId)?.plateNo}` }))]} />
          </Field>
          <Field label="Notes">
            <Input value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
          </Field>
        </div>
        {c && <CustomerCreditHint customerId={c.id} addTotal={totals.total} paymentType={f.paymentType} />}
        <div>
          <LineItemsEditor lines={lines} onChange={setLines} products={db.products} priceFor={(pid) => customerPrice(c, db.products.find((p) => p.id === pid))} available={available} vatRate={db.settings.vatRate} />
          {err.lines && <p className="mt-1 text-[12px] text-danger">{t(err.lines)}</p>}
          <p className="mt-2 text-[11.5px] text-muted-foreground">{t('Prices excl. VAT; VAT {rate}% configurable in Settings', { rate: db.settings.vatRate })} · {t('Stock shown is sellable stock at the driver’s warehouse on the delivery date.')}</p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t('Cancel')}</Button>
          <Button onClick={submit}>{t('Create order')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function PayType({ value, onChange }: { value: 'cash' | 'credit'; onChange: (v: 'cash' | 'credit') => void }) {
  const t = useT()
  return (
    <RadioGroup value={value} onValueChange={(v) => onChange(v as 'cash' | 'credit')} className="flex h-9 items-center gap-4">
      {(['credit', 'cash'] as const).map((v) => (
        <label key={v} className="flex cursor-pointer items-center gap-1.5 text-[13px]">
          <RadioGroupItem value={v} /> {t(v === 'cash' ? 'Cash' : 'Credit')}
        </label>
      ))}
    </RadioGroup>
  )
}

export function DirectInvoiceDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (o: boolean) => void; onCreated?: (invoiceId: ID) => void }) {
  const t = useT()
  const name = useName()
  const run = useCreditAwareAction()
  const db = useStore((s) => s.db)
  const today = todayKey()
  const [f, setF] = useState({ customerId: '', warehouseId: 'wh_1', paymentType: 'credit' as 'cash' | 'credit', notes: '' })
  const [lines, setLines] = useState<SalesLine[]>([blankLine()])
  const [err, setErr] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (open) {
      setF({ customerId: '', warehouseId: 'wh_1', paymentType: 'credit', notes: '' })
      setLines([blankLine()])
      setErr({})
    }
  }, [open])
  const c = db.customers.find((x) => x.id === f.customerId)
  const available = useMemo(() => Object.fromEntries(db.products.map((p) => [p.id, sellableStock(db, p.id, f.warehouseId, today)])), [db, f.warehouseId, today])
  const totals = invoiceTotals(lines, db.settings.vatRate)
  const submit = async () => {
    const e: Record<string, string> = {}
    if (!f.customerId) e.customerId = 'Select a customer'
    const valid = lines.filter((l) => l.productId && l.qtyKg > 0)
    if (!valid.length) e.lines = 'Add at least one product with KG'
    else if (valid.some((l) => l.price <= 0)) e.lines = 'Selling price must be greater than zero'
    else if (valid.some((l) => l.qtyKg > (available[l.productId] ?? 0) + 0.001)) e.lines = 'Quantity exceeds sellable stock in the selected warehouse'
    setErr(e)
    if (Object.keys(e).length) return
    setBusy(true)
    const r = await run((allow) => (d, ctx) => L.directInvoice(d, ctx, { ...f, date: today, lines, allowOverLimit: allow }), 'Invoice created · stock deducted')
    setBusy(false)
    if (r.ok) {
      onOpenChange(false)
      if ('id' in r && r.id) onCreated?.(r.id)
    }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>{t('Direct sales invoice')}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-4">
          <Field label="Customer" required error={err.customerId} className="sm:col-span-2">
            <Picker
              value={f.customerId}
              onChange={(id) => {
                const cc = db.customers.find((x) => x.id === id)
                setF({ ...f, customerId: id, paymentType: cc?.defaultPayment ?? 'credit' })
                setLines((ls) => ls.map((l) => (l.productId ? { ...l, price: customerPrice(cc, db.products.find((p) => p.id === l.productId)) } : l)))
              }}
              options={db.customers.filter((x) => x.active).map((x) => ({ value: x.id, label: `${name(x)} · ${x.city}` }))}
              placeholder="Select customer"
            />
          </Field>
          <Field label="Dispatch warehouse" required>
            <Picker value={f.warehouseId} onChange={(v) => setF({ ...f, warehouseId: v })} options={db.warehouses.map((w) => ({ value: w.id, label: name(w) }))} />
          </Field>
          <Field label="Payment type">
            <PayType value={f.paymentType} onChange={(v) => setF({ ...f, paymentType: v })} />
          </Field>
          <Field label="Notes" className="sm:col-span-4">
            <Input value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} placeholder={t('e.g. Collected by customer from warehouse')} />
          </Field>
        </div>
        {c && <CustomerCreditHint customerId={c.id} addTotal={totals.total} paymentType={f.paymentType} />}
        <div>
          <LineItemsEditor lines={lines} onChange={setLines} products={db.products} priceFor={(pid) => customerPrice(c, db.products.find((p) => p.id === pid))} available={available} vatRate={db.settings.vatRate} />
          {err.lines && <p className="mt-1 text-[12px] text-danger">{t(err.lines)}</p>}
          <p className="mt-2 text-[11.5px] text-muted-foreground">{t('Prices excl. VAT; VAT {rate}% configurable in Settings', { rate: db.settings.vatRate })} · {t('Stock is deducted FEFO from the selected warehouse when the invoice is posted.')}</p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t('Cancel')}</Button>
          <Button onClick={submit} disabled={busy}>{t('Post invoice')} · {fmtSAR(totals.total)}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function ReturnDialog({ open, onOpenChange, invoiceId }: { open: boolean; onOpenChange: (o: boolean) => void; invoiceId?: ID }) {
  const t = useT()
  const name = useName()
  const act = useAction()
  const db = useStore((s) => s.db)
  const today = todayKey()
  const [invId, setInvId] = useState('')
  const [qty, setQty] = useState<Record<ID, number>>({})
  const [f, setF] = useState({ reason: '', condition: 'resaleable' as 'resaleable' | 'damaged', destination: 'warehouse' as 'van' | 'warehouse', warehouseId: 'wh_1', driverId: '' })
  const [err, setErr] = useState<Record<string, string>>({})
  const inv = db.invoices.find((i) => i.id === invId)
  useEffect(() => {
    if (!open) return
    setInvId(invoiceId ?? '')
    setQty({})
    setErr({})
    const i = db.invoices.find((x) => x.id === invoiceId)
    setF({ reason: '', condition: 'resaleable', destination: i?.driverId ? 'van' : 'warehouse', warehouseId: i?.warehouseId ?? 'wh_1', driverId: i?.driverId ?? '' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, invoiceId])
  const returnable = (pid: ID) => {
    const il = inv?.lines.find((l) => l.productId === pid)
    if (!il) return 0
    const already = db.salesReturns.filter((r) => r.invoiceId === invId).reduce((s, r) => s + (r.lines.find((x) => x.productId === pid)?.qtyKg ?? 0), 0)
    return Math.max(0, il.qtyKg - already)
  }
  const credit = inv ? invoiceTotals(inv.lines.map((l) => ({ ...l, qtyKg: qty[l.productId] ?? 0 })), inv.vatRate).total : 0
  const eligible = db.invoices.filter((i) => i.status !== 'void' && i.source !== 'opening').sort((a, b) => b.date.localeCompare(a.date)).slice(0, 80)
  const submit = () => {
    const e: Record<string, string> = {}
    if (!inv) e.inv = 'Select an invoice'
    const lines = Object.entries(qty).filter(([, q]) => q > 0).map(([productId, qtyKg]) => ({ productId, qtyKg }))
    if (!lines.length) e.lines = 'Enter return quantities'
    if (lines.some((l) => l.qtyKg > returnable(l.productId) + 0.001)) e.lines = 'Return exceeds the returnable KG on this invoice'
    if (!f.reason.trim()) e.reason = 'Enter a return reason'
    if (f.destination === 'van' && !f.driverId) e.driver = 'Select the driver receiving the return'
    setErr(e)
    if (Object.keys(e).length) return
    const r = act((d, ctx) => L.salesReturn(d, ctx, { invoiceId: invId, date: today, lines, reason: f.reason, destination: f.destination, warehouseId: f.destination === 'warehouse' ? f.warehouseId : undefined, condition: f.condition, driverId: f.destination === 'van' ? f.driverId : undefined }), 'Sales return posted · credit note issued')
    if (r.ok) onOpenChange(false)
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('Sales return / credit note')}</DialogTitle>
        </DialogHeader>
        <Field label="Invoice" required error={err.inv}>
          <Picker value={invId} onChange={(v) => { setInvId(v); setQty({}); const i = db.invoices.find((x) => x.id === v); setF((x) => ({ ...x, destination: i?.driverId ? 'van' : 'warehouse', driverId: i?.driverId ?? '', warehouseId: i?.warehouseId ?? x.warehouseId })) }} options={eligible.map((i) => ({ value: i.id, label: `${i.invNo} · ${name(db.customers.find((c) => c.id === i.customerId))} · ${fmtDate(i.date)} · ${fmtSAR(i.total)}` }))} placeholder="Select invoice" />
        </Field>
        {inv && (
          <div className="space-y-2">
            {inv.lines.map((l) => {
              const max = returnable(l.productId)
              return (
                <div key={l.productId} className="grid grid-cols-[1fr_110px] items-center gap-3 rounded-lg border px-3 py-2">
                  <div>
                    <div className="text-[13px] font-medium">{name(db.products.find((p) => p.id === l.productId))}</div>
                    <div className="text-[11.5px] text-muted-foreground">{t('Invoiced')} {fmtKg(l.qtyKg)} · {t('returnable')} {fmtKg(max)} · {fmtNum(l.price, 2)} / kg</div>
                  </div>
                  <NumInput value={qty[l.productId] ?? 0} onChange={(v) => setQty({ ...qty, [l.productId]: v })} placeholder="0" disabled={max <= 0} aria-label="KG" />
                </div>
              )
            })}
            {err.lines && <p className="text-[12px] text-danger">{t(err.lines)}</p>}
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Condition">
            <Picker value={f.condition} onChange={(v) => setF({ ...f, condition: v })} options={[{ value: 'resaleable', label: 'Resaleable - back to stock' }, { value: 'damaged', label: 'Damaged - write off' }]} />
          </Field>
          <Field label="Received into">
            <Picker value={f.destination} onChange={(v) => setF({ ...f, destination: v })} options={[{ value: 'warehouse', label: 'Warehouse' }, { value: 'van', label: 'Driver van' }]} />
          </Field>
          {f.destination === 'warehouse' ? (
            <Field label="Warehouse">
              <Picker value={f.warehouseId} onChange={(v) => setF({ ...f, warehouseId: v })} options={db.warehouses.map((w) => ({ value: w.id, label: name(w) }))} />
            </Field>
          ) : (
            <Field label="Driver" error={err.driver}>
              <Picker value={f.driverId} onChange={(v) => setF({ ...f, driverId: v })} options={db.drivers.map((d) => ({ value: d.id, label: name(d) }))} />
            </Field>
          )}
          <Field label="Reason" required error={err.reason}>
            <Input value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} placeholder={t('e.g. Packaging torn on delivery')} />
          </Field>
        </div>
        {f.condition === 'damaged' && f.destination === 'warehouse' && <Alert tone="info">{t('Damaged goods returned to the warehouse are credited to the customer but not added back to sellable stock.')}</Alert>}
        <div className="rounded-lg bg-muted/60 p-3 text-[13px]">
          <SummaryRow label={t('Credit note amount (incl. VAT)')} value={fmtSAR(credit)} strong />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t('Cancel')}</Button>
          <Button onClick={submit}>{t('Post return')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
