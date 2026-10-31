import { addDays, differenceInCalendarDays, format, parseISO } from 'date-fns'
import type { DayKey } from '@/types'

/** current UI language, set by the UI store so plain formatters can localise without hooks */
let LANG: 'en' | 'ar' = 'en'
export const setFormatLang = (l: 'en' | 'ar') => (LANG = l)
export const getLang = () => LANG

const n2 = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const n0 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })
const n1 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 })

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
export const round1 = (n: number) => Math.round((n + Number.EPSILON) * 10) / 10

/** SAR 12,345.00 / 12,345.00 ر.س */
export function fmtSAR(n: number, opts: { decimals?: boolean; compact?: boolean } = {}) {
  const v = Number.isFinite(n) ? n : 0
  let s: string
  if (opts.compact && Math.abs(v) >= 1000) {
    s = Math.abs(v) >= 1_000_000 ? `${n1.format(v / 1_000_000)}M` : `${n1.format(v / 1000)}K`
  } else s = opts.decimals === false ? n0.format(v) : n2.format(v)
  return LANG === 'ar' ? `${s} ر.س` : `SAR ${s}`
}
export const fmtNum = (n: number, d = 0) => (d === 0 ? n0 : d === 1 ? n1 : n2).format(Number.isFinite(n) ? n : 0)
export const fmtKg = (n: number, d = 1) => `${fmtNum(n, d)} ${LANG === 'ar' ? 'كجم' : 'kg'}`
export const fmtCartons = (kg: number, cartonKg: number) => (cartonKg > 0 ? fmtNum(kg / cartonKg, 1) : '0')
export const fmtPct = (n: number, d = 0) => `${fmtNum(n, d)}%`

// ───── dates (local calendar days) ─────
export const dayKey = (d: Date = new Date()): DayKey => format(d, 'yyyy-MM-dd')
export const todayKey = () => dayKey(new Date())
export const shiftDay = (k: DayKey, n: number): DayKey => dayKey(addDays(parseISO(k), n))
export const daysBetween = (from: DayKey, to: DayKey) => differenceInCalendarDays(parseISO(to), parseISO(from))
export const fmtDate = (k?: string) => (k ? format(parseISO(k), 'dd MMM yyyy') : '—')
export const fmtDateShort = (k?: string) => (k ? format(parseISO(k), 'dd MMM') : '—')
export const fmtDateTime = (iso?: string) => (iso ? format(new Date(iso), 'dd MMM yyyy, HH:mm') : '—')
export const fmtTime = (iso?: string) => (iso ? format(new Date(iso), 'HH:mm') : '—')
export const monthKey = (k: DayKey) => k.slice(0, 7)
export const fmtMonth = (m: string) => format(parseISO(`${m}-01`), 'MMM yy')

export function fmtAgo(iso: string) {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 1) return LANG === 'ar' ? 'الآن' : 'just now'
  if (mins < 60) return LANG === 'ar' ? `منذ ${mins} د` : `${mins}m ago`
  const h = Math.round(mins / 60)
  if (h < 24) return LANG === 'ar' ? `منذ ${h} س` : `${h}h ago`
  const d = Math.round(h / 24)
  return LANG === 'ar' ? `منذ ${d} يوم` : `${d}d ago`
}

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter((w) => w && !/^(al|el|bin)$/i.test(w))
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('')
