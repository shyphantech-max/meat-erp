/**
 * Command layer shared by the browser and the Catalyst backend.
 *
 * Every business transaction (logic.ts, access & settings actions) is wrapped with `command()`:
 *  - it is registered by name in `commandRegistry`, so the backend can execute the same rules;
 *  - while a recording is active, each successful *top-level* call is captured as
 *    { name, args } so the browser can send it to the API (nested calls are not recorded,
 *    because the server re-runs the outer command, which repeats them).
 *
 * IDs: in remote mode `setIdFactory` switches to globally unique ids, and every id generated
 * during a recorded run is captured so the server can reuse it (same record id on both sides).
 */
import type { DB, Result } from '@/types'

export interface RecordedCommand {
  name: string
  args: unknown[]
}
export interface Recording {
  commands: RecordedCommand[]
  ids: string[]
}

type CommandFn = (db: DB, ctx: any, ...args: any[]) => Result<any>
export const commandRegistry: Record<string, CommandFn> = {}

let depth = 0
let recording: Recording | null = null

/** wrap a transaction so it is registered and recordable; keeps the original signature (incl. generics) */
export function command<F extends CommandFn>(name: string, impl: F): F {
  commandRegistry[name] = impl
  const wrapped = ((db: DB, ctx: unknown, ...args: unknown[]) => {
    const top = depth === 0
    depth++
    try {
      const r = impl(db, ctx, ...args)
      if (top && recording && r && (r as { ok?: boolean }).ok) recording.commands.push({ name, args: JSON.parse(JSON.stringify(args ?? [])) })
      return r
    } finally {
      depth--
    }
  }) as F
  return wrapped
}

export function startRecording() {
  recording = { commands: [], ids: [] }
}
export function stopRecording(): Recording {
  const r = recording ?? { commands: [], ids: [] }
  recording = null
  return r
}

// ───── id generation ─────
let idFactory: ((prefix: string) => string) | null = null
/** remote mode: ids must be unique across devices (counter-based ids would collide) */
export function setIdFactory(f: ((prefix: string) => string) | null) {
  idFactory = f
}
export function makeId(prefix: string, fallback: () => string) {
  const id = idFactory ? idFactory(prefix) : fallback()
  recording?.ids.push(id)
  return id
}
export const randomId = (prefix: string) => {
  const rnd = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID().replace(/-/g, '').slice(0, 16) : Math.random().toString(36).slice(2, 18)
  return `${prefix}_${Date.now().toString(36)}${rnd}`
}
