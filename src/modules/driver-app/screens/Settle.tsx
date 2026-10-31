import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, Check, FileText, PackageOpen, Send } from 'lucide-react'
import type { ID } from '@/types'
import * as L from '@/store/logic'
import { useT, useName } from '@/i18n'
import { fmtDateTime, fmtKg, fmtNum, fmtSAR, round2 } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Alert, Field, PrintDialog, StatusBadge, useAction, useConfirm } from '@/components/common'
import { SettlementDoc } from '@/components/docs'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { computeSettlement } from '@/store/derive'
import { useDriverDay } from '../useDriverDay'
import { BigButton, KV, Screen, SectionTitle } from '../ui'

export default function Settle() {
  const t = useT()
  const d = useDriverDay()
  const s = d.settlement
  if (s && s.status !== 'rejected') return <SubmittedView />
  return (
    <Screen title="Daily settlement" back="/driver">
      {s?.status === 'rejected' && (
        <Alert tone="danger">
          <div className="font-semibold">{t('Settlement {no} was rejected', { no: s.settlementNo })}</div>
          {s.supervisorRemarks && <div>{t('Supervisor remarks')}: {s.supervisorRemarks}</div>}
          <div className="mt-1">{t('Correct the issue and submit again.')}</div>
        </Alert>
      )}
      <SettleForm />
    </Screen>
  )
}

function SettleForm() {
  const t = useT()
  const name = useName()
  const nav = useNavigate()
  const act = useAction()
  const confirm = useConfirm()
  const d = useDriverDay()
  const calc = useMemo(() => computeSettlement(d.db, d.driverId, d.today), [d.db, d.driverId, d.today])
  const [physical, setPhysical] = useState<Record<ID, number>>(() => Object.fromEntries(calc.rows.map((r) => [r.productId, r.closing])))
  const [cash, setCash] = useState<number | ''>('')
  const [notes, setNotes] = useState('')
  const handed = cash === '' ? 0 : cash
  const variance = round2(handed - calc.expectedCash)
  const physicalKg = round2(calc.rows.reduce((s, r) => s + (physical[r.productId] ?? r.closing), 0))
  const stockDiff = round2(physicalKg - calc.closingKg)
  const tol = d.db.settings.cashVarianceToleranceSAR

  const submit = async () => {
    if (Math.abs(variance) > tol || Math.abs(stockDiff) > 0.5) {
      const ok = await confirm({
        title: t('Submit with differences?'),
        description: t('Cash difference {cash} · stock difference {kg}. Your supervisor will review it.', { cash: fmtSAR(variance), kg: fmtKg(stockDiff) }),
        confirmText: t('Submit anyway'),
      })
      if (!ok) return
    }
    act((db, ctx) => L.submitSettlement(db, ctx, { driverId: d.driverId, date: d.today, cashHandedOver: handed, physical, notes: notes || undefined }), 'Settlement submitted to supervisor')
  }

  if (!calc.rows.length && !calc.paymentIds.length)
    return <Alert tone="info">{t('No van activity found for today - nothing to settle.')}</Alert>

  return (
    <div className="space-y-4">
      {d.pending.length > 0 && (
        <Alert tone="danger" icon={AlertTriangle}>
          <div className="font-semibold">{t('{n} stop(s) still pending', { n: d.pending.length })}</div>
          <ul className="mt-1 space-y-0.5">
            {d.pending.map((p) => (
              <li key={p.id}>
                <button className="underline" onClick={() => nav(`/driver/stop/${p.id}`)}>#{p.routeSeq} {name(d.db.customers.find((c) => c.id === p.customerId))}</button>
              </li>
            ))}
          </ul>
          <div className="mt-1">{t('Complete or fail them before submitting.')}</div>
        </Alert>
      )}

      <SectionTitle>{t('Stock reconciliation')}</SectionTitle>
      <div className="rounded-2xl border bg-card p-3.5">
        <KV label={t('Opening stock')} value={fmtKg(calc.openingKg)} />
        <KV label={`+ ${t('Loaded stock')}`} value={fmtKg(calc.loadedKg)} />
        {calc.customerReturnsKg > 0 && <KV label={`+ ${t('Customer returns')}`} value={fmtKg(calc.customerReturnsKg)} />}
        <KV label={`- ${t('Delivered / sold')}`} value={fmtKg(calc.deliveredKg)} />
        <KV label={`- ${t('Returned to warehouse')}`} value={fmtKg(calc.returnedKg)} />
        <KV label={`- ${t('Recorded loss')}`} value={fmtKg(calc.lossKg)} />
        <KV label={t('Closing stock')} value={fmtKg(calc.closingKg)} strong />
      </div>
      {calc.closingKg > 0.5 && (
        <button onClick={() => nav('/driver/stock?action=return')} className="flex w-full items-center gap-2 rounded-xl bg-warning-soft px-3 py-3 text-start text-[13px] text-warning">
          <PackageOpen className="size-5 shrink-0" />
          {t('{kg} still on the van. Return unsold stock to the warehouse, or keep it for tomorrow (reefer).', { kg: fmtKg(calc.closingKg) })}
        </button>
      )}

      {calc.rows.some((r) => r.closing > 0 || (physical[r.productId] ?? 0) > 0) && (
        <>
          <SectionTitle>{t('Physical count on van')}</SectionTitle>
          <div className="space-y-2">
            {calc.rows.filter((r) => r.closing > 0 || (physical[r.productId] ?? 0) > 0).map((r) => {
              const p = d.db.products.find((x) => x.id === r.productId)
              const diff = round2((physical[r.productId] ?? r.closing) - r.closing)
              return (
                <div key={r.productId} className="flex items-center gap-3 rounded-xl border bg-card p-3">
                  <span className="min-w-0 flex-1 text-[13px]">
                    <span className="block truncate font-medium">{name(p)}</span>
                    <span className={cn('text-[11.5px]', Math.abs(diff) > 0.01 ? 'text-danger' : 'text-muted-foreground')}>{t('System')} {fmtNum(r.closing, 1)} kg{Math.abs(diff) > 0.01 ? ` · ${diff > 0 ? '+' : ''}${fmtNum(diff, 1)}` : ''}</span>
                  </span>
                  <Input type="number" inputMode="decimal" value={physical[r.productId] ?? r.closing} onFocus={(e) => e.target.select()} onChange={(e) => setPhysical({ ...physical, [r.productId]: Number(e.target.value) || 0 })} className="h-12 w-28 text-center text-[16px] font-semibold tabular" />
                </div>
              )
            })}
          </div>
        </>
      )}

      <SectionTitle>{t('Sales & collections')}</SectionTitle>
      <div className="rounded-2xl border bg-card p-3.5">
        <KV label={t('Total sales')} value={fmtSAR(calc.totalSales)} />
        <KV label={t('Cash sales')} value={fmtSAR(calc.cashSales)} />
        <KV label={t('Credit sales')} value={fmtSAR(calc.creditSales)} />
        <KV label={t('Cash collected')} value={fmtSAR(calc.cashCollected)} />
        <KV label={t('Bank transfers')} value={fmtSAR(calc.bankTransfers)} />
        <KV label={t('Old dues collected')} value={fmtSAR(calc.oldDuesCollected)} />
        <KV label={t('Expected cash in hand')} value={fmtSAR(calc.expectedCash)} strong />
      </div>
      <Field label="Cash handed over (SAR)" required>
        <Input type="number" inputMode="decimal" value={cash} placeholder={fmtNum(calc.expectedCash, 2)} onChange={(e) => setCash(e.target.value === '' ? '' : Number(e.target.value))} className="h-14 text-center text-[24px] font-bold tabular" />
      </Field>
      {cash !== '' && (
        <div className={cn('rounded-xl px-3 py-2.5 text-center text-[14px] font-semibold', Math.abs(variance) < 0.01 ? 'bg-success-soft text-success' : variance < 0 ? 'bg-danger-soft text-danger' : 'bg-warning-soft text-warning')}>
          {Math.abs(variance) < 0.01 ? t('Cash matches') : variance < 0 ? `${t('Cash shortage')}: ${fmtSAR(-variance)}` : `${t('Cash excess')}: ${fmtSAR(variance)}`}
        </div>
      )}
      <Field label="Notes for supervisor">
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="min-h-16 text-[14px]" />
      </Field>
      <BigButton icon={Send} disabled={d.pending.length > 0 || cash === ''} onClick={submit}>{t('Submit settlement')}</BigButton>
    </div>
  )
}

function SubmittedView() {
  const t = useT()
  const d = useDriverDay()
  const s = d.settlement!
  const [print, setPrint] = useState(false)
  // index of the step currently in progress (all earlier steps are done)
  const active = { submitted: 1, under_review: 1, verified: 3, approved: 4, closed: 5, rejected: 1 }[s.status]
  const steps = ['Driver Submits', 'Supervisor Reviews', 'Cash & Stock Verified', 'Approved', 'Day Closed']
  return (
    <Screen title="Daily settlement" back="/driver" action={<StatusBadge status={s.status} />}>
      <div className="rounded-2xl border bg-card p-4">
        <div className="mb-4 text-[13px] text-muted-foreground">{s.settlementNo} · {t('Submitted')} {fmtDateTime(s.submittedAt)}</div>
        <ol className="space-y-0">
          {steps.map((st, i) => {
            const done = i < active
            const now = i === active
            return (
              <li key={st} className="relative flex items-start gap-3 pb-4 last:pb-0">
                {i < steps.length - 1 && <span className={cn('absolute start-[13px] top-7 bottom-0 w-0.5', done ? 'bg-brand' : 'bg-border')} />}
                <span className={cn('relative z-10 flex size-7 shrink-0 items-center justify-center rounded-full border-2 text-[12px] font-bold', done ? 'border-brand bg-brand text-white' : now ? 'border-brand bg-card text-brand ring-4 ring-brand/15' : 'border-border bg-card text-muted-foreground')}>
                  {done ? <Check className="size-4" /> : i + 1}
                </span>
                <span className={cn('pt-1 text-[14px]', done || now ? 'font-semibold' : 'text-muted-foreground')}>
                  {t(st)}
                  {now && <span className="ms-2 text-[12px] font-normal text-brand">{t('in progress')}</span>}
                </span>
              </li>
            )
          })}
        </ol>
      </div>
      {s.supervisorRemarks && <Alert tone="info">{t('Supervisor remarks')}: {s.supervisorRemarks}</Alert>}
      <div className="grid grid-cols-2 gap-3">
        <Box label="Total sales" value={fmtSAR(s.totalSales, { decimals: false })} />
        <Box label="Cash handed over" value={fmtSAR(s.cashHandedOver, { decimals: false })} />
        <Box label="Bank transfers" value={fmtSAR(s.bankTransfers, { decimals: false })} />
        <Box label="Old dues collected" value={fmtSAR(s.oldDuesCollected, { decimals: false })} />
        <Box label="Delivered / sold" value={fmtKg(s.deliveredKg, 0)} />
        <Box label="Closing stock" value={fmtKg(s.closingKg, 0)} />
      </div>
      <div className={cn('rounded-xl px-3 py-2.5 text-center text-[14px] font-semibold', Math.abs(s.cashVariance) < 0.01 ? 'bg-success-soft text-success' : s.cashVariance < 0 ? 'bg-danger-soft text-danger' : 'bg-warning-soft text-warning')}>
        {Math.abs(s.cashVariance) < 0.01 ? t('Cash matches') : s.cashVariance < 0 ? `${t('Cash shortage')}: ${fmtSAR(-s.cashVariance)}` : `${t('Cash excess')}: ${fmtSAR(s.cashVariance)}`}
      </div>
      <SectionTitle>{t('History')}</SectionTitle>
      <ol className="space-y-2">
        {s.history.map((h, i) => (
          <li key={i} className="flex gap-3 text-[13px]">
            <span className="mt-1.5 size-2 shrink-0 rounded-full bg-brand" />
            <span><span className="font-medium">{t(h.status)}</span> · {h.by}<br /><span className="text-[12px] text-muted-foreground">{fmtDateTime(h.at)}{h.note ? ` · ${h.note}` : ''}</span></span>
          </li>
        ))}
      </ol>
      <BigButton variant="outline" icon={FileText} onClick={() => setPrint(true)}>{t('View settlement report')}</BigButton>
      <PrintDialog open={print} onOpenChange={setPrint} title="Daily Driver Settlement" wide><SettlementDoc settlementId={s.id} /></PrintDialog>
    </Screen>
  )
}

const Box = ({ label, value }: { label: string; value: string }) => {
  const t = useT()
  return (
    <div className="rounded-2xl border bg-card p-3.5">
      <div className="text-[12px] text-muted-foreground">{t(label)}</div>
      <div className="mt-1 text-[18px] font-bold tabular">{value}</div>
    </div>
  )
}
