/**
 * Role-based access control. Roles and users live in the database (editable in the
 * Users & Access module); this file holds the module catalogue and the default roles.
 */
import type { AccessRole, AppUser, DB } from '@/types'

export type ModuleKey =
  | 'dashboard' | 'purchases' | 'imports' | 'grn' | 'inventory' | 'customers' | 'sales' | 'fleet'
  | 'distribution' | 'collections' | 'settlement' | 'accounts' | 'reports' | 'settings' | 'access' | 'pos'

export const ALL_MODULES: ModuleKey[] = ['dashboard', 'pos', 'purchases', 'imports', 'grn', 'inventory', 'customers', 'sales', 'fleet', 'distribution', 'collections', 'settlement', 'accounts', 'reports', 'settings', 'access']

/** preferred order of bottom-tab shortcuts on phones; the first four the role can open are used */
const TAB_PRIORITY: ModuleKey[] = ['pos', 'dashboard', 'distribution', 'collections', 'settlement', 'grn', 'inventory', 'sales', 'accounts', 'customers', 'purchases', 'reports', 'fleet', 'imports', 'settings', 'access']
export const mobileTabsFor = (modules: string[]) => TAB_PRIORITY.filter((k) => modules.includes(k)).slice(0, 4)

export const DEFAULT_PASSWORD = 'Zad@2026'

export const defaultRoles = (): AccessRole[] => [
  { key: 'owner', label: 'Owner', description: 'Full access to every module, approvals and settings', kind: 'staff', modules: [...ALL_MODULES], system: true },
  { key: 'supervisor', label: 'Supervisor', description: 'Dispatch, routes, van loading, settlement review and stock', kind: 'staff', modules: ['dashboard', 'pos', 'grn', 'inventory', 'customers', 'sales', 'fleet', 'distribution', 'collections', 'settlement', 'reports'], system: true },
  { key: 'accountant', label: 'Accountant', description: 'Invoices, collections, receivables, payables and reports', kind: 'staff', modules: ['dashboard', 'purchases', 'imports', 'customers', 'sales', 'collections', 'settlement', 'accounts', 'reports'], system: true },
  { key: 'storekeeper', label: 'Store Keeper', description: 'Goods receiving, quality check, stock and van loading', kind: 'staff', modules: ['dashboard', 'purchases', 'imports', 'grn', 'inventory', 'distribution'], system: true },
  { key: 'cashier', label: 'Counter Cashier', description: 'Walk-in counter sales: weigh, bill and collect payment', kind: 'staff', modules: ['pos'], system: true },
  { key: 'driver', label: 'Driver', description: 'Driver app: route, deliveries, collections and settlement', kind: 'driver', modules: [], system: true },
]

export function defaultUsers(drivers: DB['drivers']): AppUser[] {
  const staff: AppUser[] = [
    { id: 'usr_owner', name: 'Abdulrahman Al Saleh', email: 'owner@alwahameat.sa', password: DEFAULT_PASSWORD, roleKey: 'owner', active: true },
    { id: 'usr_sup', name: 'Omar Saeed', email: 'supervisor@alwahameat.sa', password: DEFAULT_PASSWORD, roleKey: 'supervisor', active: true },
    { id: 'usr_acc', name: 'Sara Al Mutlaq', email: 'accounts@alwahameat.sa', password: DEFAULT_PASSWORD, roleKey: 'accountant', active: true },
    { id: 'usr_store', name: 'Ramesh Pillai', email: 'store@alwahameat.sa', password: DEFAULT_PASSWORD, roleKey: 'storekeeper', active: true },
    { id: 'usr_counter', name: 'Nouf Al Harbi', email: 'counter@alwahameat.sa', password: DEFAULT_PASSWORD, roleKey: 'cashier', active: true },
  ]
  const slug = (n: string) => n.toLowerCase().replace(/^(al )/, '').replace(/\b(al|bin) /g, '').replace(/[^a-z]+/g, '.').replace(/^\.|\.$/g, '')
  return [
    ...staff,
    ...drivers.map((d) => ({ id: `usr_${d.id}`, name: d.name, email: `${slug(d.name)}@alwahameat.sa`, password: DEFAULT_PASSWORD, roleKey: 'driver', driverId: d.id, active: d.status !== 'on_leave' })),
  ]
}

export function moduleForPath(pathname: string): ModuleKey {
  const seg = pathname.split('/').filter(Boolean)[0]
  return (seg && (ALL_MODULES as string[]).includes(seg) ? seg : 'dashboard') as ModuleKey
}
export const roleOf = (db: DB, user?: AppUser) => db.roles.find((r) => r.key === user?.roleKey)
export const canAccess = (role: AccessRole | undefined, key: ModuleKey) => !!role && role.kind === 'staff' && (role.key === 'owner' || role.modules.includes(key))
