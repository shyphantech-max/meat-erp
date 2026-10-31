/** Dashboard building blocks: KPI cards with trend, glance tiles, gauge and mix bars. */
import type { ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Area, AreaChart, PolarAngleAxis, RadialBar, RadialBarChart, ResponsiveContainer } from 'recharts'
import { ArrowDownRight, ArrowUpRight, Minus, type LucideIcon } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { useT } from '@/i18n'
import { fmtNum } from '@/lib/format'
import { cn } from '@/lib/utils'

export type WTone = 'brand' | 'maroon' | 'success' | 'warning' | 'danger' | 'info' | 'neutral'
export const toneIcon: Record<WTone, string> = {
  brand: 'bg-brand-soft text-brand',
  maroon: 'bg-maroon-soft text-maroon',
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-danger-soft text-danger',
  info: 'bg-info-soft text-info',
  neutral: 'bg-muted text-muted-foreground',
}

/** ↑ 12% / ↓ 4% chip versus the previous equal period */
export function DeltaChip({ pct, inverse, className }: { pct: number | null; inverse?: boolean; className?: string }) {
  const t = useT()
  if (pct === null) return <span className={cn('rounded-full bg-info-soft px-1.5 py-0.5 text-[10.5px] font-semibold text-info', className)}>{t('New')}</span>
  const flat = Math.abs(pct) < 0.5
  const good = inverse ? pct < 0 : pct > 0
  const Icon = flat ? Minus : pct > 0 ? ArrowUpRight : ArrowDownRight
  return (
    <span className={cn('inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10.5px] font-semibold tabular', flat ? 'bg-muted text-muted-foreground' : good ? 'bg-success-soft text-success' : 'bg-danger-soft text-danger', className)}>
      <Icon className="size-3" />
      {fmtNum(Math.abs(pct), Math.abs(pct) < 10 ? 1 : 0)}%
    </span>
  )
}

/** headline KPI: big value (compact on phones), delta chip, sparkline */
export function HeroKpi({
  label, full, compact, sub, delta, spark, color, icon: Icon, tone = 'brand', to,
}: { label: string; full: string; compact: string; sub?: ReactNode; delta?: number | null; spark?: { v: number }[]; color: string; icon: LucideIcon; tone?: WTone; to?: string }) {
  const t = useT()
  const nav = useNavigate()
  const gid = `sp-${label.replace(/\W+/g, '')}`
  return (
    <Card onClick={to ? () => nav(to) : undefined} className={cn('relative gap-0 overflow-hidden p-0 transition-shadow', to && 'cursor-pointer hover:border-brand/40 hover:shadow-md')}>
      <div className="p-3.5 pb-0 sm:p-4 sm:pb-0">
        <div className="flex items-start justify-between gap-2">
          <p className="min-w-0 truncate text-[12px] font-medium text-muted-foreground">{t(label)}</p>
          <span className={cn('flex size-7 shrink-0 items-center justify-center rounded-lg sm:size-8', toneIcon[tone])}><Icon className="size-4" /></span>
        </div>
        <div className="mt-1 min-w-0 text-[19px] leading-tight font-bold tracking-tight text-brand-ink tabular sm:text-[22px]">
          <span className="block truncate sm:hidden">{compact}</span>
          <span className="hidden truncate sm:block">{full}</span>
        </div>
        <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5 text-[11.5px] text-muted-foreground">
          {delta !== undefined && <DeltaChip pct={delta} />}
          {sub && <span className="min-w-0 truncate">{sub}</span>}
        </div>
      </div>
      <div className="mt-1 h-11 w-full">
        {spark && spark.length > 1 && (
          <ResponsiveContainer>
            <AreaChart data={spark} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity={0.28} />
                  <stop offset="100%" stopColor={color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area isAnimationActive={false} type="monotone" dataKey="v" stroke={color} strokeWidth={1.8} fill={`url(#${gid})`} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </Card>
  )
}

/** compact secondary KPI */
export function MiniKpi({ label, value, sub, icon: Icon, tone = 'brand', to, alert }: { label: string; value: ReactNode; sub?: ReactNode; icon: LucideIcon; tone?: WTone; to?: string; alert?: boolean }) {
  const t = useT()
  const nav = useNavigate()
  return (
    <Card onClick={to ? () => nav(to) : undefined} className={cn('gap-0 p-3.5 transition-shadow', to && 'cursor-pointer hover:border-brand/40 hover:shadow-md', alert && 'border-warning/50')}>
      <div className="flex items-center gap-3">
        <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-xl', toneIcon[tone])}><Icon className="size-[18px]" /></span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[11.5px] font-medium text-muted-foreground">{t(label)}</p>
          <div className="truncate text-[16px] leading-tight font-bold text-brand-ink tabular sm:text-[17px]">{value}</div>
        </div>
      </div>
      {sub && <div className="mt-2 truncate text-[11.5px] text-muted-foreground">{sub}</div>}
    </Card>
  )
}

/** "Today at a glance" tile */
export function GlanceTile({ label, value, hint, icon: Icon, to, highlight }: { label: string; value: ReactNode; hint?: ReactNode; icon: LucideIcon; to: string; highlight?: boolean }) {
  const t = useT()
  return (
    <Link to={to} className={cn('group flex h-full min-w-0 items-center gap-2.5 rounded-xl border bg-card px-3 py-2.5 transition-colors hover:border-brand/40 hover:bg-brand-soft/30 xl:flex-col xl:items-start xl:gap-2', highlight && 'border-warning/40 bg-warning-soft/40')}>
      <span className={cn('flex size-8 shrink-0 items-center justify-center rounded-lg', highlight ? 'bg-warning-soft text-warning' : 'bg-brand-soft text-brand')}><Icon className="size-4" /></span>
      <span className="w-full min-w-0 leading-tight">
        <span className="line-clamp-1 text-[11px] text-muted-foreground xl:line-clamp-2 xl:min-h-[2.3em]">{t(label)}</span>
        <span className="block truncate text-[15px] font-bold text-brand-ink tabular">{value}</span>
        {hint && <span className="block truncate text-[10.5px] text-muted-foreground">{hint}</span>}
      </span>
    </Link>
  )
}

/** radial gauge 0-100% */
export function Gauge({ value, color, label, sub }: { value: number | null; color: string; label: string; sub?: ReactNode }) {
  const t = useT()
  const v = value === null ? 0 : Math.max(0, Math.min(100, value))
  return (
    <div className="relative h-[180px]">
      <ResponsiveContainer>
        <RadialBarChart data={[{ v }]} innerRadius="72%" outerRadius="100%" startAngle={210} endAngle={-30} barSize={14}>
          <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
          <RadialBar isAnimationActive={false} dataKey="v" cornerRadius={8} fill={color} background={{ fill: 'var(--muted)' }} />
        </RadialBarChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center pt-2">
        <span className="text-[26px] font-bold text-brand-ink tabular">{value === null ? '-' : `${fmtNum(value, 0)}%`}</span>
        <span className="text-[11.5px] text-muted-foreground">{t(label)}</span>
        {sub && <span className="mt-0.5 max-w-[60%] truncate text-center text-[11px] text-muted-foreground">{sub}</span>}
      </div>
    </div>
  )
}

/** 100% stacked bar with legend below */
export function MixBar({ title, parts, format }: { title: string; parts: { label: string; value: number; color: string }[]; format: (n: number) => string }) {
  const t = useT()
  const total = parts.reduce((s, p) => s + p.value, 0)
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-[12px]">
        <span className="font-medium">{t(title)}</span>
        <span className="text-muted-foreground tabular">{format(total)}</span>
      </div>
      <div className="flex h-2.5 overflow-hidden rounded-full bg-muted">
        {total > 0 && parts.map((p) => <span key={p.label} style={{ width: `${(p.value / total) * 100}%`, background: p.color }} />)}
      </div>
      <div className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1">
        {parts.map((p) => (
          <div key={p.label} className="flex min-w-0 items-center gap-1.5 text-[11.5px]">
            <span className="size-2 shrink-0 rounded-sm" style={{ background: p.color }} />
            <span className="truncate text-muted-foreground">{t(p.label)}</span>
            <span className="ms-auto font-medium tabular">{total > 0 ? `${fmtNum((p.value / total) * 100)}%` : '-'}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function ViewAll({ to, label = 'View all' }: { to: string; label?: string }) {
  const t = useT()
  return <Link to={to} className="text-[12px] font-medium whitespace-nowrap text-brand hover:underline">{t(label)}</Link>
}

/** fixed-height chart box: 240px on phones, taller on desktop */
/** chart area: fixed minimum height, grows to fill the panel when the row is taller */
export const ChartBox = ({ children, tall }: { children: ReactNode; tall?: boolean }) => <div className={cn('w-full grow', tall ? 'h-[260px] sm:h-72' : 'h-[240px] sm:h-64')}>{children}</div>

export const shortName = (s: string, n = 16) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)
