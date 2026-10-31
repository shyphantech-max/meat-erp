/**
 * Lightweight i18n: English strings are the keys; Arabic lives in ./ar/*.ts (one file per
 * module group so modules can be translated independently). Missing keys fall back to English.
 */
import { useCallback } from 'react'
import { useUI } from '@/store/useUI'
import common from './ar/common'
import dashboard from './ar/dashboard'
import purchasing from './ar/purchasing'
import inventory from './ar/inventory'
import sales from './ar/sales'
import fleet from './ar/fleet'
import finance from './ar/finance'
import reports from './ar/reports'
import settings from './ar/settings'
import driver from './ar/driver'

const AR: Record<string, string> = { ...common, ...dashboard, ...purchasing, ...inventory, ...sales, ...fleet, ...finance, ...reports, ...settings, ...driver }

export type TFn = (s: string, vars?: Record<string, string | number>) => string
const fill = (s: string, vars?: Record<string, string | number>) => (vars ? s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? '')) : s)

export function translate(lang: 'en' | 'ar', s: string, vars?: Record<string, string | number>) {
  return fill(lang === 'ar' ? (AR[s] ?? s) : s, vars)
}
/** hook: const t = useT(); t('Save') */
export function useT(): TFn {
  const lang = useUI((s) => s.lang)
  return useCallback((s: string, vars?: Record<string, string | number>) => translate(lang, s, vars), [lang])
}
/** non-hook variant for toasts and helpers */
export const tr: TFn = (s, vars) => translate(useUI.getState().lang, s, vars)
export const useLang = () => useUI((s) => s.lang)
/** pick the Arabic name of a master record when Arabic is active */
export function useName() {
  const lang = useUI((s) => s.lang)
  return useCallback((e?: { name: string; nameAr?: string } | null) => (!e ? '—' : lang === 'ar' && e.nameAr ? e.nameAr : e.name), [lang])
}
