/**
 * Zoho Catalyst Advanced I/O function "api" for Zad ERP.
 * Built by `npm run build:backend` into backend/functions/api/index.js.
 *
 * Storage (Data Store, project Zad-ERP):
 *   ErpRecords(coll, doc_id unique, ver, deleted, data)  - one row per business record (JSON)
 *   ErpMeta(mkey unique, mval)                            - version (commit lock), settings, counters
 *   ErpJournal(txkey unique, ver, user_id, response)      - processed request keys (idempotency)
 * Data Store has no transactions: a commit first claims the next version with a conditional
 * UPDATE on ErpMeta('version'); only the winner writes its rows, others reload and retry.
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { DB } from '../../src/types'
import { createEngine, type Changes, type Row, type State, type Storage } from './engine'
import { buildSeed, emptyDB } from '../../src/data/seed'
import { todayKey } from '../../src/lib/format'
import { rowKey } from '../../src/lib/rowKey'

// provided by the function's node_modules (kept external when bundling)
import catalyst from 'zcatalyst-sdk-node'
import { randomBytes } from 'node:crypto'

const T_REC = 'ErpRecords'
const T_META = 'ErpMeta'
const T_JOURNAL = 'ErpJournal'
const MAX_TEXT = 9900
const STALE_CLAIM_MS = 30_000
let loadChain: Promise<unknown> = Promise.resolve()

const q = (s: string) => `'${String(s).replace(/'/g, "''")}'`
const truthy = (v: unknown) => v === true || v === 'true'

// warm-instance cache: full state + ROWIDs so later requests only read the delta
let cache: { state: State; rowid: Map<string, string>; metaRowid: Map<string, string>; versionRaw: string } | undefined
/** ErpMeta 'version' holds "<number>:<claim token>" so a claim can be verified by reading it back */
const verNum = (raw?: string) => Number(String(raw ?? '0').split(':')[0]) || 0

function catalystStorage(app: any): Storage {
  const zcql = app.zcql()
  const ds = app.datastore()

  async function select(table: string, cols: string, where = '') {
    const out: any[] = []
    for (let off = 0; ; off += 300) {
      const res = await zcql.executeZCQLQuery(`SELECT ${cols} FROM ${table}${where ? ` WHERE ${where}` : ''} ORDER BY ROWID LIMIT ${off}, 300`)
      const rows = (res ?? []).map((r: any) => r[table]).filter(Boolean)
      out.push(...rows)
      if (rows.length < 300) break
    }
    return out
  }

  async function readMeta() {
    const rows = await select(T_META, 'ROWID, mkey, mval')
    const meta = new Map<string, { rowid: string; val: string }>()
    for (const r of rows) meta.set(r.mkey, { rowid: String(r.ROWID), val: r.mval })
    return meta
  }

  function applyRows(state: State, rowid: Map<string, string>, rows: any[]) {
    const db = state.db as unknown as Record<string, Row[]>
    for (const r of rows) {
      const coll = r.coll as string
      const id = r.doc_id as string
      const ver = Number(r.ver)
      rowid.set(id, String(r.ROWID))
      if (!Array.isArray(db[coll])) continue
      const list = db[coll]
      const i = list.findIndex((x) => rowKey(coll, x) === id)
      if (truthy(r.deleted)) {
        if (i >= 0) list.splice(i, 1)
        state.rowVer.set(id, { coll, ver, deleted: true })
      } else {
        const doc = JSON.parse(r.data)
        if (i >= 0) list[i] = doc
        else list.push(doc)
        state.rowVer.set(id, { coll, ver })
      }
    }
  }

  async function refresh(): Promise<State> {
    const meta = await readMeta()
    const lock = meta.get('version')?.val ?? '0' // "<claimed n>:<epoch ms>:<nonce>"
    // readers only trust fully written commits; "committed" lags "version" while a commit is in progress
    const committed = Number(meta.get('committed')?.val ?? verNum(lock))
    if (!cache) {
      const state: State = { db: emptyDB(todayKey()), version: 0, rowVer: new Map() }
      const rowid = new Map<string, string>()
      applyRows(state, rowid, await select(T_REC, 'ROWID, coll, doc_id, ver, deleted, data', `ver <= ${committed}`))
      cache = { state, rowid, metaRowid: new Map(), versionRaw: lock }
    } else if (committed > cache.state.version) {
      // copy-on-write so states handed out earlier stay unchanged
      const db = { ...cache.state.db } as unknown as Record<string, Row[]>
      for (const k of Object.keys(db)) if (Array.isArray(db[k])) db[k] = [...db[k]]
      const base = cache.state.version
      const fresh: State = { db: db as unknown as DB, version: base, rowVer: new Map(cache.state.rowVer) }
      applyRows(fresh, cache.rowid, await select(T_REC, 'ROWID, coll, doc_id, ver, deleted, data', `ver > ${base} AND ver <= ${committed}`))
      cache.state = fresh
    }
    for (const [k, v] of meta) cache.metaRowid.set(k, v.rowid)
    cache.versionRaw = lock
    const settings = meta.get('settings')?.val
    const counters = meta.get('counters')?.val
    cache.state = {
      ...cache.state,
      version: committed,
      lock,
      db: { ...cache.state.db, ...(settings ? { settings: JSON.parse(settings) } : {}), ...(counters ? { counters: JSON.parse(counters) } : {}) },
    }
    return cache.state
  }

  return {
    // single-flight: concurrent requests in this instance refresh the cache one at a time, and a
    // new state is only published once it is complete (prevents stale-but-current-looking states)
    load() {
      const run = loadChain.then(refresh, refresh)
      loadChain = run.catch(() => undefined) as Promise<unknown>
      return run
    },

    async commit(prev, next, changes: Changes) {
      // 0) another commit in progress? wait for it, unless its claim is stale (crashed request)
      const claimed = verNum(prev.lock)
      if (claimed > prev.version) {
        const at = Number(String(prev.lock).split(':')[1] ?? 0)
        if (Date.now() - at < STALE_CLAIM_MS) return false
      }
      const nextVersion = Math.max(prev.version, claimed) + 1
      // 1) claim it: conditional on the exact lock THIS request loaded, then verify by reading back
      const claim = `${nextVersion}:${Date.now()}:${randomBytes(5).toString('hex')}`
      const vRow = cache!.metaRowid.get('version')
      if (!vRow) {
        if (prev.version !== 0 || (prev.lock && prev.lock !== '0')) return false
        try {
          const r = await ds.table(T_META).insertRow({ mkey: 'version', mval: claim })
          cache!.metaRowid.set('version', String(r.ROWID))
        } catch {
          return false // another request created it first (mkey is unique)
        }
      } else {
        await zcql.executeZCQLQuery(`UPDATE ${T_META} SET mval = ${q(claim)} WHERE mkey = 'version' AND mval = ${q(prev.lock ?? '0')}`)
        const check = await select(T_META, 'mval', `mkey = 'version'`)
        if (check[0]?.mval !== claim) return false // someone else won
      }
      // 2) write changed records
      const inserts: any[] = []
      const updates: any[] = []
      for (const [coll, ch] of Object.entries(changes)) {
        for (const r of ch.upsert) {
          const id = rowKey(coll, r)
          const data = JSON.stringify(r)
          if (data.length > MAX_TEXT) throw new Error(`Record ${id} is too large to store (${data.length} chars)`)
          const rowid = cache!.rowid.get(id)
          if (rowid) updates.push({ ROWID: rowid, coll, ver: nextVersion, deleted: false, data })
          else inserts.push({ coll, doc_id: id, ver: nextVersion, deleted: false, data })
        }
        for (const id of ch.delete) {
          const rowid = cache!.rowid.get(id)
          if (rowid) updates.push({ ROWID: rowid, coll, ver: nextVersion, deleted: true, data: '{}' })
        }
      }
      const table = ds.table(T_REC)
      for (let i = 0; i < inserts.length; i += 200) {
        const created = await table.insertRows(inserts.slice(i, i + 200))
        for (const c of created ?? []) cache!.rowid.set(c.doc_id, String(c.ROWID))
      }
      for (let i = 0; i < updates.length; i += 200) await table.updateRows(updates.slice(i, i + 200))
      // 3) settings & counters, then mark the commit as complete
      const metaT = ds.table(T_META)
      const upsertMeta = async (key: string, mval: string) => {
        const rowid = cache!.metaRowid.get(key)
        if (rowid) await metaT.updateRow({ ROWID: rowid, mval })
        else {
          const r = await metaT.insertRow({ mkey: key, mval })
          cache!.metaRowid.set(key, String(r.ROWID))
        }
      }
      if (next.settings !== prev.db.settings || !cache!.metaRowid.has('settings')) await upsertMeta('settings', JSON.stringify(next.settings))
      if (next.counters !== prev.db.counters || !cache!.metaRowid.has('counters')) await upsertMeta('counters', JSON.stringify(next.counters))
      await upsertMeta('committed', String(nextVersion))
      return nextVersion
    },

    async journalGet(key) {
      const rows = await select(T_JOURNAL, 'ver', `txkey = ${q(key)}`)
      return rows.length ? Number(rows[0].ver) : undefined
    },
    async journalPut(key, ver, userId) {
      await ds.table(T_JOURNAL).insertRow({ txkey: key, ver, user_id: userId })
    },
  }
}

const ALLOWED = (process.env.ZAD_ORIGINS ?? 'https://meat.erpdemo.xyz,http://localhost:5240,http://localhost:5242').split(',').map((s) => s.trim())
const originOk = (o: string) => ALLOWED.includes(o) || /^https:\/\/[a-z0-9-]+\.vercel\.app$/.test(o)

function readBody(req: IncomingMessage): Promise<any> {
  return new Promise((resolve) => {
    let s = ''
    req.on('data', (c) => (s += c))
    req.on('end', () => {
      try {
        resolve(s ? JSON.parse(s) : {})
      } catch {
        resolve({})
      }
    })
    req.on('error', () => resolve({}))
  })
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const origin = String(req.headers.origin ?? '')
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (origin && originOk(origin)) {
    headers['Access-Control-Allow-Origin'] = origin
    headers['Vary'] = 'Origin'
    headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
    headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization'
  }
  try {
    const secret = process.env.ZAD_SECRET
    if (!secret) throw new Error('ZAD_SECRET is not configured')
    const app = catalyst.initialize(req, { scope: 'admin' })
    const engine = createEngine(catalystStorage(app), { secret, seedSecret: process.env.ZAD_SEED_SECRET, buildSeed: () => buildSeed() })
    const url = new URL(req.url ?? '/', 'http://localhost')
    const body = req.method === 'POST' ? await readBody(req) : undefined
    const out = await engine.handle({ method: req.method ?? 'GET', path: url.pathname, query: url.searchParams, headers: req.headers, body })
    res.writeHead(out.status, headers)
    res.end(out.status === 204 ? '' : JSON.stringify(out.body))
  } catch (e) {
    console.error(e)
    res.writeHead(500, headers)
    res.end(JSON.stringify({ error: (e as Error).message }))
  }
}
