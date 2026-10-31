/**
 * Shared building blocks used by every module page. Import from '@/components/common'.
 */
import { Component, useMemo, useRef, useState, type ErrorInfo, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { AlertTriangle, ArrowUpRight, Check, Inbox, Plus, Printer, Trash2, type LucideIcon } from 'lucide-react'
import type { DB, ID, Result, SalesLine } from '@/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { fmtKg, fmtNum, fmtSAR, round2 } from '@/lib/format'
import { useT, tr, useName } from '@/i18n'
import { useStore } from '@/store/useStore'
import type { Ctx } from '@/store/logic'
import { invoiceTotals } from '@/store/derive'
import { printElement } from '@/lib/print'

export { ConfirmProvider, useConfirm } from './ConfirmDialog'

// ───────────── transactions with toasts ─────────────
/**
 * const act = useAction()
 * const r = act((db, ctx) => L.approveGRN(db, ctx, id), 'GRN approved')
 * Shows a success toast (translated) or the validation error; returns the Result.
 */
export function useAction() {
  const run = useStore((s) => s.run)
  return <R extends Result<any>>(fn: (db: DB, ctx: Ctx) => R, success?: string | ((r: R) => string), opts: { silentError?: boolean } = {}): R => {
    const r = run(fn)
    if (r.ok) {
      if (success) toast.success(typeof success === 'function' ? success(r) : tr(success))
    } else if (!opts.silentError) toast.error(tr(r.error))
    return r
  }
}

// ───────────── page scaffolding ─────────────
export function PageHeader({ title, description, actions, icon: Icon, badge }: { title: string; description?: string; actions?: ReactNode; icon?: LucideIcon; badge?: ReactNode }) {
  const t = useT()
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div className="flex min-w-0 items-start gap-3">
        {Icon && (
          <div className="mt-0.5 hidden size-10 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand sm:flex">
            <Icon className="size-5" />
          </div>
        )}
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-[22px] leading-tight font-bold tracking-tight text-brand-ink">{t(title)}</h1>
            {badge}
          </div>
          {description && <p className="mt-1 max-w-3xl text-[13px] text-muted-foreground">{t(description)}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

export function Panel({ title, description, actions, children, className, bodyClassName, icon: Icon }: { title?: ReactNode; description?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; bodyClassName?: string; icon?: LucideIcon }) {
  const t = useT()
  return (
    <Card className={cn('gap-0 overflow-hidden p-0', className)}>
      {(title || actions) && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            {Icon && <Icon className="size-4 text-brand" />}
            <div className="min-w-0">
              {title && <h3 className="truncate text-[14px] font-semibold text-brand-ink">{typeof title === 'string' ? t(title) : title}</h3>}
              {description && <p className="text-xs text-muted-foreground">{typeof description === 'string' ? t(description) : description}</p>}
            </div>
          </div>
          {actions && <div className="flex items-center gap-1.5">{actions}</div>}
        </div>
      )}
      <div className={cn('p-4', bodyClassName)}>{children}</div>
    </Card>
  )
}

export type Tone = 'brand' | 'navy' | 'success' | 'warning' | 'danger' | 'info' | 'neutral'
const toneBox: Record<Tone, string> = {
  brand: 'bg-brand-soft text-brand',
  navy: 'bg-[#e8edf4] text-navy',
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-danger-soft text-danger',
  info: 'bg-info-soft text-info',
  neutral: 'bg-muted text-muted-foreground',
}

export function KpiCard({ label, value, sub, icon: Icon, tone = 'brand', to, className, alert }: { label: string; value: ReactNode; sub?: ReactNode; icon?: LucideIcon; tone?: Tone; to?: string; className?: string; alert?: boolean }) {
  const t = useT()
  const nav = useNavigate()
  return (
    <Card
      onClick={to ? () => nav(to) : undefined}
      className={cn('group relative gap-0 p-4 transition-all', to && 'cursor-pointer hover:border-brand/40 hover:shadow-md', alert && 'border-warning/50', className)}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-[12px] font-medium text-muted-foreground">{t(label)}</p>
        {Icon && (
          <span className={cn('flex size-8 shrink-0 items-center justify-center rounded-lg', toneBox[tone])}>
            <Icon className="size-4" />
          </span>
        )}
      </div>
      <div className="mt-1 text-[22px] leading-tight font-bold tracking-tight text-brand-ink tabular">{value}</div>
      {sub && <div className="mt-1 text-[12px] text-muted-foreground">{sub}</div>}
      {to && <ArrowUpRight className="flip-rtl absolute end-3 bottom-3 size-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />}
    </Card>
  )
}

/** inline mini stat used inside panels / detail pages */
export function Stat({ label, value, tone, className }: { label: string; value: ReactNode; tone?: Tone; className?: string }) {
  const t = useT()
  return (
    <div className={cn('rounded-lg border bg-card px-3 py-2.5', className)}>
      <div className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{t(label)}</div>
      <div className={cn('mt-0.5 text-[15px] font-semibold tabular', tone === 'danger' && 'text-danger', tone === 'success' && 'text-success', tone === 'warning' && 'text-warning', tone === 'brand' && 'text-brand')}>{value}</div>
    </div>
  )
}

// ───────────── status badges ─────────────
const STATUS_TONE: Record<string, Tone> = {
  draft: 'neutral', pending_approval: 'warning', approved: 'success', partially_received: 'info', received: 'success', rejected: 'danger', cancelled: 'neutral',
  unpaid: 'danger', partial: 'warning', paid: 'success', void: 'neutral',
  qc_passed: 'info', booked: 'neutral', in_transit: 'info', arrived_port: 'info', customs_clearance: 'warning', cleared: 'brand', delivered: 'success',
  pending: 'warning', out_for_delivery: 'info', failed: 'danger', open: 'info', assigned: 'navy', partially_delivered: 'warning',
  verified: 'success', submitted: 'warning', under_review: 'info', closed: 'navy',
  on_duty: 'success', off_duty: 'neutral', on_leave: 'warning', active: 'success', maintenance: 'warning', inactive: 'neutral',
  ok: 'success', near_expiry: 'warning', expired: 'danger', low: 'warning', out: 'danger',
  current: 'brand', old_dues: 'navy', mixed: 'info', direct: 'neutral', delivery: 'brand', van_sale: 'info', opening: 'neutral',
  local: 'neutral', international: 'info', cash: 'success', credit: 'navy', bank: 'info',
}
const badgeTone: Record<Tone, string> = {
  brand: 'border-brand/20 bg-brand-soft text-brand',
  navy: 'border-navy/15 bg-[#e8edf4] text-navy',
  success: 'border-success/20 bg-success-soft text-success',
  warning: 'border-warning/25 bg-warning-soft text-warning',
  danger: 'border-danger/20 bg-danger-soft text-danger',
  info: 'border-info/20 bg-info-soft text-info',
  neutral: 'border-border bg-muted text-muted-foreground',
}
export const humanize = (s: string) => s.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase())
export function StatusBadge({ status, label, tone, className }: { status: string; label?: string; tone?: Tone; className?: string }) {
  const t = useT()
  const tt = tone ?? STATUS_TONE[status] ?? 'neutral'
  const text = label ?? (t(status) !== status ? t(status) : t(humanize(status)))
  return (
    <Badge variant="outline" className={cn('font-medium', badgeTone[tt], className)}>
      <span className={cn('size-1.5 rounded-full bg-current opacity-80')} />
      {text}
    </Badge>
  )
}

// ───────────── states ─────────────
export function EmptyState({ icon: Icon = Inbox, title = 'Nothing here yet', description, action, className }: { icon?: LucideIcon; title?: string; description?: string; action?: ReactNode; className?: string }) {
  const t = useT()
  return (
    <div className={cn('flex flex-col items-center justify-center rounded-xl border border-dashed bg-card/50 px-6 py-10 text-center', className)}>
      <div className="mb-3 flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Icon className="size-5" />
      </div>
      <p className="text-sm font-semibold">{t(title)}</p>
      {description && <p className="mt-1 max-w-sm text-xs text-muted-foreground">{t(description)}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
export function LoadingState({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      <Skeleton className="h-9 w-64" />
      {Array.from({ length: rows }).map((_, i) => <Skeleton key={i} className="h-11 w-full" />)}
    </div>
  )
}
export class ErrorBoundary extends Component<{ children: ReactNode }, { error?: Error }> {
  state: { error?: Error } = {}
  static getDerivedStateFromError(error: Error) {
    return { error }
  }
  componentDidCatch(e: Error, info: ErrorInfo) {
    console.error(e, info)
  }
  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="mx-auto mt-16 max-w-md rounded-xl border border-danger/30 bg-danger-soft p-6 text-center">
        <AlertTriangle className="mx-auto size-8 text-danger" />
        <p className="mt-2 font-semibold">{tr('Something went wrong')}</p>
        <p className="mt-1 text-xs text-muted-foreground">{this.state.error.message}</p>
        <Button className="mt-4" variant="outline" onClick={() => this.setState({ error: undefined })}>{tr('Try again')}</Button>
      </div>
    )
  }
}
export function Alert({ tone = 'warning', icon: Icon = AlertTriangle, children, className }: { tone?: Tone; icon?: LucideIcon; children: ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-[13px]', badgeTone[tone], className)}>
      <Icon className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}

// ───────────── values ─────────────
export const Money = ({ value, className, compact }: { value: number; className?: string; compact?: boolean }) => <span className={cn('tabular whitespace-nowrap', className)}>{fmtSAR(value, { compact })}</span>
export const Kg = ({ value, className, d = 1 }: { value: number; className?: string; d?: number }) => <span className={cn('tabular whitespace-nowrap', className)}>{fmtKg(value, d)}</span>
export function EntityLink({ to, children, className }: { to: string; children: ReactNode; className?: string }) {
  return (
    <Link to={to} onClick={(e) => e.stopPropagation()} className={cn('font-medium text-brand-ink hover:text-brand hover:underline', className)}>
      {children}
    </Link>
  )
}

/** horizontal fill bar for stock / credit usage */
export function MeterBar({ value, max, tone, className, showLabel }: { value: number; max: number; tone?: Tone; className?: string; showLabel?: boolean }) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0
  const auto: Tone = tone ?? (pct >= 100 ? 'danger' : pct >= 80 ? 'warning' : 'brand')
  const bar = { brand: 'bg-brand', navy: 'bg-navy', success: 'bg-success', warning: 'bg-warning', danger: 'bg-danger', info: 'bg-info', neutral: 'bg-muted-foreground' }[auto]
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div className="h-1.5 min-w-12 flex-1 overflow-hidden rounded-full bg-muted">
        <div className={cn('h-full rounded-full transition-all', bar)} style={{ width: `${pct}%` }} />
      </div>
      {showLabel && <span className="w-9 text-end text-[11px] text-muted-foreground tabular">{fmtNum(pct)}%</span>}
    </div>
  )
}

// ───────────── workflow stepper ─────────────
export function Stepper({ steps, current, failed, className, compact }: { steps: string[]; current: number; failed?: boolean; className?: string; compact?: boolean }) {
  const t = useT()
  return (
    <ol className={cn('flex w-full items-start', className)}>
      {steps.map((s, i) => {
        const done = i < current || (i === current && current === steps.length - 1 && !failed)
        const active = i === current && !done
        return (
          <li key={s} className="relative flex flex-1 flex-col items-center text-center">
            {i > 0 && <span className={cn('absolute top-3.5 end-1/2 h-0.5 w-full -translate-y-1/2', i <= current ? 'bg-brand' : 'bg-border')} />}
            <span
              className={cn(
                'relative z-10 flex size-7 items-center justify-center rounded-full border-2 text-[11px] font-semibold',
                done && 'border-brand bg-brand text-white',
                active && (failed ? 'border-danger bg-danger text-white' : 'border-brand bg-card text-brand ring-4 ring-brand/15'),
                !done && !active && 'border-border bg-card text-muted-foreground',
              )}
            >
              {done ? <Check className="size-3.5" /> : i + 1}
            </span>
            {!compact && <span className={cn('mt-1.5 px-1 text-[11px] leading-tight', done || active ? 'font-medium text-foreground' : 'text-muted-foreground')}>{t(s)}</span>}
          </li>
        )
      })}
    </ol>
  )
}

// ───────────── form helpers ─────────────
export function Field({ label, error, hint, children, className, required }: { label: string; error?: string; hint?: string; children: ReactNode; className?: string; required?: boolean }) {
  const t = useT()
  return (
    <div className={cn('space-y-1.5', className)}>
      <Label className="text-[12.5px] font-medium">
        {t(label)}
        {required && <span className="text-danger"> *</span>}
      </Label>
      {children}
      {error ? <p className="text-[11.5px] text-danger">{t(error)}</p> : hint ? <p className="text-[11.5px] text-muted-foreground">{t(hint)}</p> : null}
    </div>
  )
}
export function NumInput({ value, onChange, className, min = 0, step = 'any', placeholder, ...rest }: { value: number | ''; onChange: (n: number) => void; className?: string; min?: number; step?: string; placeholder?: string; disabled?: boolean; autoFocus?: boolean; 'aria-label'?: string }) {
  return (
    <Input
      type="number"
      inputMode="decimal"
      min={min}
      step={step}
      value={value === 0 && placeholder ? '' : value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value === '' ? 0 : Number(e.target.value))}
      onFocus={(e) => e.target.select()}
      className={cn('tabular', className)}
      {...rest}
    />
  )
}
/** controlled select over a list of options */
export function Picker<T extends string>({ value, onChange, options, placeholder = 'Select…', className, disabled, size }: { value: T | '' | undefined; onChange: (v: T) => void; options: { value: T; label: ReactNode; disabled?: boolean }[]; placeholder?: string; className?: string; disabled?: boolean; size?: 'sm' | 'default' }) {
  const t = useT()
  return (
    <Select value={value || undefined} onValueChange={(v) => onChange(v as T)} disabled={disabled}>
      <SelectTrigger className={className} size={size}>
        <SelectValue placeholder={t(placeholder)} />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value} disabled={o.disabled}>
            {typeof o.label === 'string' ? t(o.label) : o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

/**
 * Editable product lines (KG + price) with live subtotal / VAT / total.
 * `available` optionally maps productId → KG available, to warn before posting.
 */
export function LineItemsEditor({
  lines, onChange, products, priceFor, available, vatRate, showPrice = true, showTotals = true, priceLabel = 'Price / kg', allowedProductIds,
}: {
  lines: SalesLine[]
  onChange: (l: SalesLine[]) => void
  products: DB['products']
  priceFor?: (productId: ID) => number
  available?: Record<ID, number>
  vatRate?: number
  showPrice?: boolean
  showTotals?: boolean
  priceLabel?: string
  allowedProductIds?: ID[]
}) {
  const t = useT()
  const name = useName()
  const opts = products.filter((p) => p.active && (!allowedProductIds || allowedProductIds.includes(p.id)))
  const set = (i: number, patch: Partial<SalesLine>) => onChange(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)))
  const totals = invoiceTotals(lines, vatRate ?? 0)
  return (
    <div className="space-y-2">
      <div className="hidden grid-cols-[1fr_110px_90px_120px_110px_36px] gap-2 px-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase md:grid">
        <span>{t('Product')}</span>
        <span>{t('Qty (KG)')}</span>
        <span>{t('Cartons')}</span>
        <span>{showPrice ? t(priceLabel) : ''}</span>
        <span className="text-end">{showPrice ? t('Amount') : ''}</span>
        <span />
      </div>
      {lines.map((l, i) => {
        const p = products.find((x) => x.id === l.productId)
        const avail = available && l.productId ? (available[l.productId] ?? 0) : undefined
        const over = avail !== undefined && l.qtyKg > avail + 0.001
        return (
          <div key={i} className="grid grid-cols-2 gap-2 rounded-lg border p-2 md:grid-cols-[1fr_110px_90px_120px_110px_36px] md:items-center md:border-0 md:p-0">
            <div className="col-span-2 md:col-span-1">
              <Picker
                value={l.productId}
                onChange={(v) => set(i, { productId: v, price: priceFor ? priceFor(v) : (products.find((x) => x.id === v)?.sellPrice ?? 0) })}
                options={opts.map((o) => ({ value: o.id, label: `${name(o)}${available ? ` · ${fmtNum(available[o.id] ?? 0)} kg` : ''}`, disabled: lines.some((x, j) => j !== i && x.productId === o.id) }))}
                placeholder="Select product"
              />
              {over && <p className="mt-1 text-[11px] text-danger">{t('Only {n} kg available', { n: fmtNum(avail!, 1) })}</p>}
            </div>
            <NumInput value={l.qtyKg} onChange={(v) => set(i, { qtyKg: v })} placeholder="0" className={cn(over && 'border-danger')} aria-label="KG" />
            <div className="flex h-9 items-center rounded-md bg-muted px-2.5 text-[13px] text-muted-foreground tabular">
              {p ? `${fmtNum(l.qtyKg / p.cartonKg, 1)} × ${p.cartonKg}` : '—'}
            </div>
            {showPrice ? <NumInput value={l.price} onChange={(v) => set(i, { price: v })} aria-label="Price" /> : <span className="hidden md:block" />}
            <div className="flex h-9 items-center justify-end text-[13px] font-medium tabular">{showPrice ? fmtSAR(round2(l.qtyKg * l.price)) : ''}</div>
            <Button type="button" variant="ghost" size="icon" onClick={() => onChange(lines.filter((_, j) => j !== i))} aria-label="Remove line" disabled={lines.length === 1} className="justify-self-end">
              <Trash2 className="text-muted-foreground" />
            </Button>
          </div>
        )
      })}
      <Button type="button" variant="outline" size="sm" onClick={() => onChange([...lines, { productId: '', qtyKg: 0, price: 0 }])}>
        <Plus /> {t('Add line')}
      </Button>
      {showPrice && showTotals && (
        <div className="ms-auto mt-2 w-full max-w-xs space-y-1 rounded-lg bg-muted/60 p-3 text-[13px]">
          <Row label={t('Total KG')} value={fmtKg(lines.reduce((s, l) => s + l.qtyKg, 0))} />
          <Row label={t('Subtotal')} value={fmtSAR(totals.subtotal)} />
          {vatRate !== undefined && <Row label={`${t('VAT')} ${vatRate}%`} value={fmtSAR(totals.vat)} />}
          {vatRate !== undefined && <Row label={t('Total')} value={fmtSAR(totals.total)} strong />}
        </div>
      )}
    </div>
  )
}
const Row = ({ label, value, strong }: { label: string; value: string; strong?: boolean }) => (
  <div className={cn('flex justify-between gap-3', strong && 'border-t pt-1 text-[14px] font-semibold')}>
    <span className="text-muted-foreground">{label}</span>
    <span className="tabular">{value}</span>
  </div>
)
export const SummaryRow = Row

// ───────────── print preview ─────────────
/** A dialog showing an A4-style document with a Print button (prints just the document). */
export function PrintDialog({ open, onOpenChange, title, children, wide }: { open: boolean; onOpenChange: (o: boolean) => void; title: string; children: ReactNode; wide?: boolean }) {
  const t = useT()
  const ref = useRef<HTMLDivElement>(null)
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn('max-h-[94vh] bg-muted sm:max-w-3xl', wide && 'sm:max-w-5xl')}>
        <DialogHeader>
          <DialogTitle>{t(title)}</DialogTitle>
        </DialogHeader>
        <div className="max-h-[70vh] overflow-auto rounded-lg">
          <div ref={ref} className="mx-auto bg-white p-8 text-[12.5px] text-[#14202e] shadow-sm" style={{ maxWidth: wide ? 1000 : 794 }}>
            {children}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t('Close')}</Button>
          <Button onClick={() => ref.current && printElement(ref.current, t(title))}>
            <Printer /> {t('Print')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
/** company letterhead used at the top of printable documents */
export function DocHeader({ title, number, date, extra }: { title: string; number?: string; date?: string; extra?: ReactNode }) {
  const s = useStore((x) => x.db.settings)
  const t = useT()
  return (
    <div className="mb-5 flex items-start justify-between gap-4 border-b-2 border-[#087f5b] pb-4">
      <div>
        <div className="flex items-center gap-2">
          <div className="flex size-9 items-center justify-center rounded-lg bg-[#087f5b] text-sm font-bold text-white">MF</div>
          <div>
            <div className="text-[15px] font-bold">{s.companyName}</div>
            <div className="text-[12px]" dir="rtl">{s.companyNameAr}</div>
          </div>
        </div>
        <div className="mt-2 text-[11px] leading-relaxed text-[#5f6b7a]">
          {s.address}
          <br />
          CR {s.crNo} · VAT {s.vatNo} · {s.phone}
        </div>
      </div>
      <div className="text-end">
        <div className="text-[18px] font-bold tracking-tight text-[#14283f] uppercase">{t(title)}</div>
        {number && <div className="mt-1 text-[13px] font-semibold">{number}</div>}
        {date && <div className="text-[12px] text-[#5f6b7a]">{date}</div>}
        {extra}
      </div>
    </div>
  )
}
export function DocFooterNote({ children }: { children?: ReactNode }) {
  const t = useT()
  return (
    <div className="mt-8 border-t pt-3 text-center text-[10.5px] text-[#8a95a5]">
      {children ?? t('Demo document generated by MeatFlow ERP prototype — not a ZATCA-certified e-invoice.')}
    </div>
  )
}

/** tiny state hook for "open with this record" dialogs */
export function useDialog<T = true>() {
  const [value, setValue] = useState<T | null>(null)
  return useMemo(() => ({ value, open: (v: T) => setValue(v), close: () => setValue(null), isOpen: value !== null, onOpenChange: (o: boolean) => !o && setValue(null) }), [value])
}

export const newIdemKey = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
