/**
 * Walk-in Counter (POS): weigh, bill and collect payment from retail walk-in customers.
 * Each sale posts a cash invoice to the "Walk-in Customer" account (stock leaves the counter
 * warehouse first-expiry-first-out) and the payment in one atomic transaction.
 * Desktop: product grid + cart side panel. Phones: product grid + floating cart sheet.
 */
import { useMemo, useState } from 'react'
import { Banknote, CreditCard, Landmark, Minus, Plus, Printer, Receipt, Search, ShoppingBasket, Trash2, X } from 'lucide-react'
import type { ID, Product } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { EmptyState, PageHeader, Picker, PrintDialog, newIdemKey, useAction, useDialog } from '@/components/common'
import { InvoiceDoc } from '@/components/docs'
import { useStore } from '@/store/useStore'
import { useT, useName } from '@/i18n'
import * as L from '@/store/logic'
import { invoiceTotals, sellableStock } from '@/store/derive'
import { fmtKg, fmtNum, fmtSAR, fmtTime, round2, todayKey } from '@/lib/format'
import { cn } from '@/lib/utils'

const WALK_IN = 'cus_walkin'
type Method = 'cash' | 'card' | 'bank'
interface Line { productId: ID; qtyKg: number; price: number }

export default function PosPage() {
  const t = useT()
  const name = useName()
  const act = useAction()
  const db = useStore((s) => s.db)
  const today = todayKey()
  const [warehouseId, setWarehouseId] = useState('wh_1')
  const [q, setQ] = useState('')
  const [species, setSpecies] = useState<'all' | 'chicken' | 'mutton'>('all')
  const [cart, setCart] = useState<Line[]>([])
  const [method, setMethod] = useState<Method>('cash')
  const [tendered, setTendered] = useState(0)
  const [custName, setCustName] = useState('')
  const [custPhone, setCustPhone] = useState('')
  const [idem, setIdem] = useState(newIdemKey)
  const [busy, setBusy] = useState(false)
  const [cartOpen, setCartOpen] = useState(false)
  const receipt = useDialog<ID>()

  const avail = useMemo(() => Object.fromEntries(db.products.map((p) => [p.id, sellableStock(db, p.id, warehouseId, today)])), [db, warehouseId, today])
  const products = db.products.filter((p) => p.active && (species === 'all' || p.species === species) && (!q || `${p.name} ${p.nameAr} ${p.code}`.toLowerCase().includes(q.toLowerCase())))
  const totals = invoiceTotals(cart, db.settings.vatRate)
  const kg = round2(cart.reduce((s, l) => s + l.qtyKg, 0))
  const change = method === 'cash' ? round2(tendered - totals.total) : 0
  const todaysSales = db.invoices.filter((i) => i.customerId === WALK_IN && i.date === today && i.status !== 'void').sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const todaysTotal = todaysSales.reduce((s, i) => s + i.total, 0)

  const add = (p: Product, kgToAdd = 1) =>
    setCart((c) => {
      const ex = c.find((l) => l.productId === p.id)
      const max = avail[p.id] ?? 0
      if (ex) return c.map((l) => (l.productId === p.id ? { ...l, qtyKg: round2(Math.min(max, l.qtyKg + kgToAdd)) } : l))
      return max > 0 ? [...c, { productId: p.id, qtyKg: round2(Math.min(max, kgToAdd)), price: p.sellPrice }] : c
    })
  const setQty = (id: ID, v: number) => setCart((c) => c.map((l) => (l.productId === id ? { ...l, qtyKg: round2(Math.max(0, Math.min(avail[id] ?? 0, v))) } : l)))
  const remove = (id: ID) => setCart((c) => c.filter((l) => l.productId !== id))
  const reset = () => {
    setCart([])
    setTendered(0)
    setCustName('')
    setCustPhone('')
    setMethod('cash')
    setIdem(newIdemKey())
  }

  const charge = () => {
    if (busy) return
    const lines = cart.filter((l) => l.qtyKg > 0)
    if (!lines.length) return
    if (method === 'cash' && tendered > 0 && tendered < totals.total) return
    setBusy(true)
    const note = ['Walk-in counter sale', custName.trim(), custPhone.trim()].filter(Boolean).join(' · ')
    const r = act((d, ctx) => {
      const inv = L.directInvoice(d, ctx, { customerId: WALK_IN, warehouseId, date: today, paymentType: 'cash', lines, notes: note })
      if (!inv.ok) return inv
      const i = d.invoices.find((x) => x.id === inv.id)!
      const pay = L.recordPayment(d, ctx, {
        customerId: WALK_IN, date: today, method: method === 'cash' ? 'cash' : 'bank', bankRef: method === 'cash' ? undefined : `${method === 'card' ? 'MADA' : 'TRF'}-${i.invNo}`,
        amount: i.total, allocations: [{ invoiceId: i.id, amount: i.total }], allowRepeat: true, idempotencyKey: idem,
        notes: method === 'card' ? 'Card (Mada) at counter' : method === 'bank' ? 'Bank transfer at counter' : 'Cash at counter',
      })
      if (!pay.ok) return pay
      return { ok: true as const, id: i.id }
    }, (x) => t('Sale completed · {total}', { total: fmtSAR(totals.total) }))
    setBusy(false)
    if (r.ok && r.id) {
      receipt.open(r.id)
      reset()
      setCartOpen(false)
    }
  }

  const cartPanel = (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2 font-semibold"><ShoppingBasket className="size-4 text-brand" /> {t('Current sale')}</div>
        {cart.length > 0 && <Button size="sm" variant="ghost" className="text-danger" onClick={reset}><X /> {t('Clear')}</Button>}
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto p-3">
        {cart.length === 0 && <EmptyState icon={ShoppingBasket} title="No items yet" description="Tap a product to add it. Adjust the weight in KG." className="border-0 bg-transparent" />}
        {cart.map((l) => {
          const p = db.products.find((x) => x.id === l.productId)!
          return (
            <div key={l.productId} className="rounded-xl border bg-card p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-[13px] font-semibold">{name(p)}</div>
                  <div className="text-[11.5px] text-muted-foreground">{fmtSAR(l.price)} / kg · {t('max')} {fmtNum(avail[p.id] ?? 0, 1)} kg</div>
                </div>
                <button onClick={() => remove(l.productId)} className="rounded p-1 text-muted-foreground hover:text-danger" aria-label={t('Remove')}><Trash2 className="size-4" /></button>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <Button size="icon-sm" variant="outline" onClick={() => setQty(l.productId, l.qtyKg - 0.5)} aria-label="-0.5 kg"><Minus /></Button>
                <div className="relative w-24">
                  <Input type="number" inputMode="decimal" step="0.05" value={l.qtyKg} onChange={(e) => setQty(l.productId, Number(e.target.value))} onFocus={(e) => e.target.select()} className="h-8 pe-8 text-center font-semibold tabular" />
                  <span className="absolute end-2 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground">kg</span>
                </div>
                <Button size="icon-sm" variant="outline" onClick={() => setQty(l.productId, l.qtyKg + 0.5)} aria-label="+0.5 kg"><Plus /></Button>
                <div className="ms-auto text-end text-[14px] font-bold tabular">{fmtSAR(round2(l.qtyKg * l.price))}</div>
              </div>
            </div>
          )
        })}
      </div>
      <div className="space-y-3 border-t bg-muted/30 p-4">
        <div className="grid grid-cols-2 gap-2">
          <Input value={custName} onChange={(e) => setCustName(e.target.value)} placeholder={t('Customer name (optional)')} className="h-9" />
          <Input value={custPhone} onChange={(e) => setCustPhone(e.target.value)} placeholder={t('Mobile (optional)')} inputMode="tel" className="h-9" />
        </div>
        <div className="space-y-1 text-[13px]">
          <Row label={`${t('Weight')}`} value={fmtKg(kg, 2)} />
          <Row label={t('Subtotal')} value={fmtSAR(totals.subtotal)} />
          <Row label={`${t('VAT')} ${db.settings.vatRate}%`} value={fmtSAR(totals.vat)} />
          <div className="flex items-center justify-between border-t pt-2 text-[18px] font-bold"><span>{t('Total')}</span><span className="tabular text-brand">{fmtSAR(totals.total)}</span></div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {([['cash', 'Cash', Banknote], ['card', 'Card (Mada)', CreditCard], ['bank', 'Bank transfer', Landmark]] as const).map(([k, label, I]) => (
            <button key={k} onClick={() => setMethod(k)} className={cn('flex flex-col items-center gap-1 rounded-xl border bg-card px-2 py-2 text-[11.5px] font-semibold transition-colors', method === k ? 'border-brand bg-brand-soft text-brand' : 'text-muted-foreground hover:bg-muted')}>
              <I className="size-[18px]" /> {t(label)}
            </button>
          ))}
        </div>
        {method === 'cash' && (
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Input type="number" inputMode="decimal" value={tendered || ''} onChange={(e) => setTendered(Number(e.target.value))} placeholder={t('Cash received')} className="h-10 tabular" />
            </div>
            {[50, 100, 200, 500].map((v) => (
              <button key={v} onClick={() => setTendered(v)} className="hidden h-10 rounded-lg border bg-card px-2 text-[12px] font-semibold hover:bg-muted sm:block">{v}</button>
            ))}
          </div>
        )}
        {method === 'cash' && tendered > 0 && (
          <div className={cn('flex justify-between rounded-lg px-3 py-2 text-[13.5px] font-semibold', change < 0 ? 'bg-danger-soft text-danger' : 'bg-success-soft text-success')}>
            <span>{change < 0 ? t('Short') : t('Change to return')}</span>
            <span className="tabular">{fmtSAR(Math.abs(change))}</span>
          </div>
        )}
        <Button className="h-12 w-full text-[15px]" disabled={!cart.some((l) => l.qtyKg > 0) || busy || (method === 'cash' && tendered > 0 && change < 0)} onClick={charge}>
          <Receipt /> {t('Charge {total}', { total: fmtSAR(totals.total) })}
        </Button>
      </div>
    </div>
  )

  return (
    <div className="pb-24 lg:pb-0">
      <PageHeader
        title="Walk-in Counter"
        description="Weigh, bill and collect payment from walk-in customers. Stock leaves the counter warehouse first-expiry-first-out."
        icon={ShoppingBasket}
        actions={
          <div className="flex items-center gap-2">
            <Picker value={warehouseId} onChange={(v) => { setWarehouseId(v); setCart([]) }} options={db.warehouses.map((w) => ({ value: w.id, label: name(w) }))} className="h-9 min-w-48" />
          </div>
        }
      />
      <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-0 flex-1">
              <Search className="absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('Search products…')} className="h-10 ps-9" />
            </div>
            <div className="flex rounded-lg border bg-card p-0.5">
              {(['all', 'chicken', 'mutton'] as const).map((s) => (
                <button key={s} onClick={() => setSpecies(s)} className={cn('rounded-md px-3 py-1.5 text-[12.5px] font-semibold', species === s ? (s === 'mutton' ? 'bg-maroon text-white' : 'bg-brand text-white') : 'text-muted-foreground')}>
                  {t(s === 'all' ? 'All' : s === 'chicken' ? 'Chicken' : 'Mutton')}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-4">
            {products.map((p) => {
              const a = avail[p.id] ?? 0
              const inCart = cart.find((l) => l.productId === p.id)
              return (
                <button
                  key={p.id}
                  onClick={() => add(p)}
                  disabled={a <= 0}
                  className={cn('relative flex min-h-[124px] flex-col rounded-xl border bg-card p-3 text-start transition-all hover:border-brand/50 hover:shadow-sm active:scale-[0.98] disabled:opacity-45', inCart && 'border-brand ring-2 ring-brand/15')}
                >
                  <span className={cn('mb-1.5 inline-flex w-fit items-center gap-1 rounded-full px-1.5 text-[10.5px] font-semibold', p.species === 'mutton' ? 'bg-maroon-soft text-maroon' : 'bg-brand-soft text-brand')}>
                    {t(p.species === 'mutton' ? 'Mutton' : 'Chicken')} · {t(p.category === 'fresh' ? 'Fresh' : p.category === 'chilled' ? 'Chilled' : 'Frozen')}
                  </span>
                  <span className="line-clamp-2 text-[13px] leading-snug font-semibold">{name(p)}</span>
                  <span className="mt-auto flex items-end justify-between gap-1 pt-2">
                    <span className="text-[15px] font-bold text-brand-ink tabular">{fmtSAR(p.sellPrice)}<span className="text-[10.5px] font-medium text-muted-foreground">/kg</span></span>
                    <span className={cn('text-[10.5px] tabular', a < 20 ? 'text-warning' : 'text-muted-foreground')}>{fmtNum(a, 0)} kg</span>
                  </span>
                  {inCart && <span className="absolute top-2 end-2 rounded-full bg-brand px-1.5 text-[10.5px] leading-5 font-bold text-white">{fmtNum(inCart.qtyKg, 1)} kg</span>}
                </button>
              )
            })}
          </div>
          {products.length === 0 && <EmptyState icon={Search} title="No products match" />}

          <div className="rounded-xl border bg-card">
            <div className="flex items-center justify-between border-b px-4 py-2.5">
              <span className="text-[13.5px] font-semibold">{t("Today's counter sales")}</span>
              <span className="text-[12.5px] text-muted-foreground">{todaysSales.length} · <span className="font-semibold text-foreground">{fmtSAR(todaysTotal)}</span></span>
            </div>
            {todaysSales.length ? (
              <div className="divide-y">
                {todaysSales.slice(0, 8).map((i) => (
                  <button key={i.id} onClick={() => receipt.open(i.id)} className="flex w-full items-center justify-between gap-2 px-4 py-2.5 text-start text-[13px] hover:bg-muted/50">
                    <span className="min-w-0">
                      <span className="block font-medium">{i.invNo}</span>
                      <span className="block truncate text-[11.5px] text-muted-foreground">{fmtTime(i.createdAt)} · {i.lines.length} {t('items')} · {fmtKg(i.lines.reduce((s, l) => s + l.qtyKg, 0), 1)}</span>
                    </span>
                    <span className="flex items-center gap-2 font-semibold tabular">{fmtSAR(i.total)} <Printer className="size-3.5 text-muted-foreground" /></span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="px-4 py-6 text-center text-[12.5px] text-muted-foreground">{t('No counter sales yet today')}</p>
            )}
          </div>
        </div>

        {/* desktop cart */}
        <div className="hidden lg:block">
          <div className="sticky top-20 h-[calc(100dvh-6.5rem)] overflow-hidden rounded-xl border bg-card">{cartPanel}</div>
        </div>
      </div>

      {/* phones: floating cart bar above the tab bar */}
      <div className="fixed inset-x-3 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-30 lg:hidden">
        <button onClick={() => setCartOpen(true)} className="flex w-full items-center gap-3 rounded-2xl bg-navy px-4 py-3 text-start text-white shadow-xl">
          <span className="relative flex size-10 items-center justify-center rounded-xl bg-white/10">
            <ShoppingBasket className="size-5" />
            {cart.length > 0 && <span className="absolute -top-1 -end-1 rounded-full bg-red px-1.5 text-[10px] leading-4 font-bold">{cart.length}</span>}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[12px] text-sidebar-muted">{cart.length ? `${cart.length} ${t('items')} · ${fmtKg(kg, 1)}` : t('Cart is empty')}</span>
            <span className="block text-[16px] font-bold tabular">{fmtSAR(totals.total)}</span>
          </span>
          <span className="rounded-xl bg-brand px-4 py-2 text-[13px] font-semibold">{t('Checkout')}</span>
        </button>
      </div>
      <Sheet open={cartOpen} onOpenChange={setCartOpen}>
        <SheetContent side="bottom" className="h-[90dvh] p-0">
          <SheetTitle className="sr-only">{t('Current sale')}</SheetTitle>
          {cartPanel}
        </SheetContent>
      </Sheet>

      <PrintDialog open={receipt.isOpen} onOpenChange={receipt.onOpenChange} title="Tax Invoice">
        {receipt.value && <InvoiceDoc invoiceId={receipt.value} />}
      </PrintDialog>
    </div>
  )
}

const Row = ({ label, value }: { label: string; value: string }) => (
  <div className="flex justify-between text-muted-foreground"><span>{label}</span><span className="text-foreground tabular">{value}</span></div>
)
