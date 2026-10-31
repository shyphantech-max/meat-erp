import type { DayKey } from '@/types'
import type { RangePreset } from '@/store/useUI'
import { shiftDay, todayKey } from '@/lib/format'

export const RANGE_OPTIONS: { value: RangePreset; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: 'mtd', label: 'This month' },
  { value: '90d', label: 'Last 90 days' },
]

export function rangeBounds(r: RangePreset, today: DayKey = todayKey()): { from: DayKey; to: DayKey } {
  switch (r) {
    case 'today':
      return { from: today, to: today }
    case '7d':
      return { from: shiftDay(today, -6), to: today }
    case '30d':
      return { from: shiftDay(today, -29), to: today }
    case 'mtd':
      return { from: `${today.slice(0, 7)}-01`, to: today }
    case '90d':
      return { from: shiftDay(today, -89), to: today }
  }
}

export function daysIn(from: DayKey, to: DayKey) {
  const out: DayKey[] = []
  for (let d = from; d <= to; d = shiftDay(d, 1)) out.push(d)
  return out
}

export const inRange = (d: DayKey, from: DayKey, to: DayKey) => d >= from && d <= to
