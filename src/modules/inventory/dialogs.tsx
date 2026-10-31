/** Inventory dialogs: warehouse transfer, damaged/expired write-off, product master form. */
import { useEffect, useMemo, useState } from 'react'
import type { Batch, ID, Product, Species, StorageCategory } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Switch } from '@/components/ui/switch'
import { Alert, Field, NumInput, Picker, StatusBadge, useAction } from '@/components/common'
import { useStore } from '@/store/useStore'
import { useT, useName } from '@/i18n'
import * as L from '@/store/logic'
import { batchState, sellableStock } from '@/store/derive'
import { daysBetween, fmtDate, fmtKg, fmtNum, todayKey } from '@/lib/format'

export function TransferDialog({ open, onOpenChange, productId }: { open: boolean; onOpenChange: (o: boolean) => void; productId?: ID }) {
  const t = useT()
  const name = useName()
  const act = useAction()
  const db = useStore((s) => s.db)
  const [form, setForm] = useState({ productId: productId ?? '', fromWh: 'wh_1', toWh: 'wh_3', qtyKg: 0, note: '' })
  const [err, setErr] = useState<Record<string, string>>({})
  useEffect(() => {
    if (open) {
      setForm((f) => ({ ...f, productId: productId ?? f.productId, qtyKg: 0, note: '' }))
      setErr({})
    }
  }, [open, productId])
  const avail = form.productId ? sellableStock(db, form.productId, form.fromWh, todayKey()) : 0
  const submit = () => {
    const e: Record<string, string> = {}
    if (!form.productId) e.productId = 'Select a product'
    if (form.fromWh === form.toWh) e.toWh = 'Source and destination warehouses must differ'
    if (!(form.qtyKg > 0)) e.qtyKg = 'Enter a quantity'
    else if (form.qtyKg > avail + 0.001) e.qtyKg = t('Only {n} kg available', { n: fmtNum(avail, 1) })
    setErr(e)
    if (Object.keys(e).length) return
    const r = act((d, ctx) => L.transferStock(d, ctx, { ...form, date: todayKey() }), 'Stock transferred')
    if (r.ok) onOpenChange(false)
  }
  const whOpts = db.warehouses.map((w) => ({ value: w.id, label: name(w) }))
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('Warehouse transfer')}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <Field label="Product" required error={err.productId}>
            <Picker value={form.productId} onChange={(v) => setForm({ ...form, productId: v })} options={db.products.map((p) => ({ value: p.id, label: `${p.code} · ${name(p)}` }))} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="From warehouse" required>
              <Picker value={form.fromWh} onChange={(v) => setForm({ ...form, fromWh: v })} options={whOpts} />
            </Field>
            <Field label="To warehouse" required error={err.toWh}>
              <Picker value={form.toWh} onChange={(v) => setForm({ ...form, toWh: v })} options={whOpts} />
            </Field>
          </div>
          <Field label="Qty (KG)" required error={err.qtyKg} hint={form.productId ? t('Sellable at source: {n} kg (FEFO - earliest expiry moves first)', { n: fmtNum(avail, 1) }) : undefined}>
            <NumInput value={form.qtyKg} onChange={(v) => setForm({ ...form, qtyKg: v })} placeholder="0" />
          </Field>
          <Field label="Notes">
            <Input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder={t('e.g. Rebalance stock for Eastern Province')} />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t('Cancel')}</Button>
          <Button onClick={submit}>{t('Transfer stock')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function AdjustDialog({ open, onOpenChange, batchId }: { open: boolean; onOpenChange: (o: boolean) => void; batchId?: ID }) {
  const t = useT()
  const name = useName()
  const act = useAction()
  const db = useStore((s) => s.db)
  const today = todayKey()
  const batches = useMemo(
    () => db.batches.filter((b) => b.qtyKg > 0.0001).sort((a, b) => a.expiryDate.localeCompare(b.expiryDate)),
    [db.batches],
  )
  const [form, setForm] = useState<{ batchId: ID; qtyKg: number; type: 'damage' | 'expired'; reason: string }>({ batchId: '', qtyKg: 0, type: 'damage', reason: '' })
  const [err, setErr] = useState<Record<string, string>>({})
  useEffect(() => {
    if (!open) return
    const preset = batchId ? batches.find((b) => b.id === batchId) : batches.find((b) => b.expiryDate < today)
    const expired = preset ? preset.expiryDate < today : false
    setForm({ batchId: preset?.id ?? '', qtyKg: expired && preset ? preset.qtyKg : 0, type: expired ? 'expired' : 'damage', reason: expired ? t('Expired on {d} - disposal per SFDA procedure', { d: fmtDate(preset!.expiryDate) }) : '' })
    setErr({})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, batchId])
  const b = batches.find((x) => x.id === form.batchId)
  const submit = () => {
    const e: Record<string, string> = {}
    if (!b) e.batchId = 'Select a batch'
    if (!(form.qtyKg > 0)) e.qtyKg = 'Enter the quantity to write off'
    else if (b && form.qtyKg > b.qtyKg + 0.001) e.qtyKg = t('Batch only has {n} kg', { n: fmtNum(b.qtyKg, 1) })
    if (!form.reason.trim()) e.reason = 'Enter a reason'
    setErr(e)
    if (Object.keys(e).length) return
    const r = act((d, ctx) => L.adjustStock(d, ctx, { ...form, date: today }), 'Stock written off')
    if (r.ok) onOpenChange(false)
  }
  const label = (x: Batch) => {
    const p = db.products.find((pp) => pp.id === x.productId)
    const w = db.warehouses.find((ww) => ww.id === x.warehouseId)
    return `${x.batchNo} · ${name(p)} · ${w?.code} · ${fmtKg(x.qtyKg)}${x.expiryDate < today ? ` · ${t('Expired')}` : ''}`
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t('Damaged / expired stock adjustment')}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <Field label="Batch" required error={err.batchId}>
            <Picker value={form.batchId} onChange={(v) => setForm({ ...form, batchId: v, type: (batches.find((x) => x.id === v)?.expiryDate ?? '9') < today ? 'expired' : form.type })} options={batches.map((x) => ({ value: x.id, label: label(x) }))} />
          </Field>
          {b && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg bg-muted/60 px-3 py-2 text-[12.5px]">
              <StatusBadge status={batchState(db, b)} />
              <span>{t('Expiry')}: <b>{fmtDate(b.expiryDate)}</b></span>
              <span className="text-muted-foreground">·</span>
              <span>{t('On hand')}: <b className="tabular">{fmtKg(b.qtyKg)}</b></span>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Adjustment type" required>
              <Picker value={form.type} onChange={(v) => setForm({ ...form, type: v })} options={[{ value: 'damage', label: 'Damaged' }, { value: 'expired', label: 'Expired' }]} />
            </Field>
            <Field label="Qty (KG)" required error={err.qtyKg}>
              <NumInput value={form.qtyKg} onChange={(v) => setForm({ ...form, qtyKg: v })} placeholder="0" />
            </Field>
          </div>
          <Field label="Reason" required error={err.reason}>
            <Input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder={t('e.g. Cartons crushed during unloading')} />
          </Field>
          <Alert tone="info">{t('The quantity is deducted from the batch and recorded in stock movements as a write-off.')}</Alert>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t('Cancel')}</Button>
          <Button variant="destructive" onClick={submit}>{t('Write off stock')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

const emptyProduct = (): Omit<Product, 'id'> => ({
  code: '', name: '', nameAr: '', species: 'chicken', category: 'frozen', cartonKg: 10, packLabel: 'Carton', costPrice: 0, sellPrice: 0, reorderLevelKg: 1000, shelfLifeDays: 365, origin: '', active: true,
})
export function ProductDialog({ open, onOpenChange, product }: { open: boolean; onOpenChange: (o: boolean) => void; product?: Product | null }) {
  const t = useT()
  const act = useAction()
  const products = useStore((s) => s.db.products)
  const [f, setF] = useState<Omit<Product, 'id'> & { id?: ID }>(emptyProduct())
  const [err, setErr] = useState<Record<string, string>>({})
  useEffect(() => {
    if (open) {
      setF(product ? { ...product } : emptyProduct())
      setErr({})
    }
  }, [open, product])
  const set = <K extends keyof Product>(k: K, v: Product[K]) => setF((x) => ({ ...x, [k]: v }))
  const submit = () => {
    const e: Record<string, string> = {}
    if (!f.code.trim()) e.code = 'Code is required'
    else if (products.some((p) => p.code.toLowerCase() === f.code.trim().toLowerCase() && p.id !== f.id)) e.code = 'Code already used by another product'
    if (!f.name.trim()) e.name = 'Name is required'
    if (!(f.cartonKg > 0)) e.cartonKg = 'Must be greater than zero'
    if (!(f.costPrice > 0)) e.costPrice = 'Must be greater than zero'
    if (!(f.sellPrice > 0)) e.sellPrice = 'Must be greater than zero'
    else if (f.sellPrice < f.costPrice) e.sellPrice = 'Selling price is below cost'
    if (!(f.shelfLifeDays > 0)) e.shelfLifeDays = 'Must be greater than zero'
    setErr(e)
    if (Object.keys(e).length) return
    const r = act((d, ctx) => L.upsertMaster<Product>(d, ctx, 'products', { ...f, code: f.code.trim().toUpperCase() }, 'prd'), product ? 'Product updated' : 'Product created')
    if (r.ok) onOpenChange(false)
  }
  const margin = f.sellPrice > 0 ? ((f.sellPrice - f.costPrice) / f.sellPrice) * 100 : 0
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t(product ? 'Edit product' : 'New product')}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Code" required error={err.code}>
            <Input value={f.code} onChange={(e) => set('code', e.target.value)} placeholder="CH-WNG-FRZ" />
          </Field>
          <Field label="Origin">
            <Input value={f.origin} onChange={(e) => set('origin', e.target.value)} placeholder="Brazil" />
          </Field>
          <Field label="Name (English)" required error={err.name}>
            <Input value={f.name} onChange={(e) => set('name', e.target.value)} />
          </Field>
          <Field label="Name (Arabic)">
            <Input dir="rtl" value={f.nameAr} onChange={(e) => set('nameAr', e.target.value)} />
          </Field>
          <Field label="Species" required>
            <Picker<Species> value={f.species} onChange={(v) => set('species', v)} options={[{ value: 'chicken', label: 'Chicken' }, { value: 'mutton', label: 'Mutton' }]} />
          </Field>
          <Field label="Category" required>
            <Picker<StorageCategory> value={f.category} onChange={(v) => set('category', v)} options={[{ value: 'fresh', label: 'Fresh' }, { value: 'chilled', label: 'Chilled' }, { value: 'frozen', label: 'Frozen' }]} />
          </Field>
          <Field label="KG per pack" required error={err.cartonKg}>
            <NumInput value={f.cartonKg} onChange={(v) => set('cartonKg', v)} />
          </Field>
          <Field label="Pack type">
            <Picker value={f.packLabel} onChange={(v) => set('packLabel', v)} options={['Carton', 'Crate', 'Carcass', 'Tray carton'].map((x) => ({ value: x, label: x }))} />
          </Field>
          <Field label="Purchase cost (SAR/kg)" required error={err.costPrice}>
            <NumInput value={f.costPrice} onChange={(v) => set('costPrice', v)} />
          </Field>
          <Field label="Selling price (SAR/kg)" required error={err.sellPrice} hint={f.sellPrice > 0 ? t('Gross margin {n}%', { n: fmtNum(margin, 1) }) : undefined}>
            <NumInput value={f.sellPrice} onChange={(v) => set('sellPrice', v)} />
          </Field>
          <Field label="Reorder level (KG)">
            <NumInput value={f.reorderLevelKg} onChange={(v) => set('reorderLevelKg', v)} />
          </Field>
          <Field label="Shelf life (days)" required error={err.shelfLifeDays}>
            <NumInput value={f.shelfLifeDays} onChange={(v) => set('shelfLifeDays', v)} />
          </Field>
          <label className="flex items-center gap-2 text-[13px] sm:col-span-2">
            <Switch checked={f.active} onCheckedChange={(v) => set('active', v)} /> {t('Active (available for sale and purchase)')}
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t('Cancel')}</Button>
          <Button onClick={submit}>{t('Save')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export const daysLeft = (expiry: string) => daysBetween(todayKey(), expiry)
