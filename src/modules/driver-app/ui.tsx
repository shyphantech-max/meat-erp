/** Big, touch-friendly building blocks for the driver app. */
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Minus, Plus, type LucideIcon } from 'lucide-react'
import { Button, type ButtonProps } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { useT } from '@/i18n'
import { round2 } from '@/lib/format'

export function Screen({ title, back, action, children, className }: { title?: string; back?: string | true; action?: ReactNode; children: ReactNode; className?: string }) {
  const t = useT()
  const nav = useNavigate()
  return (
    <div className={cn('space-y-4 px-4 pt-4 pb-6', className)}>
      {(title || back) && (
        <div className="flex items-center gap-2">
          {back && (
            <button
              onClick={() => (back === true ? nav(-1) : nav(back))}
              className="-ms-1 flex size-11 shrink-0 items-center justify-center rounded-full hover:bg-muted active:bg-muted"
              aria-label={t('Back')}
            >
              <ArrowLeft className="flip-rtl size-5" />
            </button>
          )}
          {title && <h1 className="min-w-0 flex-1 truncate text-[20px] font-bold text-brand-ink">{t(title)}</h1>}
          {action}
        </div>
      )}
      {children}
    </div>
  )
}

export function BigButton({ className, icon: Icon, children, ...p }: ButtonProps & { icon?: LucideIcon }) {
  return (
    <Button className={cn('h-14 w-full rounded-xl text-[16px] font-semibold [&_svg]:size-5', className)} {...p}>
      {Icon && <Icon />}
      {children}
    </Button>
  )
}

export function Tile({ label, value, sub, icon: Icon, tone = 'brand', onClick }: { label: string; value: ReactNode; sub?: ReactNode; icon?: LucideIcon; tone?: 'brand' | 'navy' | 'warning' | 'danger' | 'info'; onClick?: () => void }) {
  const t = useT()
  const box = { brand: 'bg-brand-soft text-brand', navy: 'bg-maroon-soft text-maroon', warning: 'bg-warning-soft text-warning', danger: 'bg-danger-soft text-danger', info: 'bg-info-soft text-info' }[tone]
  return (
    <button onClick={onClick} disabled={!onClick} className={cn('rounded-2xl border bg-card p-3.5 text-start shadow-xs', onClick && 'active:scale-[0.98] active:bg-muted/50')}>
      <div className="flex items-center gap-2">
        {Icon && (
          <span className={cn('flex size-8 items-center justify-center rounded-lg', box)}>
            <Icon className="size-4" />
          </span>
        )}
        <span className="text-[12px] leading-tight font-medium text-muted-foreground">{t(label)}</span>
      </div>
      <div className="mt-2 text-[21px] leading-tight font-bold text-brand-ink tabular">{value}</div>
      {sub && <div className="mt-0.5 text-[11.5px] text-muted-foreground">{sub}</div>}
    </button>
  )
}

export function QtyStepper({ value, onChange, step = 1, max, className }: { value: number; onChange: (n: number) => void; step?: number; max?: number; className?: string }) {
  const clamp = (n: number) => round2(Math.max(0, max !== undefined ? Math.min(max, n) : n))
  return (
    <div className={cn('flex items-center gap-1.5', className)}>
      <button type="button" onClick={() => onChange(clamp(value - step))} className="flex size-12 shrink-0 items-center justify-center rounded-xl border bg-card active:bg-muted" aria-label="-">
        <Minus className="size-5" />
      </button>
      <Input
        type="number"
        inputMode="decimal"
        value={value}
        onFocus={(e) => e.target.select()}
        onChange={(e) => onChange(clamp(Number(e.target.value) || 0))}
        className="h-12 min-w-0 flex-1 text-center text-[18px] font-semibold tabular"
      />
      <button type="button" onClick={() => onChange(clamp(value + step))} className="flex size-12 shrink-0 items-center justify-center rounded-xl border bg-card active:bg-muted" aria-label="+">
        <Plus className="size-5" />
      </button>
    </div>
  )
}

export function Chip({ active, onClick, children, tone = 'brand' }: { active?: boolean; onClick: () => void; children: ReactNode; tone?: 'brand' | 'danger' }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'min-h-11 rounded-full border px-4 py-2 text-[14px] font-medium transition-colors',
        active ? (tone === 'danger' ? 'border-danger bg-danger text-white' : 'border-brand bg-brand text-white') : 'bg-card active:bg-muted',
      )}
    >
      {children}
    </button>
  )
}

export function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string; icon?: LucideIcon }[] }) {
  const t = useT()
  return (
    <div className="grid gap-1 rounded-xl bg-muted p-1" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn('flex h-12 items-center justify-center gap-2 rounded-lg text-[15px] font-semibold', value === o.value ? 'bg-card text-brand shadow-sm' : 'text-muted-foreground')}
        >
          {o.icon && <o.icon className="size-4" />}
          {t(o.label)}
        </button>
      ))}
    </div>
  )
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between pt-1">
      <h2 className="text-[13px] font-semibold tracking-wide text-muted-foreground uppercase">{children}</h2>
      {action}
    </div>
  )
}

export function KV({ label, value, strong, tone }: { label: ReactNode; value: ReactNode; strong?: boolean; tone?: 'danger' | 'success' }) {
  return (
    <div className={cn('flex items-center justify-between gap-3 py-1.5 text-[14px]', strong && 'border-t pt-2 text-[16px] font-bold')}>
      <span className={strong ? '' : 'text-muted-foreground'}>{label}</span>
      <span className={cn('tabular', tone === 'danger' && 'text-danger', tone === 'success' && 'text-success')}>{value}</span>
    </div>
  )
}
