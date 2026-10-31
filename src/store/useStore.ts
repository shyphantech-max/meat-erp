/**
 * Single persisted store holding the whole ERP database (LocalStorage).
 * Mutations go through `run`, which executes a transaction from ./logic on an immer draft
 * and commits only on success, so related modules (stock, van, invoices, outstanding,
 * settlements, dashboard) always update together and never half-apply.
 */
import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { produce } from 'immer'
import type { DB, Result } from '@/types'
import { buildSeed, emptyDB, DB_VERSION } from '@/data/seed'
import { startRecording, stopRecording } from '@/lib/commands'
import { isRemote } from '@/data/remote/config'
import { enqueue, resync } from '@/data/remote/sync'
import type { Ctx } from './logic'
import { todayKey } from '@/lib/format'
import { useUI } from './useUI'

interface State {
  db: DB
  touched: boolean
  run: <R extends Result<any>>(fn: (db: DB, ctx: Ctx) => R) => R
  reset: () => void
  markNotificationsRead: (audience: 'admin' | 'driver', driverId?: string) => void
}

/** who is acting: the signed-in driver in the driver app, otherwise the signed-in staff user (audit trail) */
export function makeCtx(db: DB): Ctx {
  const ui = useUI.getState()
  const user = ui.role === 'driver' ? db.drivers.find((d) => d.id === ui.driverId)?.name : db.users?.find((u) => u.id === ui.userId)?.name
  return { user: user ?? 'User', today: todayKey(), now: new Date().toISOString() }
}

export const useStore = create<State>()(
  persist(
    (set, get) => ({
      // remote mode starts empty and is filled from the Catalyst API after sign-in
      db: isRemote() ? emptyDB(todayKey()) : buildSeed(),
      touched: false,
      run: (fn) => {
        let res!: ReturnType<typeof fn>
        let rec = { commands: [], ids: [] } as ReturnType<typeof stopRecording>
        startRecording()
        let next: DB = get().db
        try {
          next = produce(get().db, (draft) => {
            res = fn(draft as DB, makeCtx(get().db))
            // returning nothing keeps the draft; a failed result is discarded below
          })
        } finally {
          rec = stopRecording()
        }
        if ((res as unknown as { ok?: boolean })?.ok) {
          set({ db: next, touched: true })
          enqueue(rec) // remote mode: send the recorded commands to the Catalyst API (no-op locally)
        }
        return res
      },
      reset: () => (isRemote() ? void resync().catch(() => {}) : set({ db: buildSeed(todayKey()), touched: false })),
      markNotificationsRead: (audience, driverId) =>
        set({
          db: produce(get().db, (d) => {
            for (const n of d.notifications) if (n.audience === audience && (!driverId || n.driverId === driverId)) n.read = true
          }),
        }),
    }),
    {
      name: 'meatflow-erp-db',
      version: DB_VERSION,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ db: s.db, touched: s.touched }),
      migrate: () => ({ db: isRemote() ? emptyDB(todayKey()) : buildSeed(todayKey()), touched: false }) as any,
      onRehydrateStorage: () => (state) => {
        // an untouched demo opened on a later day is regenerated so "today" always has activity
        if (isRemote()) return // server data: never replaced with sample data
        if (state && (!state.db?.settings || state.db.version !== DB_VERSION || (!state.touched && state.db.settings.seededAt !== todayKey()))) {
          useStore.setState({ db: buildSeed(todayKey()), touched: false })
        }
      },
    },
  ),
)

export const useDB = <T,>(sel: (db: DB) => T) => useStore((s) => sel(s.db))
export { useUI }
