/** Shared chart styling for Recharts so every chart reads as one system. */
import type { ReactNode } from 'react'
import { fmtNum, fmtSAR } from '@/lib/format'

export const CHART = {
  brand: '#047a3f',
  navy: '#7a1a12', // secondary series = logo maroon (mutton)
  maroon: '#7a1a12',
  mint: '#71ce57',
  slate: '#8f9c94',
  amber: '#d99a2b',
  red: '#c4161c',
  grid: '#edf2ee',
  axis: '#66756b',
  series: ['#047a3f', '#7a1a12', '#71ce57', '#d99a2b', '#8f9c94', '#2f6fb3', '#b25d8a', '#9c7a3c'],
}
export const axisProps = { tick: { fontSize: 11, fill: CHART.axis }, axisLine: false, tickLine: false } as const
export const gridProps = { stroke: CHART.grid, vertical: false } as const
export const sarTick = (v: number) => (Math.abs(v) >= 1_000_000 ? `${fmtNum(v / 1_000_000, 1)}M` : Math.abs(v) >= 1000 ? `${fmtNum(v / 1000, 0)}K` : fmtNum(v))

/** tooltip content: <Tooltip content={<ChartTip money />} /> */
export function ChartTip({ active, payload, label, money, unit, labelFormatter }: { active?: boolean; payload?: any[]; label?: ReactNode; money?: boolean; unit?: string; labelFormatter?: (l: any) => ReactNode }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-lg">
      {label !== undefined && <div className="mb-1 font-semibold">{labelFormatter ? labelFormatter(label) : label}</div>}
      {payload.map((p) => (
        <div key={p.dataKey ?? p.name} className="flex items-center gap-2">
          <span className="size-2 rounded-full" style={{ background: p.color ?? p.payload?.fill }} />
          <span className="text-muted-foreground">{p.name}</span>
          <span className="ms-auto ps-3 font-medium tabular">{money ? fmtSAR(p.value) : `${fmtNum(p.value, 1)}${unit ? ` ${unit}` : ''}`}</span>
        </div>
      ))}
    </div>
  )
}
export function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11.5px] text-muted-foreground">
      {items.map((i) => (
        <span key={i.label} className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm" style={{ background: i.color }} />
          {i.label}
        </span>
      ))}
    </div>
  )
}
