import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Banknote, CheckCircle2, ChevronRight, History, Landmark, Printer, Receipt, Save } from 'lucide-react'
import type { ID, PaymentAllocation } from '@/types'
import * as L from '@/store/logic'
import { useT, useName } from '@/i18n'
import { fmtDate, fmtSAR, round2 } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Alert, Field, PrintDialog, newIdemKey, useAction } from '@/components/common'
import { ReceiptDoc } from '@/components/docs'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { invoiceBalance } from '@/store/derive'
import { useDriverDay } from '../useDriverDay'
import { BigButton, KV, Screen, SectionTitle, Segmented } from '../ui'

export default function Collect() {
  const [sp] = useSearchParams()
  const invoiceId = sp.get('invoice')
  const mode = sp.get('mode')
  const view = sp.get('view')
  // remount the form for every new target so each opening gets a fresh idempotency key
  if (invoiceId) return <PaymentForm key={invoiceId} kind="invoice" invoiceId={invoiceId} />
  if (mode === 'old') return <PaymentForm key={`old-${sp.get('customer') ?? ''}`} kind="old" customerId={sp.get('customer') ?? undefined} />
  if (view === 'outstanding') return <OutstandingList />
  return <Landing />
}

function Landing() {
  const t = useT()
  const name = useName()
  const nav = useNavigate()
  const d = useDriverDay()
  return (
    <Screen title="Collect payment" back="/driver">
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl border bg-card p-3.5">
          <div className="text-[12px] text-muted-foreground">{t('Cash collected')}</div>
          <div className="mt-1 text-[19px] font-bold tabular">{fmtSAR(d.cash, { decimals: false })}</div>
        </div>
        <div className="rounded-2xl border bg-card p-3.5">
          <div className="text-[12px] text-muted-foreground">{t('Bank transfers')}</div>
          <div className="mt-1 text-[19px] font-bold tabular">{fmtSAR(d.bank, { decimals: false })}</div>
        </div>
      </div>

      <SectionTitle>{t("Today's unpaid invoices")}</SectionTitle>
      {d.unpaidToday.length === 0 && <p className="rounded-xl border border-dashed p-5 text-center text-[13px] text-muted-foreground">{t('All of today’s invoices are paid')}</p>}
      <div className="space-y-2">
        {d.unpaidToday.map((i) => (
          <button key={i.id} onClick={() => nav(`/driver/collect?invoice=${i.id}`)} className="flex w-full items-center gap-3 rounded-2xl border bg-card p-3.5 text-start active:bg-muted">
            <Receipt className="size-5 shrink-0 text-brand" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14.5px] font-semibold">{name(d.db.customers.find((c) => c.id === i.customerId))}</span>
              <span className="block text-[12px] text-muted-foreground">{i.invNo} · {t(i.paymentType === 'cash' ? 'Cash' : 'Credit')}</span>
            </span>
            <span className="text-end">
              <span className="block text-[15px] font-bold tabular">{fmtSAR(invoiceBalance(i))}</span>
              <span className="block text-[11px] text-muted-foreground">{t('of')} {fmtSAR(i.total)}</span>
            </span>
            <ChevronRight className="flip-rtl size-5 text-muted-foreground" />
          </button>
        ))}
      </div>

      <SectionTitle>{t('Old outstanding')}</SectionTitle>
      <BigButton variant="outline" icon={History} onClick={() => nav('/driver/collect?mode=old')}>{t('Collect old outstanding')}</BigButton>
      <button className="w-full py-2 text-[13px] font-medium text-brand" onClick={() => nav('/driver/collect?view=outstanding')}>{t('View outstanding by customer')}</button>

      <SectionTitle>{t('Collected today')}</SectionTitle>
      <div className="space-y-1.5">
        {d.payments.length === 0 && <p className="text-center text-[13px] text-muted-foreground">{t('No collections yet')}</p>}
        {d.payments.map((p) => (
          <div key={p.id} className="flex items-center justify-between rounded-xl bg-card px-3 py-2.5 text-[13px] ring-1 ring-border">
            <span className="min-w-0">
              <span className="block truncate font-medium">{name(d.db.customers.find((c) => c.id === p.customerId))}</span>
              <span className="text-[11.5px] text-muted-foreground">{p.receiptNo} · {t(p.method === 'cash' ? 'Cash' : 'Bank')} · {t(p.collectionType)}</span>
            </span>
            <span className="font-semibold tabular">{fmtSAR(p.amount)}</span>
          </div>
        ))}
      </div>
    </Screen>
  )
}

function OutstandingList() {
  const t = useT()
  const name = useName()
  const nav = useNavigate()
  const d = useDriverDay()
  const list = [...d.routeCustomers].sort((a, b) => (d.outstanding[b.id] ?? 0) - (d.outstanding[a.id] ?? 0))
  return (
    <Screen title="Customer outstanding" back="/driver/collect">
      <div className="rounded-2xl bg-navy p-4 text-white">
        <div className="text-[12px] text-sidebar-muted">{t('Total pending from my customers')}</div>
        <div className="text-[24px] font-bold tabular">{fmtSAR(d.pendingPayments)}</div>
      </div>
      <div className="space-y-2">
        {list.map((c) => {
          const total = d.outstanding[c.id] ?? 0
          const old = d.oldOutstanding[c.id] ?? 0
          return (
            <div key={c.id} className="rounded-2xl border bg-card p-3.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-[14.5px] font-semibold">{name(c)}</div>
                  <div className="text-[12px] text-muted-foreground">{t('Credit limit')} {fmtSAR(c.creditLimit, { decimals: false })}</div>
                </div>
                <div className="text-end">
                  <div className={cn('text-[16px] font-bold tabular', total > 0 ? 'text-danger' : 'text-success')}>{fmtSAR(total)}</div>
                  {old > 0 && <div className="text-[11.5px] text-muted-foreground">{t('Old dues')} {fmtSAR(old)}</div>}
                </div>
              </div>
              {old > 0 && (
                <button className="mt-2.5 h-11 w-full rounded-xl bg-brand-soft text-[14px] font-semibold text-brand active:bg-brand-muted" onClick={() => nav(`/driver/collect?mode=old&customer=${c.id}`)}>
                  {t('Collect old dues')}
                </button>
              )}
            </div>
          )
        })}
      </div>
    </Screen>
  )
}

/** payment against today's invoice, or against selected old outstanding invoices */
function PaymentForm({ kind, invoiceId, customerId: initialCustomer }: { kind: 'invoice' | 'old'; invoiceId?: ID; customerId?: ID }) {
  const t = useT()
  const name = useName()
  const nav = useNavigate()
  const act = useAction()
  const d = useDriverDay()
  const [idemKey] = useState(newIdemKey)
  const [saving, setSaving] = useState(false)
  const [savedId, setSavedId] = useState<ID | null>(null)
  const [showReceipt, setShowReceipt] = useState(false)
  const inv = invoiceId ? d.db.invoices.find((i) => i.id === invoiceId) : undefined
  const [customerId, setCustomerId] = useState<ID | undefined>(inv?.customerId ?? initialCustomer)
  const customer = d.db.customers.find((c) => c.id === customerId)
  const balance = inv ? invoiceBalance(inv) : 0
  const oldInvoices = useMemo(
    () => (customerId ? d.db.invoices.filter((i) => i.customerId === customerId && i.date < d.today && invoiceBalance(i) > 0).sort((a, b) => a.date.localeCompare(b.date)) : []),
    [d.db.invoices, customerId, d.today],
  )
  const [picked, setPicked] = useState<ID[] | null>(null)
  const selected = picked ?? oldInvoices.map((i) => i.id)
  const selectedDue = round2(oldInvoices.filter((i) => selected.includes(i.id)).reduce((s, i) => s + invoiceBalance(i), 0))
  const due = kind === 'invoice' ? balance : selectedDue
  const [full, setFull] = useState<'full' | 'partial'>('full')
  const [amountRaw, setAmountRaw] = useState<number>(0)
  const amount = full === 'full' ? due : amountRaw
  const [method, setMethod] = useState<'cash' | 'bank'>('cash')
  const [bankRef, setBankRef] = useState('')
  const [notes, setNotes] = useState('')
  const previous = customer ? round2((d.outstanding[customer.id] ?? 0) - (inv ? balance : 0)) : 0

  const allocations = (): PaymentAllocation[] => {
    if (kind === 'invoice' && inv) return [{ invoiceId: inv.id, amount: round2(amount) }]
    let left = round2(amount)
    const out: PaymentAllocation[] = []
    for (const i of oldInvoices.filter((x) => selected.includes(x.id))) {
      if (left <= 0.001) break
      const take = round2(Math.min(left, invoiceBalance(i)))
      out.push({ invoiceId: i.id, amount: take })
      left = round2(left - take)
    }
    return out
  }

  const save = () => {
    if (!customer || saving) return
    setSaving(true)
    const r = act(
      (db, ctx) => L.recordPayment(db, ctx, {
        customerId: customer.id, driverId: d.driverId, date: d.today, method, amount: round2(amount), bankRef: method === 'bank' ? bankRef : undefined,
        allocations: allocations(), notes: notes || (kind === 'old' ? 'Old outstanding collected on route' : undefined), idempotencyKey: idemKey,
      }),
      'Collection saved',
    )
    setSaving(false)
    if (r.ok && r.id) setSavedId(r.id)
  }

  if (savedId) {
    const p = d.db.payments.find((x) => x.id === savedId)
    return (
      <Screen>
        <div className="flex flex-col items-center pt-8 text-center">
          <span className="flex size-20 items-center justify-center rounded-full bg-brand-soft"><CheckCircle2 className="size-11 text-brand" /></span>
          <h1 className="mt-4 text-[22px] font-bold">{t('Payment saved')}</h1>
          <p className="mt-1 text-[14px] text-muted-foreground">{p?.receiptNo} · {name(customer)}</p>
          <div className="mt-3 text-[30px] font-bold text-brand tabular">{fmtSAR(p?.amount ?? 0)}</div>
          <p className="text-[13px] text-muted-foreground">{t('New outstanding')}: {fmtSAR(customer ? (d.outstanding[customer.id] ?? 0) : 0)}</p>
        </div>
        <div className="space-y-2.5 pt-4">
          <BigButton icon={Printer} variant="outline" onClick={() => setShowReceipt(true)}>{t('View receipt')}</BigButton>
          <BigButton onClick={() => nav('/driver/route')}>{t('Next stop')}</BigButton>
          <BigButton variant="ghost" onClick={() => nav('/driver/collect')}>{t('Back to collections')}</BigButton>
        </div>
        <PrintDialog open={showReceipt} onOpenChange={setShowReceipt} title="Payment Receipt"><ReceiptDoc paymentId={savedId} /></PrintDialog>
      </Screen>
    )
  }

  const canSave = !!customer && amount > 0 && amount <= due + 0.01 && (method === 'cash' || bankRef.trim().length > 2) && !saving && (kind === 'invoice' || selected.length > 0)
  return (
    <Screen title={kind === 'invoice' ? 'Record payment' : 'Collect old outstanding'} back="/driver/collect">
      {kind === 'old' && !customer && (
        <div className="space-y-2">
          <SectionTitle>{t('Select customer')}</SectionTitle>
          {d.routeCustomers.filter((c) => (d.oldOutstanding[c.id] ?? 0) > 0).map((c) => (
            <button key={c.id} onClick={() => setCustomerId(c.id)} className="flex w-full items-center justify-between rounded-2xl border bg-card p-3.5 text-start active:bg-muted">
              <span className="truncate text-[14.5px] font-semibold">{name(c)}</span>
              <span className="font-bold text-danger tabular">{fmtSAR(d.oldOutstanding[c.id])}</span>
            </button>
          ))}
          {!d.routeCustomers.some((c) => (d.oldOutstanding[c.id] ?? 0) > 0) && <p className="rounded-xl border border-dashed p-5 text-center text-[13px] text-muted-foreground">{t('No old outstanding on your customers')}</p>}
        </div>
      )}
      {customer && (
        <>
          <div className="rounded-2xl border bg-card p-3.5">
            <KV label={t('Customer')} value={<span className="font-semibold text-foreground">{name(customer)}</span>} />
            {inv && <KV label={t('Invoice number')} value={inv.invNo} />}
            {inv && <KV label={t('Invoice amount')} value={fmtSAR(inv.total)} />}
            {inv && inv.paid + inv.returned > 0 && <KV label={t('Already paid / credited')} value={fmtSAR(inv.paid + inv.returned)} />}
            <KV label={t('Previous outstanding')} value={fmtSAR(previous)} />
            <KV label={kind === 'invoice' ? t('Balance on this invoice') : t('Selected old dues')} value={fmtSAR(due)} strong />
          </div>
          {kind === 'invoice' && inv && balance <= 0 && <Alert tone="success" icon={CheckCircle2}>{t('This invoice is fully paid')}</Alert>}
          {kind === 'old' && (
            <div className="space-y-1.5">
              <SectionTitle>{t('Old invoices')}</SectionTitle>
              {oldInvoices.map((i) => (
                <label key={i.id} className="flex min-h-12 items-center gap-3 rounded-xl border bg-card px-3 py-2.5">
                  <Checkbox className="size-5" checked={selected.includes(i.id)} onCheckedChange={(v) => setPicked(v ? [...selected, i.id] : selected.filter((x) => x !== i.id))} />
                  <span className="min-w-0 flex-1 text-[13px]">
                    <span className="block font-medium">{i.invNo}</span>
                    <span className="text-[11.5px] text-muted-foreground">{fmtDate(i.date)}</span>
                  </span>
                  <span className="font-semibold tabular">{fmtSAR(invoiceBalance(i))}</span>
                </label>
              ))}
              <p className="text-[11.5px] text-muted-foreground">{t('Payment is applied to the oldest selected invoice first.')}</p>
            </div>
          )}
          {due > 0 && (
            <>
              <Segmented value={full} onChange={(v) => { setFull(v); if (v === 'partial') setAmountRaw(0) }} options={[{ value: 'full', label: 'Full payment' }, { value: 'partial', label: 'Partial' }]} />
              <Field label="Amount collected (SAR)">
                <Input
                  type="number"
                  inputMode="decimal"
                  value={full === 'full' ? due : amountRaw || ''}
                  disabled={full === 'full'}
                  onChange={(e) => setAmountRaw(Number(e.target.value) || 0)}
                  className="h-14 text-center text-[24px] font-bold tabular"
                  placeholder="0.00"
                />
              </Field>
              {amount > due + 0.01 && <p className="text-[12.5px] text-danger">{t('Amount is more than the balance due')}</p>}
              <Segmented value={method} onChange={setMethod} options={[{ value: 'cash', label: 'Cash', icon: Banknote }, { value: 'bank', label: 'Bank Transfer', icon: Landmark }]} />
              {method === 'bank' && (
                <Field label="Bank transfer reference" required>
                  <Input value={bankRef} onChange={(e) => setBankRef(e.target.value)} className="h-12 text-[16px]" placeholder="e.g. SNB1234567" />
                </Field>
              )}
              <Field label="Payment notes">
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="min-h-14 text-[14px]" />
              </Field>
              <BigButton icon={Save} disabled={!canSave} onClick={save}>{saving ? t('Saving…') : `${t('Save collection')} · ${fmtSAR(amount)}`}</BigButton>
            </>
          )}
          {kind === 'old' && !initialCustomer && <BigButton variant="ghost" onClick={() => { setCustomerId(undefined); setPicked(null) }}>{t('Change customer')}</BigButton>}
        </>
      )}
    </Screen>
  )
}
