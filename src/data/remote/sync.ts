/**
 * Remote sync (VITE_DATA_MODE=remote).
 *
 * Every successful action already ran in the browser (instant UI, same validations). The recorded
 * commands are queued here, persisted (survives reloads / no signal on the road) and sent to the
 * Catalyst API in order. The API re-executes them against Data Store and returns the authoritative
 * rows, which replace the optimistic ones. A rejected command triggers a full re-download.
 * API contract: docs/catalyst-backend.md
 */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { produce } from 'immer'
import { toast } from 'sonner'
import type { AppUser, DB } from '@/types'
import type { Recording } from '@/lib/commands'
import { randomId, setIdFactory } from '@/lib/commands'
import { api, ApiError, setToken } from './client'
import { isRemote } from './config'
import { useStore } from '@/store/useStore'
import { rowKey } from '@/lib/rowKey'

export interface QueueItem {
  key: string // idempotency key - the server ignores a key it has already applied
  commands: Recording['commands']
  ids: string[]
  createdAt: string
  attempts: number
}
/** rows changed by the server, per collection (see docs/catalyst-backend.md) */
export interface ChangeSet {
  version: number
  changes?: Partial<Record<keyof DB, { upsert?: Record<string, unknown>[]; delete?: string[] }>>
  settings?: DB['settings']
  counters?: DB['counters']
}
type Status = 'idle' | 'syncing' | 'offline' | 'error'

interface SyncState {
  token: string | null
  version: number
  queue: QueueItem[]
  status: Status
  lastSyncAt?: string
  lastError?: string
}
export const useSync = create<SyncState>()(
  persist((): SyncState => ({ token: null, version: 0, queue: [], status: 'idle' }), {
    name: 'zad-erp-sync',
    partialize: (s) => ({ token: s.token, version: s.version, queue: s.queue, lastSyncAt: s.lastSyncAt }),
    onRehydrateStorage: () => (s) => {
      if (s?.token) setToken(s.token)
    },
  }),
)

// ───── applying server data ─────
function applyChangeSet(cs: ChangeSet) {
  useStore.setState((st) => ({
    db: produce(st.db, (d) => {
      for (const [coll, ch] of Object.entries(cs.changes ?? {})) {
        const list = (d as unknown as Record<string, Record<string, unknown>[]>)[coll]
        if (!Array.isArray(list) || !ch) continue
        for (const row of ch.upsert ?? []) {
          const k = rowKey(coll, row)
          const i = list.findIndex((x) => rowKey(coll, x) === k)
          if (i >= 0) list[i] = row
          else list.push(row)
        }
        if (ch.delete?.length) {
          const del = new Set(ch.delete)
          ;(d as unknown as Record<string, unknown[]>)[coll] = list.filter((x) => !del.has(rowKey(coll, x)))
        }
      }
      if (cs.settings) d.settings = cs.settings
      if (cs.counters) d.counters = { ...d.counters, ...cs.counters }
    }),
  }))
  useSync.setState({ version: Math.max(useSync.getState().version, cs.version), lastSyncAt: new Date().toISOString() })
}

/** download the full database the signed-in user may see */
export async function resync() {
  const snap = await api<{ version: number; db: DB }>('/snapshot')
  useStore.setState({ db: snap.db, touched: true })
  useSync.setState({ version: snap.version, lastSyncAt: new Date().toISOString(), status: 'idle', lastError: undefined })
}

// ───── queue ─────
let running = false
let retryTimer: ReturnType<typeof setTimeout> | undefined

export function enqueue(rec: Recording) {
  if (!isRemote() || !rec.commands.length) return
  const item: QueueItem = { key: randomId('tx'), commands: rec.commands, ids: rec.ids, createdAt: new Date().toISOString(), attempts: 0 }
  useSync.setState((s) => ({ queue: [...s.queue, item] }))
  void drain()
}

export async function drain() {
  if (running || !isRemote() || !useSync.getState().token) return
  running = true
  clearTimeout(retryTimer)
  try {
    while (useSync.getState().queue.length) {
      const item = useSync.getState().queue[0]
      useSync.setState({ status: 'syncing' })
      try {
        const res = await api<ChangeSet & { ok: boolean; error?: string }>('/commands', { body: { key: item.key, commands: item.commands, ids: item.ids } })
        useSync.setState((s) => ({ queue: s.queue.slice(1) }))
        if (res.ok) applyChangeSet(res)
        else {
          toast.error(res.error ?? 'The server rejected a change - reloading the latest data')
          await resync()
        }
      } catch (e) {
        const err = e as ApiError
        if (err.status === 401) {
          useSync.setState({ status: 'error', lastError: 'Session expired - sign in again' })
          return
        }
        if (err.status >= 400 && err.status < 500) {
          // validation failure on the server: drop this change and take the server's truth
          useSync.setState((s) => ({ queue: s.queue.slice(1), lastError: err.message }))
          toast.error(err.message)
          await resync().catch(() => {})
          continue
        }
        // network / 5xx: keep the change and retry with backoff
        const attempts = item.attempts + 1
        useSync.setState((s) => ({ status: err.code === 'NETWORK' ? 'offline' : 'error', lastError: err.message, queue: [{ ...s.queue[0], attempts }, ...s.queue.slice(1)] }))
        retryTimer = setTimeout(() => void drain(), Math.min(60000, 2000 * 2 ** Math.min(attempts, 5)))
        return
      }
    }
    useSync.setState({ status: 'idle', lastError: undefined })
  } finally {
    running = false
  }
}

/** fetch rows other users changed since our last version */
export async function pull() {
  if (!isRemote() || !useSync.getState().token || useSync.getState().queue.length) return
  try {
    const cs = await api<ChangeSet>(`/changes?since=${useSync.getState().version}`)
    applyChangeSet(cs)
  } catch {
    /* next poll retries */
  }
}

// ───── session ─────
export interface LoginResult {
  token: string
  user: AppUser
}
export async function remoteLogin(email: string, password: string) {
  const r = await api<LoginResult>('/auth/login', { body: { email, password } })
  setToken(r.token)
  useSync.setState({ token: r.token })
  await resync()
  return r.user
}
export function remoteLogout() {
  setToken(null)
  useSync.setState({ token: null, queue: [], version: 0 })
  void api('/auth/logout', { method: 'POST' }).catch(() => {})
}

/** start background sync; call once at app start */
export function initRemote() {
  if (!isRemote()) return
  setIdFactory(randomId)
  window.addEventListener('online', () => void drain())
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && (void drain(), void pull()))
  setInterval(() => void pull(), 60000)
  void drain()
}
