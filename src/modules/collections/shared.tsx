/** Finance-module helpers shared by collections, settlement and accounts. */
import type { DayKey } from '@/types'
import { Picker } from '@/components/common'
import { shiftDay, todayKey } from '@/lib/format'

export type Range = 'today' | '7d' | '30d' | 'mtd' | '90d' | 'all'
export const RANGE_OPTIONS: { value: Range; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: 'mtd', label: 'This month' },
  { value: '90d', label: 'Last 90 days' },
  { value: 'all', label: 'All time' },
]
export function rangeStart(r: Range): DayKey {
  const t = todayKey()
  if (r === 'today') return t
  if (r === '7d') return shiftDay(t, -6)
  if (r === '30d') return shiftDay(t, -29)
  if (r === '90d') return shiftDay(t, -89)
  if (r === 'mtd') return `${t.slice(0, 7)}-01`
  return '0000-01-01'
}
export const inRange = (d: DayKey, r: Range) => d >= rangeStart(r) && d <= todayKey()

export function RangePicker({ value, onChange }: { value: Range; onChange: (r: Range) => void }) {
  return <Picker value={value} onChange={onChange} options={RANGE_OPTIONS} size="sm" className="h-9 w-40" />
}
