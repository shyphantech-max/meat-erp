import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AlertOctagon, FileText, PackageOpen, Truck } from 'lucide-react'
import type { ID } from '@/types'
import * as L from '@/store/logic'
import { useT, useName } from '@/i18n'
import { fmtKg, fmtNum, fmtTime } from '@/lib/format'
import { cn } from '@/lib/utils'
import { MeterBar, Picker, PrintDialog, useAction, useDialog } from '@/components/common'
import { LoadingSlipDoc } from '@/components/docs'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { useDriverDay } from '../useDriverDay'
import { BigButton, Chip, QtyStepper, Screen, SectionTitle } from '../ui'

const LOSS_REASONS = ['Damaged in transit', 'Thawed / temperature breach', 'Packaging torn', 'Weight loss (drip)', 'Spoiled']

export default function Stock() {
  const t = useT()
  const name = useName()
  const [sp, setSp] = useSearchParams()
  const d = useDriverDay()
  const slip = useDialog<ID>()
  const action = sp.get('action')
  const [sheet, setSheet] = useState<'return' | 'loss' | null>(action === 'return' || action === 'loss' ? action : null)
  useEffect(() => {
    if (action === 'return' || action === 'loss') setSheet(action)
  }, [action])
  const items = Object.entries(d.van).filter(([, q]) => q > 0)
  const cap = d.vehicle?.capacityKg ?? 0
  const close = () => {
    setSheet(null)
    if (sp.get('action')) setSp({}, { replace: true })
  }
  return (
    <Screen title="Van stock" back="/driver">
      <div className="rounded-2xl bg-navy p-4 text-white">
        <div className="flex items-end justify-between">
          <div>
            <div className="text-[12px] text-sidebar-muted">{t('On van now')}</div>
            <div className="text-[26px] font-bold tabular">{fmtKg(d.vanKg, 0)}</div>
          </div>
          <div className="text-end text-[12px] text-sidebar-muted">
            {t('Loaded today')}<div className="text-[15px] font-semibold text-white tabular">{fmtKg(d.loadedKg, 0)}</div>
          </div>
        </div>
        <MeterBar value={d.vanKg} max={cap} className="mt-3 [&>div]:bg-white/15" />
        <div className="mt-1 text-[11px] text-sidebar-muted">{t('Capacity')} {fmtKg(cap, 0)} · {d.vehicle?.plateNo}</div>
      </div>

      <SectionTitle>{t('Products on van')}</SectionTitle>
      {items.length === 0 && <p className="rounded-xl border border-dashed p-5 text-center text-[13px] text-muted-foreground">{t('Your van is empty.')}</p>}
      <div className="space-y-2">
        {items.map(([pid, q]) => {
          const p = d.db.products.find((x) => x.id === pid)!
          return (
            <div key={pid} className="flex items-center gap-3 rounded-2xl border bg-card p-3.5">
              <span className={cn('size-2.5 shrink-0 rounded-full', p.category === 'frozen' ? 'bg-info' : p.category === 'chilled' ? 'bg-brand' : 'bg-warning')} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] font-semibold">{name(p)}</span>
                <span className="text-[12px] text-muted-foreground">{t(p.category === 'frozen' ? 'Frozen' : p.category === 'chilled' ? 'Chilled' : 'Fresh')} · {fmtNum(q / p.cartonKg, 1)} {t(p.packLabel)}</span>
              </span>
              <span className="text-[17px] font-bold tabular">{fmtKg(q)}</span>
            </div>
          )
        })}
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <BigButton variant="outline" icon={PackageOpen} disabled={!items.length} onClick={() => setSheet('return')}>{t('Return to warehouse')}</BigButton>
        <BigButton variant="outline" icon={AlertOctagon} disabled={!items.length} className="text-danger" onClick={() => setSheet('loss')}>{t('Record loss')}</BigButton>
      </div>

      <SectionTitle>{t('Loading slips today')}</SectionTitle>
      {d.loads.length === 0 && <p className="text-center text-[13px] text-muted-foreground">{t('No stock loaded today')}</p>}
      {d.loads.map((l) => (
        <button key={l.id} onClick={() => slip.open(l.id)} className="flex w-full items-center gap-3 rounded-2xl border bg-card p-3.5 text-start active:bg-muted">
          <Truck className="size-5 text-brand" />
          <span className="min-w-0 flex-1">
            <span className="block text-[14px] font-semibold">{l.slipNo}</span>
            <span className="text-[12px] text-muted-foreground">{fmtTime(l.createdAt)} · {l.lines.length} {t('products')}</span>
          </span>
          <span className="font-bold tabular">{fmtKg(l.lines.reduce((s, x) => s + x.qtyKg, 0), 0)}</span>
          <FileText className="size-4 text-muted-foreground" />
        </button>
      ))}

      <PrintDialog open={slip.isOpen} onOpenChange={slip.onOpenChange} title="Van Loading Slip">{slip.value && <LoadingSlipDoc loadId={slip.value} />}</PrintDialog>
      <ReturnSheet open={sheet === 'return'} onClose={close} />
      <LossSheet open={sheet === 'loss'} onClose={close} />
    </Screen>
  )
}

function ReturnSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT()
  const name = useName()
  const act = useAction()
  const d = useDriverDay()
  const [qty, setQty] = useState<Record<ID, number>>({})
  const [wh, setWh] = useState<ID>(d.driver?.warehouseId ?? '')
  useEffect(() => {
    if (open) setQty({ ...d.van })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])
  const save = () => {
    const r = act((db, ctx) => L.returnToWarehouse(db, ctx, { driverId: d.driverId, warehouseId: wh, date: d.today, lines: Object.entries(qty).map(([productId, qtyKg]) => ({ productId, qtyKg })) }), 'Stock returned to warehouse')
    if (r.ok) onClose()
  }
  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="bottom" className="mx-auto max-w-[430px]">
        <SheetHeader><SheetTitle>{t('Return stock to warehouse')}</SheetTitle></SheetHeader>
        <div className="space-y-3 overflow-y-auto p-4">
          <Picker value={wh} onChange={setWh} className="h-12" options={d.db.warehouses.map((w) => ({ value: w.id, label: name(w) }))} />
          {Object.entries(d.van).filter(([, q]) => q > 0).map(([pid, have]) => {
            const p = d.db.products.find((x) => x.id === pid)!
            return (
              <div key={pid}>
                <div className="mb-1 flex justify-between text-[13px]"><span className="font-medium">{name(p)}</span><span className="text-muted-foreground">{t('On van')} {fmtKg(have)}</span></div>
                <QtyStepper value={qty[pid] ?? 0} onChange={(v) => setQty({ ...qty, [pid]: v })} step={p.cartonKg} max={have} />
              </div>
            )
          })}
          <BigButton icon={PackageOpen} disabled={!Object.values(qty).some((v) => v > 0) || !wh} onClick={save}>
            {t('Return {kg}', { kg: fmtKg(Object.values(qty).reduce((s, v) => s + v, 0)) })}
          </BigButton>
        </div>
      </SheetContent>
    </Sheet>
  )
}

function LossSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT()
  const name = useName()
  const act = useAction()
  const d = useDriverDay()
  const [pid, setPid] = useState<ID>('')
  const [qty, setQty] = useState(0)
  const [reason, setReason] = useState('')
  useEffect(() => {
    if (open) { setPid(''); setQty(0); setReason('') }
  }, [open])
  const have = pid ? (d.van[pid] ?? 0) : 0
  const save = () => {
    const r = act((db, ctx) => L.recordVanLoss(db, ctx, { driverId: d.driverId, productId: pid, qtyKg: qty, reason, date: d.today }), 'Loss recorded')
    if (r.ok) onClose()
  }
  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="bottom" className="mx-auto max-w-[430px]">
        <SheetHeader><SheetTitle>{t('Record stock loss')}</SheetTitle></SheetHeader>
        <div className="space-y-3 overflow-y-auto p-4">
          <Picker value={pid} onChange={setPid} placeholder="Select product" className="h-12" options={Object.entries(d.van).filter(([, q]) => q > 0).map(([id, q]) => ({ value: id, label: `${name(d.db.products.find((p) => p.id === id))} · ${fmtKg(q)}` }))} />
          {pid && <QtyStepper value={qty} onChange={setQty} step={1} max={have} />}
          <div className="flex flex-wrap gap-2">{LOSS_REASONS.map((r) => <Chip key={r} tone="danger" active={reason === r} onClick={() => setReason(r)}>{t(r)}</Chip>)}</div>
          <BigButton variant="destructive" icon={AlertOctagon} disabled={!pid || qty <= 0 || !reason} onClick={save}>{t('Save loss')}</BigButton>
        </div>
      </SheetContent>
    </Sheet>
  )
}
