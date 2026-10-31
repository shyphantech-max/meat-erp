# Zad ERP - backend API contract (Zoho Catalyst)

The React app stays on Vercel. The backend runs on Zoho Catalyst. They connect through the small
HTTP API below. `scripts/dev-api.ts` is a working, in-memory reference implementation of this
contract (`npm run dev:api`); the Catalyst function keeps the same routes and flow and stores data in
Data Store instead of memory.

## Switching the frontend to the backend

Vercel → Project → Settings → Environment Variables:

| Variable | Value |
| --- | --- |
| `VITE_DATA_MODE` | `remote` |
| `VITE_API_URL` | `https://zad-erp-60086771438.development.catalystserverless.in/server/api` (Development) |

Without these (or with `VITE_DATA_MODE=local`) the app keeps working exactly as today, fully in the
browser. Local test: `npm run dev:api` + `npm run dev:remote` → http://localhost:5242.

## How data flows

1. Sign-in: `POST /auth/login` → token; then `GET /snapshot` fills the app.
2. Every user action runs instantly in the browser (same rules as the server, in `src/store/logic.ts`)
   and is recorded as named commands, e.g. `[{ name: "approveGRN", args: ["grn_x"] }]`.
3. Commands are queued (saved in the browser, so drivers can work without signal) and sent in order to
   `POST /commands` with an idempotency `key`. The server re-runs the same commands with the same rules
   and returns the changed rows, which replace the browser's copy.
4. Every 60 s (and when the tab regains focus) `GET /changes?since=<version>` pulls other users' changes.

## Endpoints

All responses are JSON. All except `/auth/login` and `/health` need the session token as the
`?t=<token>` query parameter (an `Authorization` header is also accepted locally, but Catalyst's gateway
intercepts it). The browser sends POST bodies as `text/plain` JSON so requests are CORS "simple
requests" (no preflight). The function answers CORS for `https://meat.erpdemo.xyz`, `*.vercel.app` and
localhost (`ZAD_ORIGINS`).

| Method & path | Body / query | Response |
| --- | --- | --- |
| `GET /health` | - | `{ ok: true, version }` |
| `POST /auth/login` | `{ email, password }` | `200 { token, user }` · `401 { error }` · `403 { error }` (deactivated) |
| `POST /auth/logout` | - | `{ ok: true }` |
| `GET /snapshot` | - | `{ version, db }` - full `DB` (see `src/types.ts`) the user may see; never include passwords |
| `GET /changes?since=n` | - | `{ version, changes, settings, counters }` |
| `POST /commands` | `{ key, commands: [{ name, args }], ids: string[] }` | `200 { ok: true, version, results, changes, settings, counters }` · `422 { ok: false, error }` (business rule) · `403 { error }` (role) · `401` (session) |

`changes` = `{ [collection]: { upsert: Row[], delete: string[] } }`, e.g. `{ invoices: { upsert: [...] }, batches: {...} }`.

### Rules for `POST /commands`

- **Idempotent:** store each `key` with its response; a repeated key returns the stored response and
  changes nothing (the browser retries after network errors).
- **All or nothing:** run the request's commands in order; if any returns `{ ok: false }`, write nothing
  and answer `422` with its `error`.
- **Same ids:** `ids` lists the record ids the browser generated, in order; use them (pop from the front)
  when the logic creates records, so the browser and server refer to the same rows. Document numbers
  (INV-…, GRN-…) are allocated by the server from its counters.
- **RBAC:** check every command with `moduleOfCommand()` + the user's role (`src/lib/commandAccess.ts`,
  `src/lib/rbac.ts`). Drivers may only run `DRIVER_COMMANDS`, for their own `driverId`. The Owner may run
  everything. The counter cashier may run `directInvoice` + `recordPayment` (POS).
- **Who did it:** build `ctx = { user: <name>, today, now }` on the server (never trust the browser).

### Commands (32)

Implemented in `src/store/logic.ts`, `src/modules/access/actions.ts`, `src/modules/settings/actions.ts`
and registered in `commandRegistry` (`src/lib/commands.ts`). The args are exactly the function
arguments after `(db, ctx)`.

| Module | Commands |
| --- | --- |
| Masters | `upsertMaster(collection, item, prefix)`, `assignVehicle(driverId, vehicleId)` |
| Purchases & imports | `createPO(input, id?)`, `setPOStatus(id, action, reason?)`, `paySupplier(input)`, `createShipment(input)`, `advanceShipment(id, status, at, note?)` |
| GRN | `createGRN(input)`, `qcGRN(id, lines, notes)`, `approveGRN(id)`, `rejectGRN(id, reason)` |
| Inventory | `transferStock(input)`, `adjustStock(input)` |
| Distribution | `loadVan(input)`, `returnToWarehouse(input)`, `recordVanLoss(input)`, `assignOrders(soIds, driverId, date)`, `reorderRoute(deliveryId, dir)`, `setOutForDelivery(deliveryId)`, `completeDelivery(input)`, `vanSale(input)` |
| Sales | `createSalesOrder(input)`, `cancelSalesOrder(id, reason)`, `directInvoice(input)`, `voidInvoice(id, reason)`, `salesReturn(input)` |
| Collections | `recordPayment(input)`, `verifyPayment(id, decision, note?)` |
| Settlement | `submitSettlement(input)`, `advanceSettlement(id, to, opts?)` |
| Users & Access | `saveUser(input, currentUserId)`, `setUserActive(id, active, currentUserId)`, `setRoleModule(roleKey, module, on)`, `saveRole(input)`, `deleteRole(key)` |
| Settings | `updateSettings(patch)` |

## Catalyst deployment (live)

| | |
| --- | --- |
| Org / project | Vikas Saroj (60086771438) / **Zad-ERP** (64503000000104001), IN data centre |
| Function | `api` (Advanced I/O, Node 20), source `backend/src/catalyst.ts` + `backend/src/engine.ts` |
| Development URL | https://zad-erp-60086771438.development.catalystserverless.in/server/api/ |
| Data Store | `ErpRecords` (coll, doc_id, ver, deleted, data), `ErpMeta` (mkey, mval), `ErpJournal` (txkey, ver, user_id, response) |

Commands (from the repo root):

```bash
npm run build:backend        # bundle backend → backend/functions/api/index.js (+ generated catalyst-config.json)
npm run deploy:backend       # build + catalyst deploy --only functions (Development)
cd backend && set -a && . ./.secrets/env && set +a && catalyst serve   # run locally against Development data
```

Secrets live in `backend/.secrets/env` (git-ignored): `ZAD_SECRET` (signs sessions, deployed with the
function) and `ZAD_SEED_SECRET` (only for the one-time `POST /admin/seed` via local `catalyst serve`;
never deployed). Passwords are stored as scrypt hashes and never returned by the API.

**Writes without transactions:** every commit claims the next change number in `ErpMeta.version`
(conditional update, verified by reading back a unique token), writes its rows, then sets
`ErpMeta.committed`. Readers only use committed rows; a request that finds a commit in progress waits
and retries; a claim abandoned for 30 s is taken over. Inside one function instance the cache refresh
is single-flight. Verified with parallel writes (no lost updates).

## Catalyst implementation plan

| Piece | Catalyst service |
| --- | --- |
| API (all routes above) | one **Advanced I/O function** `api` (Node.js 20, Express), bundling `src/store/logic.ts`, `src/lib/*` |
| Tables (one per `DB` collection in `src/types.ts`; nested lines as child tables or JSON text columns) | **Data Store** |
| Sessions, short record locks, cached dashboard figures | **Cache** |
| Delivery photos, GRN photos, PDF invoices | **Stratus** |
| Expiry / ageing alerts, daily summaries, journal repair | **Job Scheduling** |
| Data residency | Saudi data centre (catalyst.zoho.sa) |

Data Store has no multi-statement transactions. The function therefore:

1. loads only the rows a request needs into a `DB`-shaped object,
2. runs the shared commands on it (same code as above),
3. diffs before/after (see `diff()` in `scripts/dev-api.ts`) and writes only changed rows with bulk insert/update,
4. records the request in a `Journal` table first (by idempotency key) and marks it done at the end; a
   scheduled job completes or reverses any request left half-done,
5. holds a short Cache lock per driver / batch / invoice while writing, so two users can't change the
   same stock at once.

Passwords: store a salted hash (e.g. scrypt/bcrypt) - never plain text - and drop the demo passwords.
