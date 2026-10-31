import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { ShoppingBag } from 'lucide-react'
import type { ID } from '@/types'
import * as L from '@/store/logic'
import { useT, useName, tr } from '@/i18n'
import { fmtKg, fmtSAR } from '@/lib/format'
import { Alert, Picker, useAction, useConfirm } from '@/components/common'
import { customerPrice, invoiceTotals } from '@/store/derive'
import { useDriverDay } from '../useDriverDay'
import { BigButton, KV, QtyStepper, Screen, SectionTitle, Segmented } from '../ui'

/** sell directly from the van's available stock */
export default function VanSale() {
  const t = useT()
  const name = useName()
  const nav = useNavigate()
  const act = useAction()
  const confirm = useConfirm()
  const d = useDriverDay()
  const city = d.warehouse?.city
  const customers = useMemo(() => d.db.customers.filter((c) => c.active && (!city || c.city === city || d.routeCustomers.some((r) => r.id === c.id))), [d.db.customers, city, d.routeCustomers])
  const [customerId, setCustomerId] = useState<ID>('')
  const customer = customers.find((c) => c.id === customerId)
  const [qty, setQty] = useState<Record<ID, number>>({})
  const [paymentType, setPaymentType] = useState<'cash' | 'credit'>('cash')
  const items = Object.entries(d.van).filter(([, q]) => q > 0)
  const lines = items
    .filter(([pid]) => (qty[pid] ?? 0) > 0)
    .map(([pid]) => ({ productId: pid, qtyKg: qty[pid], price: customerPrice(customer, d.db.products.find((p) => p.id === pid)) }))
  const totals = invoiceTotals(lines, d.db.settings.vatRate)

  const save = async () => {
    const input = { driverId: d.driverId, customerId, date: d.today, lines, paymentType }
    let r = act((db, ctx) => L.vanSale(db, ctx, input), undefined, { silentError: true })
    if (!r.ok && r.code === 'CREDIT_LIMIT') {
      if (!(await confirm({ title: t('Credit limit exceeded'), description: r.error, confirmText: t('Sell anyway') }))) return
      r = act((db, ctx) => L.vanSale(db, ctx, { ...input, allowOverLimit: true }), undefined, { silentError: true })
    }
    if (!r.ok) return toast.error(tr(r.error))
    toast.success(t('Van sale invoice created'))
    nav(paymentType === 'cash' ? `/driver/collect?invoice=${r.id}` : '/driver')
  }

  if (d.dayClosed) return <Screen title="Van sale" back="/driver"><Alert>{t('Your day is already settled.')}</Alert></Screen>
  return (
    <Screen title="Van sale" back="/driver">
      <Picker value={customerId} onChange={setCustomerId} placeholder="Select customer" className="h-12 text-[15px]" options={customers.map((c) => ({ value: c.id, label: name(c) }))} />
      {items.length === 0 && <Alert>{t('Your van is empty.')}</Alert>}
      {customer && (
        <>
          <SectionTitle>{t('Available on van')}</SectionTitle>
          <div className="space-y-2">
            {items.map(([pid, have]) => {
              const p = d.db.products.find((x) => x.id === pid)!
              return (
                <div key={pid} className="rounded-2xl border bg-card p-3.5">
                  <div className="mb-2 flex items-start justify-between gap-2 text-[13px]">
                    <span className="font-semibold">{name(p)}</span>
                    <span className="text-end text-muted-foreground">{fmtKg(have)}<br />{fmtSAR(customerPrice(customer, p))}/{t('kg')}</span>
                  </div>
                  <QtyStepper value={qty[pid] ?? 0} onChange={(v) => setQty({ ...qty, [pid]: v })} step={p.cartonKg} max={have} />
                </div>
              )
            })}
          </div>
          <Segmented value={paymentType} onChange={setPaymentType} options={[{ value: 'cash', label: 'Cash' }, { value: 'credit', label: 'Credit' }]} />
          <div className="rounded-2xl border bg-card p-3.5">
            <KV label={t('Subtotal')} value={fmtSAR(totals.subtotal)} />
            <KV label={`${t('VAT')} ${d.db.settings.vatRate}%`} value={fmtSAR(totals.vat)} />
            <KV label={t('Total')} value={fmtSAR(totals.total)} strong />
          </div>
          <BigButton icon={ShoppingBag} disabled={!lines.length} onClick={save}>{t('Create invoice')}</BigButton>
        </>
      )}
    </Screen>
  )
}
