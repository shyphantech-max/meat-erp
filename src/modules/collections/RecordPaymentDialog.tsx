/**
 * Record a customer payment with invoice allocation.
 * An idempotency key is created each time the dialog opens, so a double click (or a
 * second Save after success) is rejected by the store as a duplicate instead of double-posting.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { CheckCircle2, Printer, Wand2 } from 'lucide-react'
import type { ID, PaymentMethod } from '@/types'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Alert, Field, NumInput, Picker, PrintDialog, newIdemKey, useAction } from '@/components/common'
import { ReceiptDoc } from '@/components/docs'
import { useStore } from '@/store/useStore'
import * as L from '@/store/logic'
import { customerOutstanding, invoiceBalance } from '@/store/derive'
import { useT, useName } from '@/i18n'
import { fmtDate, fmtSAR, round2, todayKey } from '@/lib/format'
import { cn } from '@/lib/utils'

type Scope = 'all' | 'today' | 'old'

export function RecordPaymentDialog({ open, onOpenChange, customerId: initialCustomer, driverId: initialDriver, onSaved }: { open: boolean; onOpenChange: (o: boolean) => void; customerId?: ID; driverId?: ID; onSaved?: (paymentId: ID) => void }) {
  const t = useT()
  const name = useName()
  const act = useAction()
  const db = useStore((s) => s.db)
  const [customerId, setCustomerId] = useState<ID>('')
  const [driverId, setDriverId] = useState<ID>('office')
  const [date, setDate] = useState(todayKey())
  const [method, setMethod] = useState<PaymentMethod>('cash')
  const [bankRef, setBankRef] = useState('')
  const [mode, setMode] = useState<'full' | 'partial'>('full')
  const [scope, setScope] = useState<Scope>('all')
  const [amount, setAmount] = useState(0)
  const [alloc, setAlloc] = useState<Record<ID, number>>({})
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [savedId, setSavedId] = useState<ID | null>(null)
  const [printOpen, setPrintOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const idem = useRef(newIdemKey())

  // reset every time the dialog opens
  useEffect(() => {
    if (!open) return
    idem.current = newIdemKey()
    setCustomerId(initialCustomer ?? '')
    setDriverId(initialDriver ?? 'office')
    setDate(todayKey())
    setMethod('cash')
    setBankRef('')
    setMode('full')
    setScope('all')
    setNotes('')
    setError(null)
    setSavedId(null)
    setBusy(false)
  }, [open, initialCustomer, initialDriver])

  const openInv = useMemo(
    () =>
      db.invoices
        .filter((i) => i.customerId === customerId && invoiceBalance(i) > 0)
        .filter((i) => (scope === 'today' ? i.date >= date : scope === 'old' ? i.date < date : true))
        .sort((a, b) => a.date.localeCompare(b.date) || a.invNo.localeCompare(b.invNo)),
    [db.invoices, customerId, scope, date],
  )
  const dueTotal = round2(openInv.reduce((s, i) => s + invoiceBalance(i), 0))

  const autoAllocate = (amt: number) => {
    let left = amt
    const next: Record<ID, number> = {}
    for (const i of openInv) {
      const take = round2(Math.max(0, Math.min(left, invoiceBalance(i))))
      next[i.id] = take
      left = round2(left - take)
    }
    setAlloc(next)
  }
  // recompute allocation whenever the basis changes
  useEffect(() => {
    const amt = mode === 'full' ? dueTotal : Math.min(amount, dueTotal)
    if (mode === 'full') setAmount(dueTotal)
    autoAllocate(amt)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId, scope, dueTotal, date])

  const allocated = round2(Object.values(alloc).reduce((s, v) => s + (v || 0), 0))
  const mismatch = customerId && amount > 0 && Math.abs(allocated - amount) > 0.009
  const customer = db.customers.find((c) => c.id === customerId)
  const drivers = db.drivers
  const savedPayment = savedId ? db.payments.find((p) => p.id === savedId) : undefined

  const save = () => {
    if (busy) return
    setBusy(true)
    setError(null)
    const allocations = Object.entries(alloc).filter(([, v]) => v > 0).map(([invoiceId, v]) => ({ invoiceId, amount: v }))
    const r = act(
      (d, ctx) =>
        L.recordPayment(d, ctx, {
          customerId, driverId: driverId === 'office' ? undefined : driverId, date, method, amount, bankRef: method === 'bank' ? bankRef : undefined,
          allocations, notes: notes.trim() || undefined, idempotencyKey: idem.current,
        }),
      'Payment recorded',
    )
    setBusy(false)
    if (r.ok) {
      setSavedId(r.id!)
      onSaved?.(r.id!)
    } else setError(r.error)
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{t('Record payment')}</DialogTitle>
          </DialogHeader>
          {savedPayment ? (
            <div className="space-y-4">
              <div className="flex flex-col items-center rounded-xl bg-brand-soft p-6 text-center">
                <CheckCircle2 className="size-10 text-brand" />
                <p className="mt-2 text-lg font-bold text-brand-ink">{fmtSAR(savedPayment.amount)}</p>
                <p className="text-sm text-muted-foreground">
                  {savedPayment.receiptNo} · {name(customer)}
                </p>
                <div className="mt-3 grid w-full max-w-sm grid-cols-2 gap-2 text-[13px]">
                  <div className="rounded-lg bg-card p-2">
                    <div className="text-[11px] text-muted-foreground">{t('Allocated invoices')}</div>
                    <div className="font-semibold">{savedPayment.allocations.length}</div>
                  </div>
                  <div className="rounded-lg bg-card p-2">
                    <div className="text-[11px] text-muted-foreground">{t('Updated outstanding')}</div>
                    <div className="font-semibold">{fmtSAR(customerOutstanding(db, savedPayment.customerId))}</div>
                  </div>
                </div>
              </div>
              {error && <Alert tone="danger">{t(error)}</Alert>}
              <DialogFooter>
                <Button variant="outline" onClick={() => onOpenChange(false)}>{t('Close')}</Button>
                <Button variant="outline" onClick={save} title={t('Saving again is blocked as a duplicate')}>{t('Save again')}</Button>
                <Button onClick={() => setPrintOpen(true)}><Printer /> {t('Print receipt')}</Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Customer" required className="sm:col-span-2">
                  <Picker value={customerId} onChange={setCustomerId} placeholder="Select customer" options={db.customers.map((c) => ({ value: c.id, label: `${name(c)} · ${fmtSAR(customerOutstanding(db, c.id), { decimals: false })}` }))} />
                </Field>
                <Field label="Date" required>
                  <Input type="date" value={date} max={todayKey()} onChange={(e) => setDate(e.target.value || todayKey())} />
                </Field>
                <Field label="Collected by">
                  <Picker value={driverId} onChange={setDriverId} options={[{ value: 'office', label: t('Head office') }, ...drivers.map((d) => ({ value: d.id, label: name(d) }))]} />
                </Field>
                <Field label="Method" required>
                  <Picker value={method} onChange={(v) => setMethod(v as PaymentMethod)} options={[{ value: 'cash', label: 'Cash' }, { value: 'bank', label: 'Bank transfer' }]} />
                </Field>
                {method === 'bank' ? (
                  <Field label="Bank reference" required>
                    <Input value={bankRef} onChange={(e) => setBankRef(e.target.value)} placeholder="e.g. SNB1234567" />
                  </Field>
                ) : (
                  <div />
                )}
              </div>

              {customer && (
                <>
                  <div className="flex flex-wrap items-end gap-3 rounded-lg bg-muted/50 p-3">
                    <Field label="Apply to">
                      <Seg value={scope} onChange={setScope} options={[{ value: 'all', label: t('All open') }, { value: 'today', label: t("Today's invoices") }, { value: 'old', label: t('Old outstanding') }]} />
                    </Field>
                    <Field label="Payment">
                      <Seg
                        value={mode}
                        onChange={(v) => {
                          setMode(v)
                          if (v === 'full') {
                            setAmount(dueTotal)
                            autoAllocate(dueTotal)
                          }
                        }}
                        options={[{ value: 'full', label: t('Full') }, { value: 'partial', label: t('Partial') }]} />
                    </Field>
                    <Field label="Amount (SAR)" required className="w-40">
                      <NumInput
                        value={amount}
                        disabled={mode === 'full'}
                        onChange={(v) => {
                          setAmount(v)
                          autoAllocate(Math.min(v, dueTotal))
                        }}
                      />
                    </Field>
                    <div className="ms-auto text-end text-[12px]">
                      <div className="text-muted-foreground">{t('Open balance in scope')}</div>
                      <div className="text-[15px] font-semibold tabular">{fmtSAR(dueTotal)}</div>
                    </div>
                  </div>

                  {openInv.length === 0 ? (
                    <Alert tone="info">{t('No open invoices for this customer in the selected scope.')}</Alert>
                  ) : (
                    <div className="overflow-hidden rounded-lg border">
                      <div className="flex items-center justify-between border-b bg-muted/40 px-3 py-2 text-[12px] font-semibold">
                        {t('Invoice allocation')}
                        <Button size="sm" variant="ghost" onClick={() => autoAllocate(Math.min(amount, dueTotal))}><Wand2 /> {t('Auto-allocate oldest first')}</Button>
                      </div>
                      <div className="max-h-60 overflow-y-auto">
                        <table className="w-full text-[13px]">
                          <thead className="text-[11px] text-muted-foreground uppercase">
                            <tr>
                              <th className="px-3 py-1.5 text-start">{t('Invoice')}</th>
                              <th className="px-3 py-1.5 text-start">{t('Date')}</th>
                              <th className="px-3 py-1.5 text-end">{t('Total')}</th>
                              <th className="px-3 py-1.5 text-end">{t('Balance')}</th>
                              <th className="w-36 px-3 py-1.5 text-end">{t('Allocate')}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {openInv.map((i) => {
                              const bal = invoiceBalance(i)
                              const v = alloc[i.id] ?? 0
                              return (
                                <tr key={i.id} className="border-t">
                                  <td className="px-3 py-1.5 font-medium">
                                    {i.invNo}
                                    {i.date < date && <span className="ms-1.5 rounded bg-maroon-soft px-1 text-[10px] text-navy">{t('old')}</span>}
                                  </td>
                                  <td className="px-3 py-1.5">{fmtDate(i.date)}</td>
                                  <td className="px-3 py-1.5 text-end tabular">{fmtSAR(i.total)}</td>
                                  <td className="px-3 py-1.5 text-end tabular">{fmtSAR(bal)}</td>
                                  <td className="px-3 py-1">
                                    <NumInput
                                      value={v}
                                      className={cn('h-8 text-end', v > bal + 0.009 && 'border-danger')}
                                      onChange={(n) => {
                                        const next = { ...alloc, [i.id]: n }
                                        setAlloc(next)
                                        if (mode === 'partial' || Math.abs(n - bal) > 0.009) {
                                          setMode('partial')
                                          setAmount(round2(Object.values(next).reduce((s, x) => s + (x || 0), 0)))
                                        }
                                      }}
                                    />
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                      <div className={cn('flex justify-between border-t px-3 py-2 text-[13px] font-semibold', mismatch && 'bg-danger-soft text-danger')}>
                        <span>{t('Allocated')}</span>
                        <span className="tabular">
                          {fmtSAR(allocated)} / {fmtSAR(amount)}
                        </span>
                      </div>
                    </div>
                  )}
                </>
              )}

              <Field label="Payment notes">
                <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t('Optional')} />
              </Field>
              {error && (
                <Alert tone="danger">
                  {error.includes('duplicate') || error.includes('already') ? <strong>{t('Duplicate blocked')}: </strong> : null}
                  {t(error)}
                </Alert>
              )}
              <DialogFooter>
                <Button variant="outline" onClick={() => onOpenChange(false)}>{t('Cancel')}</Button>
                <Button onClick={save} disabled={busy || !customerId || !(amount > 0) || !!mismatch || (method === 'bank' && !bankRef.trim())}>
                  {t('Save collection')}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
      {savedId && (
        <PrintDialog open={printOpen} onOpenChange={setPrintOpen} title="Payment Receipt">
          <ReceiptDoc paymentId={savedId} />
        </PrintDialog>
      )}
    </>
  )
}

export function Seg<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
  return (
    <div className="inline-flex h-9 rounded-lg border bg-card p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn('rounded-md px-3 text-[12.5px] font-medium transition-colors', value === o.value ? 'bg-brand text-white' : 'text-muted-foreground hover:text-foreground')}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
