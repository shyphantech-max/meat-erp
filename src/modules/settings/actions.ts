/** Validated settings update, run through useStore.run like every other transaction. */
import { command } from '@/lib/commands'
import type { DB, Result, Settings } from '@/types'
import { log, type Ctx } from '@/store/logic'

export type SettingsPatch = Partial<Omit<Settings, 'goLiveDate' | 'seededAt'>>

function updateSettings_(db: DB, ctx: Ctx, patch: SettingsPatch): Result {
  const next = { ...db.settings, ...patch }
  if (!next.companyName.trim()) return { ok: false, error: 'Company name is required' }
  if (next.vatNo && !/^3\d{13}3$/.test(next.vatNo.trim())) return { ok: false, error: 'VAT number must be 15 digits, starting and ending with 3' }
  if (next.crNo && !/^\d{10}$/.test(next.crNo.trim())) return { ok: false, error: 'CR number must be 10 digits' }
  if (!(next.vatRate >= 0 && next.vatRate <= 30)) return { ok: false, error: 'VAT rate must be between 0% and 30%' }
  if (!/^[A-Z0-9]{2,6}$/.test(next.invoicePrefix)) return { ok: false, error: 'Invoice prefix must be 2-6 capital letters or digits' }
  for (const k of ['nearExpiryFrozenDays', 'nearExpiryChilledDays', 'nearExpiryFreshDays'] as const)
    if (!(Number.isInteger(next[k]) && next[k] >= 0 && next[k] <= 365)) return { ok: false, error: 'Near-expiry thresholds must be whole days between 0 and 365' }
  if (!(next.cashVarianceToleranceSAR >= 0)) return { ok: false, error: 'Cash variance tolerance cannot be negative' }
  const changed = (Object.keys(patch) as (keyof SettingsPatch)[]).filter((k) => db.settings[k] !== patch[k])
  if (!changed.length) return { ok: false, error: 'No changes to save' }
  db.settings = next
  log(db, ctx, 'Updated settings', changed.join(', '))
  return { ok: true }
}

// ───────────────────────── command registry (recordable, shared with the Catalyst backend) ─────────────────────────
export const updateSettings = command('updateSettings', updateSettings_)
