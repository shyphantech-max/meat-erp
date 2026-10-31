/** Purchasing dialogs: supplier form, purchase order form, supplier payment. */
import { useEffect, useMemo, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import type { Currency, ID, PurchaseOrder, Species, Supplier } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Checkbox } from '@/components/ui/checkbox'
import { Alert, Field, NumInput, Picker, SummaryRow, useAction } from '@/components/common'
import { useStore } from '@/store/useStore'
import { useT, useName } from '@/i18n'
import { FX } from '@/data/master'
import * as L from '@/store/logic'
import { fmtKg, fmtNum, fmtSAR, round2, shiftDay, todayKey } from '@/lib/format'
import { cn } from '@/lib/utils'

const CURRENCIES: Currency[] = ['SAR', 'USD', 'AUD', 'NZD']
export const fmtFx = (n: number, c: Currency) => (c === 'SAR' ? fmtSAR(n) : `${c} ${fmtNum(n, 2)}`)

// ───────────────────────── supplier ─────────────────────────
type SupplierForm = Omit<Supplier, 'id' | 'code'> & { id?: ID; code?: string }
const blankSupplier = (): SupplierForm => ({
  name: '', type: 'local', country: 'Saudi Arabia', city: '', contactPerson: '', phone: '', email: '', currency: 'SAR', paymentTermsDays: 30, products: ['chicken'], rating: 4, active: true,
})

export function SupplierDialog({ supplier, open, onOpenChange }: { supplier?: Supplier | null; open: boolean; onOpenChange: (o: boolean) => void }) {
  const t = useT()
  const act = useAction()
  const count = useStore((s) => s.db.suppliers.length)
  const [f, setF] = useState<SupplierForm>(blankSupplier())
  const [tried, setTried] = useState(false)
  useEffect(() => {
    if (open) {
      setF(supplier ? { ...supplier } : blankSupplier())
      setTried(false)
    }
  }, [open, supplier])
  const set = <K extends keyof SupplierForm>(k: K, v: SupplierForm[K]) => setF((s) => ({ ...s, [k]: v }))
  const errors: Partial<Record<keyof SupplierForm, string>> = {}
  if (!f.name.trim()) errors.name = 'Supplier name is required'
  if (!f.country.trim()) errors.country = 'Country is required'
  if (!f.contactPerson.trim()) errors.contactPerson = 'Contact person is required'
  if (!/^\+?[\d\s-]{7,}$/.test(f.phone)) errors.phone = 'Enter a valid phone number'
  if (f.email && !/^\S+@\S+\.\S+$/.test(f.email)) errors.email = 'Enter a valid email'
  if (!f.products.length) errors.products = 'Select at least one product type'
  const save = () => {
    setTried(true)
    if (Object.keys(errors).length) return
    const item = { ...f, code: f.code ?? `SUP-${String(count + 1).padStart(3, '0')}` }
    const r = act((db, ctx) => L.upsertMaster<Supplier>(db, ctx, 'suppliers', item, 'sup'), supplier ? 'Supplier updated' : 'Supplier added')
    if (r.ok) onOpenChange(false)
  }
  const e = (k: keyof SupplierForm) => (tried ? errors[k] : undefined)
  const toggleSpecies = (sp: Species, on: boolean) => set('products', on ? [...new Set([...f.products, sp])] : f.products.filter((x) => x !== sp))
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t(supplier ? 'Edit supplier' : 'Add supplier')}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Supplier name" required error={e('name')} className="sm:col-span-2">
            <Input value={f.name} onChange={(x) => set('name', x.target.value)} />
          </Field>
          <Field label="Supplier type" required>
            <Picker
              value={f.type}
              onChange={(v) => setF((s) => ({ ...s, type: v, currency: v === 'local' ? 'SAR' : s.currency === 'SAR' ? 'USD' : s.currency, country: v === 'local' ? 'Saudi Arabia' : s.country === 'Saudi Arabia' ? '' : s.country }))}
              options={[{ value: 'local', label: 'Local' }, { value: 'international', label: 'International' }]}
            />
          </Field>
          <Field label="Country" required error={e('country')}>
            <Input value={f.country} onChange={(x) => set('country', x.target.value)} />
          </Field>
          <Field label="City">
            <Input value={f.city} onChange={(x) => set('city', x.target.value)} />
          </Field>
          <Field label="Contact person" required error={e('contactPerson')}>
            <Input value={f.contactPerson} onChange={(x) => set('contactPerson', x.target.value)} />
          </Field>
          <Field label="Phone" required error={e('phone')}>
            <Input value={f.phone} onChange={(x) => set('phone', x.target.value)} placeholder="+966 …" dir="ltr" />
          </Field>
          <Field label="Email" error={e('email')}>
            <Input value={f.email} onChange={(x) => set('email', x.target.value)} dir="ltr" />
          </Field>
          <Field label="Currency">
            <Picker value={f.currency} onChange={(v) => set('currency', v)} options={CURRENCIES.map((c) => ({ value: c, label: c }))} />
          </Field>
          <Field label="Payment terms (days)">
            <NumInput value={f.paymentTermsDays} onChange={(v) => set('paymentTermsDays', Math.round(v))} />
          </Field>
          <Field label="Rating (1-5)">
            <NumInput value={f.rating} onChange={(v) => set('rating', Math.min(5, Math.max(1, v)))} step="0.1" />
          </Field>
          <Field label="Products supplied" required error={e('products')}>
            <div className="flex h-9 items-center gap-4">
              {(['chicken', 'mutton'] as Species[]).map((sp) => (
                <label key={sp} className="flex items-center gap-2 text-[13px]">
                  <Checkbox checked={f.products.includes(sp)} onCheckedChange={(v) => toggleSpecies(sp, !!v)} /> {t(sp === 'chicken' ? 'Chicken' : 'Mutton')}
                </label>
              ))}
            </div>
          </Field>
          <Field label="Active">
            <label className="flex h-9 items-center gap-2 text-[13px]">
              <Checkbox checked={f.active} onCheckedChange={(v) => set('active', !!v)} /> {t('Supplier is active')}
            </label>
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t('Cancel')}</Button>
          <Button onClick={save}>{t(supplier ? 'Save changes' : 'Add supplier')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ───────────────────────── purchase order ─────────────────────────
interface POLineForm { productId: ID; qtyKg: number; cartons: number; rate: number }
interface POForm {
  supplierId: ID
  kind: 'local' | 'import'
  date: string
  expectedDate: string
  warehouseId: ID
  currency: Currency
  fxRate: number
  lines: POLineForm[]
  notes: string
}
const blankLine = (): POLineForm => ({ productId: '', qtyKg: 0, cartons: 0, rate: 0 })

export function PODialog({ po, open, onOpenChange, defaultSupplierId, onSaved }: { po?: PurchaseOrder | null; open: boolean; onOpenChange: (o: boolean) => void; defaultSupplierId?: ID; onSaved?: (id: ID) => void }) {
  const t = useT()
  const name = useName()
  const act = useAction()
  const db = useStore((s) => s.db)
  const [f, setF] = useState<POForm | null>(null)
  const [tried, setTried] = useState(false)
  useEffect(() => {
    if (!open) return
    setTried(false)
    if (po) {
      setF({ supplierId: po.supplierId, kind: po.kind, date: po.date, expectedDate: po.expectedDate, warehouseId: po.warehouseId, currency: po.currency, fxRate: po.fxRate, notes: po.notes ?? '', lines: po.lines.map((l) => ({ productId: l.productId, qtyKg: l.qtyKg, cartons: l.cartons, rate: l.rate })) })
    } else {
      const sup = db.suppliers.find((s) => s.id === defaultSupplierId)
      setF({
        supplierId: sup?.id ?? '', kind: sup?.type === 'international' ? 'import' : 'local', date: todayKey(), expectedDate: shiftDay(todayKey(), sup?.type === 'international' ? 30 : 2),
        warehouseId: 'wh_1', currency: sup?.currency ?? 'SAR', fxRate: FX[sup?.currency ?? 'SAR'], notes: '', lines: [blankLine()],
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, po, defaultSupplierId])
  const supplier = db.suppliers.find((s) => s.id === f?.supplierId)
  const products = useMemo(() => db.products.filter((p) => p.active && (!supplier || supplier.products.includes(p.species))), [db.products, supplier])
  if (!f) return null
  const set = <K extends keyof POForm>(k: K, v: POForm[K]) => setF((s) => (s ? { ...s, [k]: v } : s))
  const setLine = (i: number, patch: Partial<POLineForm>) => set('lines', f.lines.map((l, j) => (j === i ? { ...l, ...patch } : l)))
  const pickSupplier = (id: ID) => {
    const s = db.suppliers.find((x) => x.id === id)!
    setF((x) => x && { ...x, supplierId: id, currency: s.currency, fxRate: FX[s.currency], kind: s.type === 'international' ? 'import' : 'local', expectedDate: shiftDay(x.date, s.type === 'international' ? 30 : 2), lines: x.lines.filter((l) => !l.productId || s.products.includes(db.products.find((p) => p.id === l.productId)!.species)) })
  }
  const valid = f.lines.filter((l) => l.productId && l.qtyKg > 0)
  const totalFx = round2(valid.reduce((s, l) => s + l.qtyKg * l.rate, 0))
  const totalKg = valid.reduce((s, l) => s + l.qtyKg, 0)
  const errors: Record<string, string> = {}
  if (!f.supplierId) errors.supplier = 'Select a supplier'
  if (!f.warehouseId) errors.warehouse = 'Select a warehouse'
  if (!valid.length) errors.lines = 'Add at least one product line with quantity'
  else if (valid.some((l) => l.rate <= 0)) errors.lines = 'Every line needs a purchase rate'
  if (f.expectedDate < f.date) errors.expected = 'Expected date cannot be before the PO date'
  if (!(f.fxRate > 0)) errors.fx = 'Exchange rate must be positive'
  const save = (submit: boolean) => {
    setTried(true)
    if (Object.keys(errors).length) return
    const input: L.POInput = { ...f, notes: f.notes || undefined, submit, lines: valid }
    const r = act((db2, ctx) => L.createPO(db2, ctx, input, po?.id), submit ? 'Purchase order submitted for approval' : 'Draft saved')
    if (r.ok) {
      onOpenChange(false)
      if (r.id) onSaved?.(r.id)
    }
  }
  const e = (k: string) => (tried ? errors[k] : undefined)
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>{po ? `${t('Edit purchase order')} · ${po.poNo}` : t('New purchase order')}</DialogTitle>
        </DialogHeader>
        {po?.status === 'rejected' && po.rejectReason && <Alert tone="danger">{t('Rejected')}: {po.rejectReason}</Alert>}
        <div className="grid gap-3 sm:grid-cols-4">
          <Field label="Supplier" required error={e('supplier')} className="sm:col-span-2">
            <Picker value={f.supplierId} onChange={pickSupplier} options={db.suppliers.filter((s) => s.active || s.id === f.supplierId).map((s) => ({ value: s.id, label: `${s.name} · ${s.country}` }))} placeholder="Select supplier" />
          </Field>
          <Field label="Purchase type">
            <Picker value={f.kind} onChange={(v) => set('kind', v)} options={[{ value: 'local', label: 'Local purchase' }, { value: 'import', label: 'Import' }]} />
          </Field>
          <Field label="Receiving warehouse" required error={e('warehouse')}>
            <Picker value={f.warehouseId} onChange={(v) => set('warehouseId', v)} options={db.warehouses.map((w) => ({ value: w.id, label: name(w) }))} />
          </Field>
          <Field label="Purchase date">
            <Input type="date" value={f.date} onChange={(x) => set('date', x.target.value)} />
          </Field>
          <Field label="Expected arrival" error={e('expected')}>
            <Input type="date" value={f.expectedDate} onChange={(x) => set('expectedDate', x.target.value)} />
          </Field>
          <Field label="Currency">
            <Picker value={f.currency} onChange={(v) => setF((x) => x && { ...x, currency: v, fxRate: FX[v] })} options={CURRENCIES.map((c) => ({ value: c, label: c }))} />
          </Field>
          <Field label="Exchange rate to SAR" error={e('fx')} hint={f.currency === 'SAR' ? undefined : `1 ${f.currency} = ${f.fxRate} SAR`}>
            <NumInput value={f.fxRate} onChange={(v) => set('fxRate', v)} disabled={f.currency === 'SAR'} step="0.0001" />
          </Field>
        </div>

        <div className="space-y-2">
          <div className="hidden grid-cols-[1fr_110px_90px_120px_130px_36px] gap-2 px-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase md:grid">
            <span>{t('Product')}</span>
            <span>{t('Qty (KG)')}</span>
            <span>{t('Cartons')}</span>
            <span>{t('Rate')} ({f.currency}/kg)</span>
            <span className="text-end">{t('Amount')}</span>
            <span />
          </div>
          {f.lines.map((l, i) => {
            const p = db.products.find((x) => x.id === l.productId)
            return (
              <div key={i} className="grid grid-cols-2 gap-2 rounded-lg border p-2 md:grid-cols-[1fr_110px_90px_120px_130px_36px] md:items-center md:border-0 md:p-0">
                <div className="col-span-2 md:col-span-1">
                  <Picker
                    value={l.productId}
                    onChange={(v) => {
                      const pp = db.products.find((x) => x.id === v)!
                      setLine(i, { productId: v, rate: l.rate || round2(pp.costPrice / f.fxRate), cartons: l.qtyKg ? Math.round(l.qtyKg / pp.cartonKg) : 0 })
                    }}
                    options={products.map((o) => ({ value: o.id, label: `${name(o)} · ${o.code}`, disabled: f.lines.some((x, j) => j !== i && x.productId === o.id) }))}
                    placeholder="Select product"
                  />
                </div>
                <NumInput value={l.qtyKg} placeholder="0" onChange={(v) => setLine(i, { qtyKg: v, cartons: p ? Math.round(v / p.cartonKg) : 0 })} aria-label="KG" />
                <NumInput value={l.cartons} placeholder="0" onChange={(v) => setLine(i, { cartons: v, qtyKg: p ? round2(v * p.cartonKg) : l.qtyKg })} aria-label="Cartons" />
                <NumInput value={l.rate} placeholder="0" onChange={(v) => setLine(i, { rate: v })} step="0.01" aria-label="Rate" />
                <div className="flex h-9 flex-col items-end justify-center text-[13px] leading-tight tabular">
                  <span className="font-medium">{fmtFx(l.qtyKg * l.rate, f.currency)}</span>
                  {f.currency !== 'SAR' && <span className="text-[11px] text-muted-foreground">{fmtSAR(l.qtyKg * l.rate * f.fxRate)}</span>}
                </div>
                <Button type="button" variant="ghost" size="icon" className="justify-self-end" disabled={f.lines.length === 1} onClick={() => set('lines', f.lines.filter((_, j) => j !== i))} aria-label="Remove line">
                  <Trash2 className="text-muted-foreground" />
                </Button>
              </div>
            )
          })}
          {e('lines') && <p className="text-[11.5px] text-danger">{t(e('lines')!)}</p>}
          <div className="flex flex-wrap items-start justify-between gap-3">
            <Button type="button" variant="outline" size="sm" onClick={() => set('lines', [...f.lines, blankLine()])}>
              <Plus /> {t('Add line')}
            </Button>
            <div className="w-full max-w-xs space-y-1 rounded-lg bg-muted/60 p-3 text-[13px]">
              <SummaryRow label={t('Total KG')} value={fmtKg(totalKg)} />
              <SummaryRow label={`${t('Total')} (${f.currency})`} value={fmtFx(totalFx, f.currency)} />
              <SummaryRow label={t('Total (SAR)')} value={fmtSAR(totalFx * f.fxRate)} strong />
            </div>
          </div>
        </div>
        <Field label="Notes">
          <Textarea value={f.notes} onChange={(x) => set('notes', x.target.value)} rows={2} placeholder={t('Incoterms, certificates, packing instructions…')} />
        </Field>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t('Cancel')}</Button>
          {(!po || po.status === 'draft') && <Button variant="secondary" onClick={() => save(false)}>{t('Save as draft')}</Button>}
          <Button onClick={() => save(true)}>{t('Submit for approval')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ───────────────────────── supplier payment ─────────────────────────
export function PayDialog({ po, open, onOpenChange }: { po?: PurchaseOrder | null; open: boolean; onOpenChange: (o: boolean) => void }) {
  const t = useT()
  const act = useAction()
  const payments = useStore((s) => s.db.supplierPayments)
  const supplier = useStore((s) => s.db.suppliers.find((x) => x.id === po?.supplierId))
  const due = po ? round2(po.totalSAR - po.paidSAR) : 0
  const [amount, setAmount] = useState(0)
  const [method, setMethod] = useState<'bank' | 'cash' | 'lc'>('bank')
  const [date, setDate] = useState(todayKey())
  const [reference, setReference] = useState('')
  const [tried, setTried] = useState(false)
  useEffect(() => {
    if (open && po) {
      setAmount(round2(po.totalSAR - po.paidSAR))
      setMethod(po.kind === 'import' ? 'lc' : 'bank')
      setDate(todayKey())
      setReference('')
      setTried(false)
    }
  }, [open, po])
  if (!po) return null
  const dupRef = !!reference.trim() && payments.some((p) => p.supplierId === po.supplierId && p.reference?.trim().toLowerCase() === reference.trim().toLowerCase())
  const errors: Record<string, string> = {}
  if (!(amount > 0)) errors.amount = 'Amount must be greater than zero'
  else if (amount > due + 0.001) errors.amount = 'Amount exceeds balance due'
  if (method !== 'cash' && !reference.trim()) errors.reference = 'Enter the transfer / LC reference'
  if (dupRef) errors.reference = 'A payment with this reference is already recorded'
  const save = () => {
    setTried(true)
    if (Object.keys(errors).length) return
    const r = act((db, ctx) => L.paySupplier(db, ctx, { poId: po.id, amountSAR: amount, method, date, reference: reference.trim() || undefined }), 'Supplier payment recorded')
    if (r.ok) onOpenChange(false)
  }
  const e = (k: string) => (tried || k === 'reference' ? errors[k] : undefined)
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('Record supplier payment')}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-3 gap-2 rounded-lg bg-muted/60 p-3 text-[12.5px]">
          <div><div className="text-muted-foreground">{t('Purchase order')}</div><div className="font-semibold">{po.poNo}</div></div>
          <div><div className="text-muted-foreground">{t('Supplier')}</div><div className="truncate font-semibold">{supplier?.name}</div></div>
          <div><div className="text-muted-foreground">{t('Balance due')}</div><div className="font-semibold text-danger tabular">{fmtSAR(due)}</div></div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Amount (SAR)" required error={e('amount')}>
            <NumInput value={amount} onChange={setAmount} step="0.01" />
          </Field>
          <Field label="Payment date">
            <Input type="date" value={date} onChange={(x) => setDate(x.target.value)} />
          </Field>
          <Field label="Method">
            <Picker value={method} onChange={setMethod} options={[{ value: 'bank', label: 'Bank transfer' }, { value: 'lc', label: 'Letter of credit' }, { value: 'cash', label: 'Cash' }]} />
          </Field>
          <Field label="Reference" required={method !== 'cash'} error={e('reference')}>
            <Input value={reference} onChange={(x) => setReference(x.target.value)} placeholder="TT / LC no." dir="ltr" className={cn(dupRef && 'border-danger')} />
          </Field>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setAmount(due)}>{t('Full balance')}</Button>
          <Button size="sm" variant="outline" onClick={() => setAmount(round2(due / 2))}>50%</Button>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t('Cancel')}</Button>
          <Button onClick={save}>{t('Save payment')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** reject with a mandatory reason (PO / GRN) */
export function ReasonDialog({ open, onOpenChange, title, label = 'Reason', confirmText = 'Reject', onConfirm, suggestions = [] }: { open: boolean; onOpenChange: (o: boolean) => void; title: string; label?: string; confirmText?: string; onConfirm: (reason: string) => boolean; suggestions?: string[] }) {
  const t = useT()
  const [reason, setReason] = useState('')
  const [tried, setTried] = useState(false)
  useEffect(() => {
    if (open) { setReason(''); setTried(false) }
  }, [open])
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t(title)}</DialogTitle>
        </DialogHeader>
        <Field label={label} required error={tried && !reason.trim() ? 'Enter a reason' : undefined}>
          <Textarea value={reason} onChange={(x) => setReason(x.target.value)} rows={3} autoFocus />
        </Field>
        {suggestions.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {suggestions.map((s) => (
              <button key={s} onClick={() => setReason(t(s))} className="rounded-full border px-2.5 py-1 text-[11.5px] hover:bg-muted">{t(s)}</button>
            ))}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t('Cancel')}</Button>
          <Button variant="destructive" onClick={() => { setTried(true); if (reason.trim() && onConfirm(reason.trim())) onOpenChange(false) }}>{t(confirmText)}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
