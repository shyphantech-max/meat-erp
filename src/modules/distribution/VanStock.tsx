import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ArrowLeftRight, CheckCircle2, PackageMinus, Scale, Truck, Warehouse } from 'lucide-react'
import type { ID } from '@/types'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Alert, EmptyState, Field, Kg, NumInput, Panel, Picker, Stat, StatusBadge, useAction, useDialog } from '@/components/common'
import { useStore } from '@/store/useStore'
import { useT, useName } from '@/i18n'
import * as L from '@/store/logic'
import { computeSettlement, vanStockByProduct } from '@/store/derive'
import { fmtDate, fmtKg, fmtNum, round2, todayKey } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useDistParams } from './params'

export default function VanStockTab() {
  const t = useT()
  const name = useName()
  const db = useStore((s) => s.db)
  const { date, driver: driverParam, set } = useDistParams()
  const today = todayKey()
  const withStock = db.drivers.filter((d) => db.vanMovements.some((m) => m.driverId === d.id))
  const driverId = driverParam || withStock[0]?.id || ''
  const ret = useDialog()
  const loss = useDialog()

  const calc = useMemo(() => (driverId ? computeSettlement(db, driverId, date) : null), [db, driverId, date])
  const settlement = db.settlements.find((s) => s.driverId === driverId && s.date === date && s.status !== 'rejected')
  const physical = (pid: ID) => settlement?.rows.find((r) => r.productId === pid)?.physical
  const fleet = useMemo(
    () => db.drivers.map((d) => ({ d, kg: round2(Object.values(vanStockByProduct(db, d.id)).reduce((s, v) => s + v, 0)), v: db.vehicles.find((x) => x.id === d.vehicleId) })).filter((x) => x.kg > 0),
    [db],
  )
  const canAct = date === today && !settlement && !!calc && calc.closingKg > 0
  const driver = db.drivers.find((d) => d.id === driverId)

  return (
    <div className="space-y-5">
      <Panel title="Stock on vans right now" icon={Truck} bodyClassName="p-3">
        {fleet.length === 0 ? (
          <p className="px-1 text-[13px] text-muted-foreground">{t('All vans are empty.')}</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {fleet.map(({ d, kg, v }) => (
              <button key={d.id} onClick={() => set({ driver: d.id })} className={cn('rounded-lg border px-3 py-2 text-start transition-colors hover:border-brand/50', d.id === driverId && 'border-brand bg-brand-soft')}>
                <div className="text-[12.5px] font-semibold">{name(d)}</div>
                <div className="text-[11.5px] text-muted-foreground">{v?.plateNo} · <span className="font-medium text-foreground tabular">{fmtKg(kg)}</span></div>
              </button>
            ))}
          </div>
        )}
      </Panel>

      <div className="flex flex-wrap items-end gap-3">
        <Field label="Driver" className="w-64">
          <Picker value={driverId} onChange={(v) => set({ driver: v })} options={db.drivers.map((d) => ({ value: d.id, label: name(d) }))} placeholder="Select driver" />
        </Field>
        <div className="ms-auto flex flex-wrap gap-2">
          <Button variant="outline" disabled={!canAct} onClick={() => ret.open(true)}><Warehouse /> {t('Return stock to warehouse')}</Button>
          <Button variant="outline" disabled={!canAct} onClick={() => loss.open(true)}><PackageMinus /> {t('Record loss')}</Button>
        </div>
      </div>

      {!calc || calc.rows.length === 0 ? (
        <EmptyState icon={Scale} title="No van activity for this driver on this day" description="Loads, deliveries, van sales, returns and losses appear here once recorded." />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
            <Stat label="Opening" value={fmtKg(calc.openingKg)} />
            <Stat label="+ Loaded" value={fmtKg(calc.loadedKg)} tone="brand" />
            <Stat label="+ Customer returns" value={fmtKg(calc.customerReturnsKg)} />
            <Stat label="- Delivered / sold" value={fmtKg(calc.deliveredKg)} />
            <Stat label="- Returned to WH" value={fmtKg(calc.returnedKg)} />
            <Stat label="- Recorded loss" value={fmtKg(calc.lossKg)} tone={calc.lossKg ? 'danger' : undefined} />
            <Stat label="= Closing" value={fmtKg(calc.closingKg)} tone="brand" />
          </div>
          <Card className="gap-0 overflow-hidden p-0">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
              <div>
                <h3 className="text-[14px] font-semibold text-brand-ink">{t('Stock reconciliation')} · {name(driver)} · {fmtDate(date)}</h3>
                <p className="text-xs text-muted-foreground">{t('Opening + Loaded + Customer returns - Delivered/Sold - Returned to warehouse - Loss = Closing')}</p>
              </div>
              {settlement ? <StatusBadge status={settlement.status} label={`${settlement.settlementNo} · ${t(settlement.status)}`} /> : date === today ? <StatusBadge status="pending" label={t('Not yet settled')} /> : null}
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    {['Product', 'Opening', 'Loaded', 'Cust. returns', 'Delivered / sold', 'Returned to WH', 'Loss', 'Closing', ...(settlement ? ['Physical', 'Discrepancy'] : [])].map((h, i) => (
                      <TableHead key={h} className={cn(i > 0 && 'text-end')}>{t(h)}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {calc.rows.map((r) => {
                    const ph = physical(r.productId)
                    const diff = ph !== undefined ? round2(ph - r.closing) : 0
                    return (
                      <TableRow key={r.productId} className={cn(Math.abs(diff) > 0.01 && 'bg-danger-soft/50')}>
                        <TableCell className="font-medium">{name(db.products.find((p) => p.id === r.productId))}</TableCell>
                        {[r.opening, r.loaded, r.customerReturns, r.delivered, r.returnedToWH, r.loss].map((x, i) => (
                          <TableCell key={i} className={cn('text-end tabular', !x && 'text-muted-foreground')}>{fmtNum(x, 1)}</TableCell>
                        ))}
                        <TableCell className={cn('text-end font-semibold tabular', r.closing < -0.001 && 'text-danger')}>{fmtNum(r.closing, 1)}</TableCell>
                        {settlement && <TableCell className="text-end tabular">{fmtNum(ph ?? r.closing, 1)}</TableCell>}
                        {settlement && (
                          <TableCell className={cn('text-end font-semibold tabular', diff < 0 ? 'text-danger' : diff > 0 ? 'text-warning' : 'text-success')}>
                            {Math.abs(diff) > 0.01 ? (diff > 0 ? '+' : '') + fmtNum(diff, 1) : <CheckCircle2 className="ms-auto size-4" />}
                          </TableCell>
                        )}
                      </TableRow>
                    )
                  })}
                </TableBody>
                <TableBody>
                  <TableRow className="bg-muted/40 font-semibold">
                    <TableCell>{t('Total')}</TableCell>
                    {[calc.openingKg, calc.loadedKg, calc.customerReturnsKg, calc.deliveredKg, calc.returnedKg, calc.lossKg, calc.closingKg].map((x, i) => (
                      <TableCell key={i} className="text-end tabular">{fmtNum(x, 1)}</TableCell>
                    ))}
                    {settlement && <TableCell className="text-end tabular">{fmtNum(settlement.physicalKg, 1)}</TableCell>}
                    {settlement && <TableCell className={cn('text-end tabular', Math.abs(settlement.stockDiscrepancyKg) > 0.01 && 'text-danger')}>{fmtNum(settlement.stockDiscrepancyKg, 1)}</TableCell>}
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </Card>
          {settlement && Math.abs(settlement.stockDiscrepancyKg) > 0.01 && (
            <Alert tone="danger" icon={AlertTriangle}>{t('Physical count differs from system closing stock by {kg}. Review before approving the settlement.', { kg: fmtKg(settlement.stockDiscrepancyKg) })}</Alert>
          )}
          {date === today && !settlement && calc.closingKg > 0 && (
            <Alert tone="info" icon={ArrowLeftRight}>{t('{kg} is still on the van. Return it to the warehouse or keep frozen stock on the reefer as tomorrow’s opening stock.', { kg: fmtKg(calc.closingKg) })}</Alert>
          )}
        </>
      )}

      {ret.isOpen && driver && <ReturnToWarehouseDialog driverId={driver.id} onOpenChange={ret.onOpenChange} />}
      {loss.isOpen && driver && <LossDialog driverId={driver.id} onOpenChange={loss.onOpenChange} />}
    </div>
  )
}

function ReturnToWarehouseDialog({ driverId, onOpenChange }: { driverId: ID; onOpenChange: (o: boolean) => void }) {
  const t = useT()
  const name = useName()
  const act = useAction()
  const db = useStore((s) => s.db)
  const d = db.drivers.find((x) => x.id === driverId)!
  const van = useMemo(() => vanStockByProduct(db, driverId), [db, driverId])
  const [wh, setWh] = useState<ID>(d.warehouseId)
  const [qty, setQty] = useState<Record<ID, number>>({})
  useEffect(() => { setQty({}) }, [driverId])
  const lines = Object.entries(qty).filter(([, q]) => q > 0).map(([productId, qtyKg]) => ({ productId, qtyKg }))
  const total = round2(lines.reduce((s, l) => s + l.qtyKg, 0))
  const submit = () => {
    const r = act((x, ctx) => L.returnToWarehouse(x, ctx, { driverId, warehouseId: wh, date: todayKey(), lines }), () => t('{kg} returned to warehouse', { kg: fmtKg(total) }))
    if (r.ok) onOpenChange(false)
  }
  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader><DialogTitle>{t('Return stock to warehouse')} · {name(d)}</DialogTitle></DialogHeader>
        <Field label="Warehouse"><Picker value={wh} onChange={setWh} options={db.warehouses.map((w) => ({ value: w.id, label: name(w) }))} /></Field>
        <div className="flex justify-end">
          <Button size="sm" variant="secondary" onClick={() => setQty(Object.fromEntries(Object.entries(van).filter(([, q]) => q > 0)))}>{t('Return all')}</Button>
        </div>
        <div className="overflow-hidden rounded-lg border">
          {Object.entries(van).filter(([, q]) => q > 0).map(([pid, q]) => (
            <div key={pid} className="grid grid-cols-[1fr_90px_110px] items-center gap-2 border-b px-3 py-2 text-[13px] last:border-0">
              <span className="truncate font-medium">{name(db.products.find((p) => p.id === pid))}</span>
              <span className="text-end text-[12px] text-muted-foreground tabular">{t('On van')} {fmtNum(q, 1)}</span>
              <NumInput value={qty[pid] ?? 0} onChange={(v) => setQty((s) => ({ ...s, [pid]: Math.max(0, Math.min(v, q)) }))} aria-label="KG" />
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t('Cancel')}</Button>
          <Button disabled={!total} onClick={submit}>{t('Return {kg}', { kg: fmtKg(total) })}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

const LOSS_REASONS = ['Spoilage - reefer temperature failure', 'Packaging damage in transit', 'Weight loss (drip / thaw)', 'Theft / missing cartons', 'Other']
function LossDialog({ driverId, onOpenChange }: { driverId: ID; onOpenChange: (o: boolean) => void }) {
  const t = useT()
  const name = useName()
  const act = useAction()
  const db = useStore((s) => s.db)
  const van = useMemo(() => vanStockByProduct(db, driverId), [db, driverId])
  const [pid, setPid] = useState<ID>('')
  const [kg, setKg] = useState(0)
  const [reason, setReason] = useState('')
  const [note, setNote] = useState('')
  const max = van[pid] ?? 0
  const submit = () => {
    const r = act((x, ctx) => L.recordVanLoss(x, ctx, { driverId, productId: pid, qtyKg: kg, reason: note ? `${reason} - ${note}` : reason, date: todayKey() }), 'Van stock loss recorded')
    if (r.ok) onOpenChange(false)
  }
  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>{t('Record van stock loss')}</DialogTitle></DialogHeader>
        <Field label="Product" required>
          <Picker value={pid} onChange={(v) => { setPid(v); setKg(0) }} options={Object.entries(van).filter(([, q]) => q > 0).map(([id, q]) => ({ value: id, label: `${name(db.products.find((p) => p.id === id))} · ${fmtNum(q, 1)} kg` }))} placeholder="Select product" />
        </Field>
        <Field label="Loss (KG)" required hint={pid ? t('Max {kg}', { kg: fmtKg(max) }) : undefined}>
          <NumInput value={kg} onChange={(v) => setKg(Math.max(0, Math.min(v, max)))} disabled={!pid} />
        </Field>
        <Field label="Reason" required><Picker value={reason} onChange={setReason} options={LOSS_REASONS.map((r) => ({ value: r, label: r }))} placeholder="Select a reason" /></Field>
        <Field label="Notes"><Input value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t('Cancel')}</Button>
          <Button variant="destructive" disabled={!pid || kg <= 0 || !reason} onClick={submit}>{t('Record loss')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
