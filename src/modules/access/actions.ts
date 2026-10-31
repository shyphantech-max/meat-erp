/** Users & Access transactions (run through useAction so they commit atomically). */
import { command } from '@/lib/commands'
import type { AccessRole, AppUser, DB, ID, Result } from '@/types'
import type { Ctx } from '@/store/logic'
import { log, uid } from '@/store/logic'
import { ALL_MODULES } from '@/lib/rbac'

const fail = (error: string): Result => ({ ok: false, error })
const activeOwners = (db: DB) => db.users.filter((u) => u.active && u.roleKey === 'owner')

export interface UserInput {
  id?: ID
  name: string
  email: string
  roleKey: string
  driverId?: ID
  active: boolean
  password?: string
}
function saveUser_(db: DB, ctx: Ctx, input: UserInput, currentUserId: ID): Result {
  const name = input.name.trim()
  const email = input.email.trim().toLowerCase()
  if (name.length < 3) return fail('Enter the full name')
  if (!/^\S+@\S+\.\S+$/.test(email)) return fail('Enter a valid email address')
  if (db.users.some((u) => u.email.toLowerCase() === email && u.id !== input.id)) return fail('Another user already uses this email')
  const role = db.roles.find((r) => r.key === input.roleKey)
  if (!role) return fail('Select a role')
  if (role.kind === 'driver') {
    if (!input.driverId) return fail('Link the driver profile for a driver account')
    if (db.users.some((u) => u.driverId === input.driverId && u.id !== input.id)) return fail('This driver already has a user account')
  }
  if (input.password !== undefined && input.password !== '' && input.password.length < 6) return fail('Password must be at least 6 characters')
  const existing = input.id ? db.users.find((u) => u.id === input.id) : undefined
  if (input.id && !existing) return fail('User not found')
  if (existing) {
    const losesOwner = existing.roleKey === 'owner' && existing.active && (input.roleKey !== 'owner' || !input.active)
    if (losesOwner && activeOwners(db).length <= 1) return fail('Keep at least one active Owner')
    if (existing.id === currentUserId && !input.active) return fail('You cannot deactivate your own account')
    Object.assign(existing, { name, email, roleKey: input.roleKey, driverId: role.kind === 'driver' ? input.driverId : undefined, active: input.active })
    if (input.password) existing.password = input.password
    log(db, ctx, 'User updated', `${name} · ${role.label}`)
    return { ok: true, id: existing.id }
  }
  if (!input.password) return fail('Set an initial password')
  const user: AppUser = { id: uid(db, 'usr'), name, email, password: input.password, roleKey: input.roleKey, driverId: role.kind === 'driver' ? input.driverId : undefined, active: input.active }
  db.users.push(user)
  log(db, ctx, 'User created', `${name} · ${role.label}`)
  return { ok: true, id: user.id }
}

function setUserActive_(db: DB, ctx: Ctx, id: ID, active: boolean, currentUserId: ID): Result {
  const u = db.users.find((x) => x.id === id)
  if (!u) return fail('User not found')
  if (!active && id === currentUserId) return fail('You cannot deactivate your own account')
  if (!active && u.roleKey === 'owner' && activeOwners(db).length <= 1) return fail('Keep at least one active Owner')
  u.active = active
  log(db, ctx, active ? 'User activated' : 'User deactivated', u.name)
  return { ok: true, id }
}

function setRoleModule_(db: DB, ctx: Ctx, roleKey: string, module: string, on: boolean): Result {
  const r = db.roles.find((x) => x.key === roleKey)
  if (!r) return fail('Role not found')
  if (r.key === 'owner') return fail('The Owner role always has full access')
  if (r.kind === 'driver') return fail('Drivers use the driver app only')
  if (!(ALL_MODULES as string[]).includes(module)) return fail('Unknown module')
  if (module === 'access' && on) return fail('Users & Access is reserved for the Owner')
  if (!on && r.modules.length === 1 && r.modules.includes(module)) return fail('A role needs at least one module')
  r.modules = on ? [...new Set([...r.modules, module])] : r.modules.filter((m) => m !== module)
  log(db, ctx, `Permission ${on ? 'granted' : 'removed'}`, `${r.label} · ${module}`)
  return { ok: true, id: roleKey }
}

function saveRole_(db: DB, ctx: Ctx, input: { key?: string; label: string; description: string; modules: string[] }): Result {
  const label = input.label.trim()
  if (label.length < 3) return fail('Enter a role name')
  if (db.roles.some((r) => r.label.toLowerCase() === label.toLowerCase() && r.key !== input.key)) return fail('A role with this name already exists')
  const modules = input.modules.filter((m) => m !== 'access' && (ALL_MODULES as string[]).includes(m))
  if (input.key) {
    const r = db.roles.find((x) => x.key === input.key)
    if (!r) return fail('Role not found')
    r.label = label
    r.description = input.description.trim()
    if (r.key !== 'owner' && r.kind === 'staff') {
      if (!modules.length) return fail('Select at least one module')
      r.modules = modules
    }
    log(db, ctx, 'Role updated', label)
    return { ok: true, id: r.key }
  }
  if (!modules.length) return fail('Select at least one module')
  let key = label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'role'
  while (db.roles.some((r) => r.key === key)) key += '_2'
  const role: AccessRole = { key, label, description: input.description.trim(), kind: 'staff', modules, system: false }
  db.roles.push(role)
  log(db, ctx, 'Role created', label)
  return { ok: true, id: key }
}

function deleteRole_(db: DB, ctx: Ctx, key: string): Result {
  const r = db.roles.find((x) => x.key === key)
  if (!r) return fail('Role not found')
  if (r.system) return fail('Built-in roles cannot be deleted')
  const n = db.users.filter((u) => u.roleKey === key).length
  if (n) return fail(`Move the ${n} user(s) to another role first`)
  db.roles = db.roles.filter((x) => x.key !== key)
  log(db, ctx, 'Role deleted', r.label)
  return { ok: true, id: key }
}

// ───────────────────────── command registry (recordable, shared with the Catalyst backend) ─────────────────────────
export const saveUser = command('saveUser', saveUser_)
export const setUserActive = command('setUserActive', setUserActive_)
export const setRoleModule = command('setRoleModule', setRoleModule_)
export const saveRole = command('saveRole', saveRole_)
export const deleteRole = command('deleteRole', deleteRole_)
