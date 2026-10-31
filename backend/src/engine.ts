/**
 * Zad ERP API engine - one implementation of docs/catalyst-backend.md, shared by
 *   - backend/src/catalyst.ts  (Zoho Catalyst Advanced I/O function, Data Store storage)
 *   - scripts/dev-api.ts        (local in-memory server for testing)
 * Business rules come from src/store/logic.ts (+ access & settings actions) via commandRegistry,
 * so the browser and the server always apply exactly the same validations.
 */
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { produce, setAutoFreeze } from 'immer'
import type { AppUser, DB } from '../../src/types'
import { commandRegistry, randomId, setIdFactory } from '../../src/lib/commands'
import { DRIVER_COMMANDS, POS_COMMANDS, moduleOfCommand } from '../../src/lib/commandAccess'
import { canAccess } from '../../src/lib/rbac'
import { todayKey } from '../../src/lib/format'
import { rowKey } from '../../src/lib/rowKey'
// importing these registers all 32 commands
import '../../src/store/logic'
import '../../src/modules/access/actions'
import '../../src/modules/settings/actions'

setAutoFreeze(false)

export type Row = { id?: string } & Record<string, unknown>
export type Changes = Record<string, { upsert: Row[]; delete: string[] }>
/** what the storage keeps besides the DB: per-record change numbers (for /changes) */
export interface State {
  db: DB
  version: number
  rowVer: Map<string, { coll: string; ver: number; deleted?: boolean }>
  /** storage-specific lock token of the version this state was loaded at (optimistic concurrency) */
  lock?: string
}
export interface Storage {
  /** latest committed state */
  load(): Promise<State>
  /** write `changes` as the next change number; resolves that number, or false if another commit won / is in progress */
  commit(state: State, next: DB, changes: Changes): Promise<number | false>
  journalGet(key: string): Promise<number | undefined>
  journalPut(key: string, ver: number, userId: string): Promise<void>
}

export interface HttpReq {
  method: string
  path: string
  query: URLSearchParams
  headers: Record<string, string | string[] | undefined>
  body: any
}
export interface HttpRes {
  status: number
  body: unknown
}

const COLLS = (db: DB) => Object.keys(db).filter((k) => Array.isArray((db as unknown as Record<string, unknown>)[k]))

// ───── passwords & tokens ─────
export function hashPassword(pw: string) {
  const salt = randomBytes(12).toString('hex')
  return `scrypt$${salt}$${scryptSync(pw, salt, 32).toString('hex')}`
}
function verifyPassword(pw: string, stored: string) {
  if (!stored.startsWith('scrypt$')) return false
  const [, salt, hex] = stored.split('$')
  const a = Buffer.from(hex, 'hex')
  const b = scryptSync(pw, salt, 32)
  return a.length === b.length && timingSafeEqual(a, b)
}
const b64 = (s: string) => Buffer.from(s).toString('base64url')
function signToken(secret: string, userId: string, ttlHours = 12) {
  const payload = b64(JSON.stringify({ u: userId, e: Date.now() + ttlHours * 3600_000 }))
  return `${payload}.${createHmac('sha256', secret).update(payload).digest('base64url')}`
}
function readToken(secret: string, token: string): string | undefined {
  const [payload, sig] = token.split('.')
  if (!payload || !sig) return
  const expect = createHmac('sha256', secret).update(payload).digest('base64url')
  if (expect.length !== sig.length || !timingSafeEqual(Buffer.from(expect), Buffer.from(sig))) return
  const { u, e } = JSON.parse(Buffer.from(payload, 'base64url').toString())
  return e > Date.now() ? u : undefined
}

const publicUser = (u: AppUser) => ({ ...u, password: '' })
const sanitize = (d: DB): DB => ({ ...d, users: d.users.map((u) => publicUser(u) as AppUser) })

/** rows that changed between two versions (immer keeps unchanged rows by reference) */
export function diff(before: DB, after: DB): Changes {
  const changes: Changes = {}
  for (const c of COLLS(after)) {
    const a = (before as unknown as Record<string, Row[]>)[c] ?? []
    const b = (after as unknown as Record<string, Row[]>)[c]
    if (a === b) continue
    const old = new Map(a.map((r) => [rowKey(c, r), r]))
    const upsert = b.filter((r) => old.get(rowKey(c, r)) !== r)
    const ids = new Set(b.map((r) => rowKey(c, r)))
    const del = a.filter((r) => !ids.has(rowKey(c, r))).map((r) => rowKey(c, r))
    if (upsert.length || del.length) changes[c] = { upsert, delete: del }
  }
  return changes
}

function changesSince(state: State, since: number) {
  const changes: Changes = {}
  const byId = new Map<string, Row>()
  for (const c of COLLS(state.db)) for (const r of (state.db as unknown as Record<string, Row[]>)[c]) byId.set(rowKey(c, r), r)
  for (const [id, m] of state.rowVer) {
    if (m.ver <= since) continue
    const slot = (changes[m.coll] ??= { upsert: [], delete: [] })
    if (m.deleted) slot.delete.push(id)
    else {
      const row = byId.get(id)
      if (row) slot.upsert.push(m.coll === 'users' ? (publicUser(row as unknown as AppUser) as unknown as Row) : row)
    }
  }
  return changes
}

export function createEngine(storage: Storage, opts: { secret: string; seedSecret?: string; buildSeed?: () => DB }) {
  /** run a mutation with optimistic concurrency: retry on conflict with fresh state */
  async function mutate(fn: (d: DB) => string | undefined): Promise<{ ok: true; state: State; changes: Changes; version: number } | { ok: false; error: string }> {
    for (let attempt = 0; attempt < 8; attempt++) {
      if (attempt) await new Promise((r) => setTimeout(r, 120 * attempt + Math.random() * 150))
      const state = await storage.load()
      let failure: string | undefined
      const next = produce(state.db, (d) => {
        failure = fn(d as DB)
        if (failure) return
        // never store plain-text passwords
        for (const u of d.users) if (u.password && !u.password.startsWith('scrypt$')) u.password = hashPassword(u.password)
      })
      if (failure) return { ok: false, error: failure }
      const changes = diff(state.db, next)
      if (!Object.keys(changes).length && next.settings === state.db.settings && next.counters === state.db.counters) return { ok: true, state, changes, version: state.version }
      const version = await storage.commit(state, next, changes)
      if (version) return { ok: true, state: await storage.load(), changes, version }
    }
    return { ok: false, error: 'The system is busy - please try again' }
  }

  async function handle(req: HttpReq): Promise<HttpRes> {
    const path = req.path.replace(/^\/server\/api/, '').replace(/\/+$/, '') || '/'
    if (req.method === 'OPTIONS') return { status: 204, body: '' }
    if (path === '/health' || path === '/') {
      const s = await storage.load()
      return { status: 200, body: { ok: true, version: s.version, records: s.rowVer.size } }
    }

    // one-time loading of the opening data into an empty project
    if (path === '/admin/seed' && req.method === 'POST') {
      if (!opts.seedSecret || req.query.get('secret') !== opts.seedSecret) return { status: 403, body: { error: 'Forbidden' } }
      const s = await storage.load()
      if (s.rowVer.size > 0) return { status: 409, body: { error: 'Data already loaded' } }
      const seed = opts.buildSeed!()
      for (const u of seed.users) u.password = hashPassword(u.password)
      const changes: Changes = {}
      for (const c of COLLS(seed)) changes[c] = { upsert: (seed as unknown as Record<string, Row[]>)[c], delete: [] }
      const ok = await storage.commit(s, seed, changes)
      return ok ? { status: 200, body: { ok: true, records: Object.values(changes).reduce((n, c) => n + c.upsert.length, 0) } } : { status: 409, body: { error: 'Conflict' } }
    }

    // wipe business data, keeping logins/roles (+ optionally drivers & vehicles) - local `catalyst serve` only
    if (path === '/admin/reset' && req.method === 'POST') {
      if (!opts.seedSecret || req.query.get('secret') !== opts.seedSecret) return { status: 403, body: { error: 'Forbidden' } }
      const keepFleet = req.query.get('keepFleet') === '1'
      const keepIds = new Set((req.query.get('keepCustomers') ?? '').split(',').filter(Boolean))
      const KEEP = new Set(['users', 'roles', ...(keepFleet ? ['drivers', 'vehicles'] : [])])
      const today = todayKey()
      const r = await mutate((d) => {
        const rec = d as unknown as Record<string, Row[]>
        for (const c of COLLS(d)) {
          if (KEEP.has(c)) continue
          rec[c] = c === 'customers' ? rec[c].filter((x) => keepIds.has(String(x.id))) : []
        }
        if (!keepFleet) for (const u of d.users) if (u.driverId) u.active = false
        for (const dr of d.drivers) dr.warehouseId = ''
        d.counters = {}
        d.settings = { ...d.settings, goLiveDate: today, seededAt: today }
        return undefined
      })
      if (!r.ok) return { status: 409, body: { error: r.error } }
      const deleted = Object.values(r.changes).reduce((n, c) => n + c.delete.length, 0)
      return { status: 200, body: { ok: true, version: r.version, deleted } }
    }

    if (path === '/auth/login' && req.method === 'POST') {
      const { email, password } = req.body ?? {}
      const state = await storage.load()
      const u = state.db.users.find((x) => x.email.toLowerCase() === String(email ?? '').trim().toLowerCase())
      if (!u || !verifyPassword(String(password ?? ''), u.password)) return { status: 401, body: { error: 'Incorrect email or password.' } }
      if (!u.active) return { status: 403, body: { error: 'This account is deactivated. Contact the owner.' } }
      await mutate((d) => {
        const x = d.users.find((y) => y.id === u.id)
        if (x) x.lastLoginAt = new Date().toISOString()
        return undefined
      }).catch(() => {})
      return { status: 200, body: { token: signToken(opts.secret, u.id), user: publicUser(u) } }
    }

    // everything below needs a session token (query ?t= or Authorization: Bearer)
    const auth = String(req.headers.authorization ?? '')
    const token = req.query.get('t') ?? (auth.startsWith('Bearer ') ? auth.slice(7) : '')
    const userId = token ? readToken(opts.secret, token) : undefined
    const state = await storage.load()
    const user = state.db.users.find((x) => x.id === userId)
    if (!user || !user.active) return { status: 401, body: { error: 'Session expired - sign in again' } }
    const role = state.db.roles.find((r) => r.key === user.roleKey)

    if (path === '/auth/logout') return { status: 200, body: { ok: true } }
    if (path === '/snapshot') return { status: 200, body: { version: state.version, db: sanitize(state.db) } }
    if (path === '/changes') {
      const since = Number(req.query.get('since') ?? 0)
      return { status: 200, body: { version: state.version, changes: changesSince(state, since), settings: state.db.settings, counters: state.db.counters } }
    }

    if (path === '/commands' && req.method === 'POST') {
      const { key, commands, ids } = (req.body ?? {}) as { key: string; commands: { name: string; args: unknown[] }[]; ids: string[] }
      if (!key || !Array.isArray(commands)) return { status: 400, body: { error: 'Bad request' } }
      const done = await storage.journalGet(key)
      if (done !== undefined) {
        // idempotent retry: answer with what changed since just before that commit
        return { status: 200, body: { ok: true, version: state.version, changes: changesSince(state, done - 1), settings: state.db.settings, counters: state.db.counters } }
      }
      for (const c of commands) {
        if (!commandRegistry[c.name]) return { status: 400, body: { error: `Unknown command ${c.name}` } }
        if (role?.kind === 'driver') {
          if (!DRIVER_COMMANDS.has(c.name)) return { status: 403, body: { error: 'Drivers cannot perform this action' } }
        } else {
          const mod = moduleOfCommand(c.name, c.args)
          const posOk = POS_COMMANDS.has(c.name) && canAccess(role, 'pos')
          if (!posOk && (!mod || !canAccess(role, mod))) return { status: 403, body: { error: `Your role cannot perform ${c.name}` } }
        }
      }
      const driver = role?.kind === 'driver' ? state.db.drivers.find((d) => d.id === user.driverId) : undefined
      const ctx = { user: driver?.name ?? user.name, today: todayKey(), now: new Date().toISOString() }
      const r = await mutate((d) => {
        const queue = [...(ids ?? [])]
        setIdFactory((p) => queue.shift() ?? randomId(p))
        try {
          for (const c of commands) {
            const res = commandRegistry[c.name](d, ctx, ...(c.args ?? []))
            if (!res.ok) return res.error
          }
          return undefined
        } finally {
          setIdFactory(null)
        }
      })
      if (!r.ok) return { status: 422, body: { ok: false, error: r.error } }
      await storage.journalPut(key, r.version, user.id).catch(() => {})
      const changes = r.changes
      if (changes.users) changes.users.upsert = changes.users.upsert.map((u) => publicUser(u as unknown as AppUser) as unknown as Row)
      return { status: 200, body: { ok: true, version: r.version, changes, settings: r.state.db.settings, counters: r.state.db.counters } }
    }
    return { status: 404, body: { error: 'Not found' } }
  }

  return { handle }
}

/** in-memory storage (local testing) */
export function memoryStorage(initial: DB): Storage {
  const rowVer: State['rowVer'] = new Map()
  for (const c of COLLS(initial)) for (const r of (initial as unknown as Record<string, Row[]>)[c]) rowVer.set(rowKey(c, r), { coll: c, ver: 1 })
  let state: State = { db: initial, version: 1, rowVer }
  const journal = new Map<string, number>()
  return {
    load: async () => state,
    commit: async (prev, next, changes) => {
      if (prev.version !== state.version) return false
      const version = state.version + 1
      const rv = new Map(state.rowVer)
      for (const [coll, ch] of Object.entries(changes)) {
        for (const r of ch.upsert) rv.set(rowKey(coll, r), { coll, ver: version })
        for (const id of ch.delete) rv.set(id, { coll, ver: version, deleted: true })
      }
      state = { db: next, version, rowVer: rv }
      return version
    },
    journalGet: async (k) => journal.get(k),
    journalPut: async (k, v) => void journal.set(k, v),
  }
}
