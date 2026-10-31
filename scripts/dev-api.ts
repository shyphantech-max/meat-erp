/**
 * Local test server for the Zad ERP API - same engine as the Catalyst function
 * (backend/src/engine.ts), with in-memory storage instead of Data Store.
 *   npm run dev:api  →  http://localhost:5241
 */
import http from 'node:http'
import { buildSeed } from '../src/data/seed'
import { createEngine, hashPassword, memoryStorage } from '../backend/src/engine'

const PORT = Number(process.env.PORT ?? 5241)
const seed = buildSeed()
for (const u of seed.users) u.password = hashPassword(u.password)
const engine = createEngine(memoryStorage(seed), { secret: process.env.ZAD_SECRET ?? 'local-dev-secret' })

http
  .createServer(async (req, res) => {
    const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' }
    try {
      let raw = ''
      for await (const c of req) raw += c
      const url = new URL(req.url ?? '/', `http://localhost:${PORT}`)
      const out = await engine.handle({ method: req.method ?? 'GET', path: url.pathname, query: url.searchParams, headers: req.headers, body: raw ? JSON.parse(raw) : undefined })
      res.writeHead(out.status, headers)
      res.end(out.status === 204 ? '' : JSON.stringify(out.body))
    } catch (e) {
      res.writeHead(500, headers)
      res.end(JSON.stringify({ error: (e as Error).message }))
    }
  })
  .listen(PORT, () => console.log(`Zad ERP local API on http://localhost:${PORT}`))
