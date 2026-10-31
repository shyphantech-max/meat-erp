import { useState } from 'react'
import { ArrowLeft, CheckCircle2, ClipboardCheck, Lock, Printer, RotateCcw, Search, ShieldCheck, XCircle } from 'lucide-react'
import type { ID, SettlementStatus } from '@/types'
import { SETTLEMENT_FLOW } from '@/types'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Textarea } from '@/components/ui/textarea'
import { Alert, EmptyState, EntityLink, Field, Money, PageHeader, Panel, PrintDialog, Stat, StatusBadge, Stepper, useAction, useConfirm } from '@/components/common'
import { SettlementDoc } from '@/components/docs'
import { useStore } from '@/store/useStore'
import * as L from '@/store/logic'
import { useT, useName } from '@/i18n'
import { fmtDate, fmtDateTime, fmtNum, fmtSAR, fmtTime } from '@/lib/format'
import { cn } from '@/lib/utils'
import { PrepareSettlementDialog } from './PrepareSettlementDialog'

const STEP_LABELS = ['Driver submits', 'Supervisor reviews', 'Cash & stock verified', 'Approved', 'Day closed']

export function SettlementDetail({ id, onBack, onOpen }: { id: ID; onBack: () => void; onOpen: (id: ID) => void }) {
  const t = useT()
  const name = useName()
  const act = useAction()
  const confirm = useConfirm()
  const db = useStore((s) => s.db)
  const s = db.settlements.find((x) => x.id === id)
  const [remarks, setRemarks] = useState('')
  const [cashOk, setCashOk] = useState(false)
  const [stockOk, setStockOk] = useState(false)
  const [print, setPrint] = useState(false)
  const [resubmit, setResubmit] = useState(false)
  if (!s) return <EmptyState title="Settlement not found" action={<Button variant="outline" onClick={onBack}>{t('Back')}</Button>} />

  const driver = db.drivers.find((d) => d.id === s.driverId)
  const vehicle = db.vehicles.find((v) => v.id === s.vehicleId)
  const tol = db.settings.cashVarianceToleranceSAR
  const lastGood = [...s.history].reverse().find((h) => h.status !== 'rejected')?.status ?? 'submitted'
  const current = Math.min(SETTLEMENT_FLOW.indexOf(s.status === 'rejected' ? lastGood : s.status) + 1, STEP_LABELS.length - 1)
  const payments = db.payments.filter((p) => p.settlementId === s.id || (p.driverId === s.driverId && p.date === s.date && !p.settlementId))
  const invoices = db.invoices.filter((i) => i.driverId === s.driverId && i.date === s.date)
  const replacement = s.status === 'rejected' ? db.settlements.find((x) => x.driverId === s.driverId && x.date === s.date && x.status !== 'rejected') : undefined
  const varianceBad = Math.abs(s.cashVariance) > tol
  const stockBad = Math.abs(s.stockDiscrepancyKg) > 0.5

  const move = (to: SettlementStatus, msg: string, extra: { remarks?: string; cashVerified?: boolean; stockVerified?: boolean } = {}) => {
    const r = act((d, ctx) => L.advanceSettlement(d, ctx, s.id, to, { remarks: remarks.trim() || undefined, ...extra }), msg)
    if (r.ok) setRemarks('')
  }

  return (
    <div>
      <Button variant="ghost" size="sm" className="mb-2 -ms-2" onClick={onBack}><ArrowLeft className="flip-rtl" /> {t('All settlements')}</Button>
      <PageHeader
        title={`${t('Settlement')} ${s.settlementNo}`}
        description={`${name(driver)} · ${vehicle?.plateNo ?? ''} · ${fmtDate(s.date)}`}
        badge={<StatusBadge status={s.status} />}
        actions={<Button variant="outline" onClick={() => setPrint(true)}><Printer /> {t('Print report')}</Button>}
      />

      <Panel className="mb-4">
        <Stepper steps={STEP_LABELS} current={current} failed={s.status === 'rejected'} />
        {s.status === 'rejected' && (
          <Alert tone="danger" className="mt-4" icon={XCircle}>
            {t('Rejected')}: {s.supervisorRemarks}
            {replacement && (
              <button className="ms-2 font-semibold underline" onClick={() => onOpen(replacement.id)}>{t('Open resubmission')} {replacement.settlementNo}</button>
            )}
          </Alert>
        )}
      </Panel>

      <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          <Panel title="Stock reconciliation" description="Opening + Loaded + Customer returns - Delivered/Sold - Returned to warehouse - Loss = Closing" bodyClassName="p-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-[12.5px]">
                <thead className="bg-muted/40 text-[11px] text-muted-foreground uppercase">
                  <tr>
                    {['Product', 'Opening', 'Loaded', 'Delivered / sold', 'Cust. returns', 'Returned to WH', 'Loss', 'Closing', 'Physical', 'Discrepancy'].map((h, i) => (
                      <th key={h} className={cn('px-3 py-2 whitespace-nowrap', i ? 'text-end' : 'text-start')}>{t(h)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {s.rows.map((r) => {
                    const diff = r.physical - r.closing
                    return (
                      <tr key={r.productId} className={cn('border-t', Math.abs(diff) > 0.01 && 'bg-danger-soft/50')}>
                        <td className="min-w-[190px] px-3 py-2 font-medium">{name(db.products.find((p) => p.id === r.productId))}</td>
                        {[r.opening, r.loaded, r.delivered, r.customerReturns, r.returnedToWH, r.loss, r.closing, r.physical].map((v, i) => (
                          <td key={i} className={cn('px-3 py-2 text-end tabular', i === 6 && 'font-semibold')}>{fmtNum(v, 1)}</td>
                        ))}
                        <td className={cn('px-3 py-2 text-end font-semibold tabular', Math.abs(diff) > 0.01 ? 'text-danger' : 'text-muted-foreground')}>{fmtNum(diff, 1)}</td>
                      </tr>
                    )
                  })}
                  <tr className="border-t bg-muted/30 font-semibold">
                    <td className="px-3 py-2">{t('Total')} (kg)</td>
                    {[s.openingKg, s.loadedKg, s.deliveredKg, s.customerReturnsKg, s.returnedKg, s.lossKg, s.closingKg, s.physicalKg, s.stockDiscrepancyKg].map((v, i) => (
                      <td key={i} className={cn('px-3 py-2 text-end tabular', i === 8 && stockBad && 'text-danger')}>{fmtNum(v, 1)}</td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
            {s.rows.length === 0 && <p className="p-4 text-center text-sm text-muted-foreground">{t('No van stock movements.')}</p>}
          </Panel>

          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title="Collections included" bodyClassName="p-0">
              {payments.length === 0 ? (
                <p className="p-4 text-center text-sm text-muted-foreground">{t('No collections')}</p>
              ) : (
                <ul className="divide-y text-[12.5px]">
                  {payments.map((p) => (
                    <li key={p.id} className="flex items-center justify-between gap-2 px-4 py-2">
                      <div className="min-w-0">
                        <div className="truncate font-medium">{name(db.customers.find((c) => c.id === p.customerId))}</div>
                        <div className="text-[11px] text-muted-foreground">{p.receiptNo} · {fmtTime(p.createdAt)} · {t(p.method === 'cash' ? 'Cash' : 'Bank transfer')}</div>
                      </div>
                      <div className="text-end">
                        <Money value={p.amount} className="font-semibold" />
                        <div className="mt-0.5 flex justify-end gap-1"><StatusBadge status={p.collectionType} /><StatusBadge status={p.verification} /></div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
            <Panel title="Invoices of the day" bodyClassName="p-0">
              {invoices.length === 0 ? (
                <p className="p-4 text-center text-sm text-muted-foreground">{t('No invoices')}</p>
              ) : (
                <ul className="divide-y text-[12.5px]">
                  {invoices.map((i) => (
                    <li key={i.id} className="flex items-center justify-between gap-2 px-4 py-2">
                      <div className="min-w-0">
                        <EntityLink to={`/customers/${i.customerId}`} className="truncate">{name(db.customers.find((c) => c.id === i.customerId))}</EntityLink>
                        <div className="text-[11px] text-muted-foreground">{i.invNo} · {t(i.source)} · {t(i.paymentType === 'cash' ? 'Cash' : 'Credit')}</div>
                      </div>
                      <div className="text-end">
                        <Money value={i.total} className="font-semibold" />
                        <div className="mt-0.5"><StatusBadge status={i.status} /></div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>
        </div>

        <div className="space-y-4">
          <Panel title="Cash summary (SAR)">
            <dl className="space-y-1.5 text-[13px]">
              {([
                ['Total sales', s.totalSales], ['Cash sales', s.cashSales], ['Credit sales', s.creditSales], ['Cash collected', s.cashCollected], ['Bank transfers', s.bankTransfers],
                ['Collected against today’s sales', s.currentCollected], ['Old dues collected', s.oldDuesCollected],
              ] as [string, number][]).map(([l, v]) => (
                <div key={l} className="flex justify-between gap-2"><dt className="text-muted-foreground">{t(l)}</dt><dd className="tabular">{fmtSAR(v)}</dd></div>
              ))}
              <div className="flex justify-between gap-2 border-t pt-1.5 font-semibold"><dt>{t('Expected cash')}</dt><dd className="tabular">{fmtSAR(s.expectedCash)}</dd></div>
              <div className="flex justify-between gap-2 font-semibold"><dt>{t('Cash handed over')}</dt><dd className="tabular">{fmtSAR(s.cashHandedOver)}</dd></div>
            </dl>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Stat label={s.cashVariance < 0 ? 'Cash shortage' : 'Cash excess'} value={fmtSAR(s.cashVariance)} tone={varianceBad ? 'danger' : s.cashVariance === 0 ? 'success' : 'warning'} />
              <Stat label="Stock discrepancy" value={`${fmtNum(s.stockDiscrepancyKg, 1)} kg`} tone={stockBad ? 'danger' : 'success'} />
            </div>
            <p className="mt-2 text-[11.5px] text-muted-foreground">{t('Tolerance')}: ± {fmtSAR(tol)} · {t('Deliveries')}: {s.deliveriesDone}/{s.deliveriesTotal}</p>
            {s.driverNotes && <p className="mt-2 rounded-md bg-muted/60 p-2 text-[12.5px]"><span className="font-medium">{t('Driver notes')}:</span> {s.driverNotes}</p>}
            {s.supervisorRemarks && s.status !== 'rejected' && <p className="mt-2 rounded-md bg-muted/60 p-2 text-[12.5px]"><span className="font-medium">{t('Supervisor remarks')}:</span> {s.supervisorRemarks}</p>}
          </Panel>

          <Panel title="Supervisor actions" icon={ShieldCheck}>
            {s.status === 'submitted' && (
              <div className="space-y-3">
                <p className="text-[13px] text-muted-foreground">{t('Driver has submitted. Start the review to count cash and check van stock.')}</p>
                <Button className="w-full" onClick={() => move('under_review', 'Review started')}><Search /> {t('Start review')}</Button>
                <RejectBlock remarks={remarks} setRemarks={setRemarks} onReject={() => move('rejected', 'Settlement rejected - driver must resubmit')} />
              </div>
            )}
            {s.status === 'under_review' && (
              <div className="space-y-3">
                <label className="flex items-center gap-2 text-[13px]"><Checkbox checked={cashOk} onCheckedChange={(v) => setCashOk(!!v)} /> {t('Cash counted and matches handed-over amount')}</label>
                <label className="flex items-center gap-2 text-[13px]"><Checkbox checked={stockOk} onCheckedChange={(v) => setStockOk(!!v)} /> {t('Van stock checked against the closing count')}</label>
                {varianceBad && <Alert tone="danger">{t('Cash variance exceeds tolerance: supervisor remarks are required.')}</Alert>}
                <Field label="Supervisor remarks" required={varianceBad}>
                  <Textarea rows={2} value={remarks} onChange={(e) => setRemarks(e.target.value)} />
                </Field>
                <Button className="w-full" disabled={!cashOk || !stockOk || (varianceBad && !remarks.trim())} onClick={() => move('verified', 'Cash & stock verified', { cashVerified: cashOk, stockVerified: stockOk })}>
                  <ClipboardCheck /> {t('Mark cash & stock verified')}
                </Button>
                <Button variant="outline" className="w-full text-danger" disabled={!remarks.trim()} onClick={() => move('rejected', 'Settlement rejected - driver must resubmit')}><XCircle /> {t('Reject with remarks')}</Button>
              </div>
            )}
            {s.status === 'verified' && (
              <div className="space-y-3">
                <p className="text-[13px] text-muted-foreground">{t('Approving marks the driver’s collections as verified and updates dashboards and reports.')}</p>
                <Button
                  className="w-full"
                  onClick={async () => {
                    if (await confirm({ title: t('Approve settlement?'), description: `${s.settlementNo} · ${fmtSAR(s.cashHandedOver)}`, confirmText: t('Approve') })) move('approved', 'Settlement approved')
                  }}
                >
                  <CheckCircle2 /> {t('Approve settlement')}
                </Button>
                <RejectBlock remarks={remarks} setRemarks={setRemarks} onReject={() => move('rejected', 'Settlement rejected - driver must resubmit')} />
              </div>
            )}
            {s.status === 'approved' && (
              <div className="space-y-3">
                <p className="text-[13px] text-muted-foreground">{t('Close the day to lock this settlement.')}</p>
                <Button className="w-full" variant="dark" onClick={() => move('closed', 'Day closed')}><Lock /> {t('Close day')}</Button>
              </div>
            )}
            {s.status === 'closed' && <Alert tone="success" icon={Lock}>{t('Day closed - no further changes.')}</Alert>}
            {s.status === 'rejected' && !replacement && (
              <div className="space-y-3">
                <p className="text-[13px] text-muted-foreground">{t('Waiting for the driver to correct and resubmit.')}</p>
                <Button variant="outline" className="w-full" onClick={() => setResubmit(true)}><RotateCcw /> {t('Resubmit on behalf of driver')}</Button>
              </div>
            )}
          </Panel>

          <Panel title="History">
            <ol className="space-y-2.5 text-[12.5px]">
              {s.history.map((h, i) => (
                <li key={i} className="flex gap-2.5">
                  <span className="mt-1.5 size-2 shrink-0 rounded-full bg-brand" />
                  <div>
                    <div className="font-medium">{t(h.status)} · {h.by}</div>
                    <div className="text-[11px] text-muted-foreground">{fmtDateTime(h.at)}</div>
                    {h.note && <div className="text-[12px] text-muted-foreground">{h.note}</div>}
                  </div>
                </li>
              ))}
            </ol>
          </Panel>
        </div>
      </div>

      <PrintDialog open={print} onOpenChange={setPrint} title="Daily Driver Settlement" wide>
        <SettlementDoc settlementId={s.id} />
      </PrintDialog>
      <PrepareSettlementDialog driverId={s.driverId} date={s.date} open={resubmit} onOpenChange={setResubmit} onSubmitted={onOpen} />
    </div>
  )
}

function RejectBlock({ remarks, setRemarks, onReject }: { remarks: string; setRemarks: (s: string) => void; onReject: () => void }) {
  const t = useT()
  return (
    <div className="space-y-2 border-t pt-3">
      <Field label="Remarks for driver">
        <Textarea rows={2} value={remarks} onChange={(e) => setRemarks(e.target.value)} />
      </Field>
      <Button variant="outline" className="w-full text-danger" disabled={!remarks.trim()} onClick={onReject}><XCircle /> {t('Reject with remarks')}</Button>
    </div>
  )
}
