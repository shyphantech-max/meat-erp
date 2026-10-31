/** Admin prepares / submits a driver's end-of-day settlement (on behalf of the driver). */
import { useEffect, useMemo, useState } from 'react'
import type { DayKey, ID } from '@/types'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Alert, Field, NumInput, Stat, useAction } from '@/components/common'
import { useStore } from '@/store/useStore'
import { computeSettlement } from '@/store/derive'
import * as L from '@/store/logic'
import { useT, useName } from '@/i18n'
import { fmtDate, fmtNum, fmtSAR, round2 } from '@/lib/format'
import { cn } from '@/lib/utils'

export function PrepareSettlementDialog({ driverId, date, open, onOpenChange, onSubmitted }: { driverId: ID; date: DayKey; open: boolean; onOpenChange: (o: boolean) => void; onSubmitted?: (id: ID) => void }) {
  const t = useT()
  const name = useName()
  const act = useAction()
  const db = useStore((s) => s.db)
  const calc = useMemo(() => computeSettlement(db, driverId, date), [db, driverId, date])
  const driver = db.drivers.find((d) => d.id === driverId)
  const [cash, setCash] = useState(0)
  const [physical, setPhysical] = useState<Record<ID, number>>({})
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (!open) return
    setCash(calc.expectedCash)
    setPhysical(Object.fromEntries(calc.rows.map((r) => [r.productId, r.closing])))
    setNotes('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, driverId, date])
  const pendingStops = db.deliveries.filter((d) => d.driverId === driverId && d.date === date && ['pending', 'out_for_delivery'].includes(d.status)).length
  const variance = round2(cash - calc.expectedCash)
  const tol = db.settings.cashVarianceToleranceSAR
  const physTotal = round2(Object.values(physical).reduce((s, v) => s + (v || 0), 0))
  const stockDiff = round2(physTotal - calc.closingKg)

  const submit = () => {
    if (busy) return
    setBusy(true)
    const r = act((d, ctx) => L.submitSettlement(d, ctx, { driverId, date, cashHandedOver: cash, physical, notes: notes.trim() || undefined }), 'Settlement submitted for review')
    setBusy(false)
    if (r.ok) {
      onOpenChange(false)
      onSubmitted?.(r.id!)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {t('Prepare settlement')} · {name(driver)} · {fmtDate(date)}
          </DialogTitle>
        </DialogHeader>
        {pendingStops > 0 && <Alert tone="warning">{t('{n} delivery stop(s) still pending - complete or fail them before submitting.', { n: pendingStops })}</Alert>}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="Total sales" value={fmtSAR(calc.totalSales)} />
          <Stat label="Cash collected" value={fmtSAR(calc.cashCollected)} />
          <Stat label="Bank transfers" value={fmtSAR(calc.bankTransfers)} />
          <Stat label="Old dues collected" value={fmtSAR(calc.oldDuesCollected)} />
        </div>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-[12.5px]">
            <thead className="bg-muted/50 text-[11px] text-muted-foreground uppercase">
              <tr>
                <th className="px-2 py-1.5 text-start">{t('Product')}</th>
                <th className="px-2 py-1.5 text-end">{t('Opening')}</th>
                <th className="px-2 py-1.5 text-end">{t('Loaded')}</th>
                <th className="px-2 py-1.5 text-end">{t('Delivered / sold')}</th>
                <th className="px-2 py-1.5 text-end">{t('Returned to WH')}</th>
                <th className="px-2 py-1.5 text-end">{t('Closing (system)')}</th>
                <th className="w-28 px-2 py-1.5 text-end">{t('Physical count')}</th>
              </tr>
            </thead>
            <tbody>
              {calc.rows.map((r) => {
                const diff = round2((physical[r.productId] ?? r.closing) - r.closing)
                return (
                  <tr key={r.productId} className="border-t">
                    <td className="px-2 py-1.5">{name(db.products.find((p) => p.id === r.productId))}</td>
                    <td className="px-2 py-1.5 text-end tabular">{fmtNum(r.opening, 1)}</td>
                    <td className="px-2 py-1.5 text-end tabular">{fmtNum(r.loaded, 1)}</td>
                    <td className="px-2 py-1.5 text-end tabular">{fmtNum(r.delivered, 1)}</td>
                    <td className="px-2 py-1.5 text-end tabular">{fmtNum(r.returnedToWH, 1)}</td>
                    <td className="px-2 py-1.5 text-end font-medium tabular">{fmtNum(r.closing, 1)}</td>
                    <td className="px-2 py-1">
                      <NumInput value={physical[r.productId] ?? 0} onChange={(v) => setPhysical((p) => ({ ...p, [r.productId]: v }))} className={cn('h-8 text-end', Math.abs(diff) > 0.01 && 'border-warning')} />
                    </td>
                  </tr>
                )
              })}
              {calc.rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-4 text-center text-muted-foreground">{t('No van stock movements for this day.')}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Cash handed over (SAR)" required hint={`${t('Expected cash')}: ${fmtSAR(calc.expectedCash)}`}>
            <NumInput value={cash} onChange={setCash} />
          </Field>
          <Stat label={variance < 0 ? 'Cash shortage' : 'Cash excess'} value={fmtSAR(variance)} tone={Math.abs(variance) > tol ? 'danger' : variance === 0 ? 'success' : 'warning'} />
          <Stat label="Stock discrepancy" value={`${fmtNum(stockDiff, 1)} kg`} tone={Math.abs(stockDiff) > 0.5 ? 'danger' : 'success'} />
        </div>
        <Field label="Driver notes">
          <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t('Cancel')}</Button>
          <Button onClick={submit} disabled={busy || pendingStops > 0}>{t('Submit settlement')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
