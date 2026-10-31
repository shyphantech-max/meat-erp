/**
 * Users & Access (RBAC): user accounts, role assignment and the module-permission matrix.
 * Owner-only by default. Changes apply immediately to sign-in, navigation and route guards.
 */
import { Fragment, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { ColumnDef } from '@tanstack/react-table'
import { KeyRound, Pencil, Plus, ShieldCheck, Smartphone, Trash2, UserCheck, UserPlus, Users, UserX } from 'lucide-react'
import type { AccessRole, AppUser } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DataTable } from '@/components/tables/DataTable'
import { Alert, Field, KpiCard, PageHeader, Panel, Picker, StatusBadge, useAction, useConfirm } from '@/components/common'
import { useStore } from '@/store/useStore'
import { useUI } from '@/store/useUI'
import { useT, useName } from '@/i18n'
import { NAV } from '@/data/nav'
import { ALL_MODULES, DEFAULT_PASSWORD } from '@/lib/rbac'
import { fmtAgo, initials } from '@/lib/format'
import { cn } from '@/lib/utils'
import { deleteRole, saveRole, saveUser, setRoleModule, setUserActive, type UserInput } from './actions'

const MODULE_LABEL = Object.fromEntries(NAV.flatMap((g) => g.items).map((i) => [i.key, i.label]))
const MODULE_GROUPS = NAV.map((g) => ({ label: g.label, items: g.items.map((i) => i.key) }))

export default function AccessPage() {
  const t = useT()
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') === 'roles' ? 'roles' : 'users'
  const users = useStore((s) => s.db.users)
  const roles = useStore((s) => s.db.roles)
  const driverRole = roles.find((r) => r.kind === 'driver')
  return (
    <div>
      <PageHeader title="Users & Access" description="Create user accounts, assign roles and choose exactly which modules each role can open." icon={ShieldCheck} />
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Users" value={users.length} icon={Users} />
        <KpiCard label="Active" value={users.filter((u) => u.active).length} icon={UserCheck} tone="success" />
        <KpiCard label="Office staff" value={users.filter((u) => u.roleKey !== driverRole?.key).length} icon={ShieldCheck} tone="navy" />
        <KpiCard label="Drivers" value={users.filter((u) => u.roleKey === driverRole?.key).length} icon={Smartphone} tone="warning" />
      </div>
      <Tabs value={tab} onValueChange={(v) => setParams({ tab: v }, { replace: true })} className="mb-4">
        <TabsList>
          <TabsTrigger value="users"><Users className="size-4" /> {t('Users')}</TabsTrigger>
          <TabsTrigger value="roles"><ShieldCheck className="size-4" /> {t('Roles & permissions')}</TabsTrigger>
        </TabsList>
      </Tabs>
      {tab === 'users' ? <UsersTab /> : <RolesTab />}
    </div>
  )
}

// ───────────── users ─────────────
function UsersTab() {
  const t = useT()
  const name = useName()
  const act = useAction()
  const confirm = useConfirm()
  const me = useUI((s) => s.userId)
  const users = useStore((s) => s.db.users)
  const roles = useStore((s) => s.db.roles)
  const drivers = useStore((s) => s.db.drivers)
  const [edit, setEdit] = useState<AppUser | 'new' | null>(null)
  const role = (k: string) => roles.find((r) => r.key === k)

  const toggle = async (u: AppUser) => {
    if (u.active && !(await confirm({ title: t('Deactivate {name}?', { name: u.name }), description: t('They will no longer be able to sign in.'), confirmText: t('Deactivate'), destructive: true }))) return
    act((db, ctx) => setUserActive(db, ctx, u.id, !u.active, me), u.active ? 'User deactivated' : 'User activated')
  }

  const columns = useMemo<ColumnDef<AppUser, any>[]>(
    () => [
      {
        accessorKey: 'name',
        header: 'User',
        cell: ({ row: { original: u } }) => (
          <div className="flex items-center gap-2.5">
            <span className={cn('flex size-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold', role(u.roleKey)?.kind === 'driver' ? 'bg-maroon-soft text-maroon' : 'bg-brand-soft text-brand')}>{initials(u.name)}</span>
            <div className="min-w-0">
              <div className="truncate font-medium">{u.name} {u.id === me && <span className="text-[11px] text-muted-foreground">({t('you')})</span>}</div>
              <div className="truncate text-[11.5px] text-muted-foreground">{u.email}</div>
            </div>
          </div>
        ),
      },
      { id: 'role', header: 'Role', accessorFn: (u) => role(u.roleKey)?.label ?? u.roleKey, cell: ({ getValue, row }) => <StatusBadge status="role" label={t(getValue())} tone={role(row.original.roleKey)?.kind === 'driver' ? 'navy' : 'brand'} /> },
      { id: 'driver', header: 'Driver profile', accessorFn: (u) => drivers.find((d) => d.id === u.driverId)?.name ?? '', cell: ({ row }) => { const d = drivers.find((x) => x.id === row.original.driverId); return d ? name(d) : <span className="text-muted-foreground">-</span> } },
      { id: 'access', header: 'Access', accessorFn: (u) => { const r = role(u.roleKey); return r?.kind === 'driver' ? 'Driver app' : r?.key === 'owner' ? 'All modules' : `${r?.modules.length ?? 0} modules` }, cell: ({ getValue }) => <span className="text-[12.5px] text-muted-foreground">{t(getValue())}</span> },
      { id: 'status', header: 'Status', accessorFn: (u) => (u.active ? 'active' : 'inactive'), cell: ({ getValue }) => <StatusBadge status={getValue()} /> },
      { id: 'login', header: 'Last sign-in', accessorFn: (u) => u.lastLoginAt ?? '', cell: ({ getValue }) => <span className="text-[12.5px] text-muted-foreground">{getValue() ? fmtAgo(getValue()) : t('Never')}</span> },
      {
        id: 'actions',
        header: '',
        enableSorting: false,
        cell: ({ row: { original: u } }) => (
          <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
            <Button size="sm" variant="ghost" onClick={() => setEdit(u)}><Pencil /> {t('Edit')}</Button>
            <Button size="sm" variant="ghost" className={u.active ? 'text-danger' : 'text-success'} onClick={() => toggle(u)}>
              {u.active ? <UserX /> : <UserCheck />} {u.active ? t('Deactivate') : t('Activate')}
            </Button>
          </div>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [roles, drivers, me, t, name],
  )
  return (
    <>
      <DataTable
        data={users}
        columns={columns}
        searchPlaceholder="Search users…"
        searchText={(u) => `${u.name} ${u.email} ${role(u.roleKey)?.label}`}
        facets={[
          { id: 'role', label: 'Role', value: (u) => role(u.roleKey)?.label },
          { id: 'status', label: 'Status', value: (u) => (u.active ? 'active' : 'inactive') },
        ]}
        onRowClick={(u) => setEdit(u)}
        exportName="users"
        toolbar={<Button size="sm" className="h-9" onClick={() => setEdit('new')}><UserPlus /> {t('Add user')}</Button>}
      />
      {edit && <UserDialog user={edit === 'new' ? undefined : edit} onClose={() => setEdit(null)} />}
    </>
  )
}

function UserDialog({ user, onClose }: { user?: AppUser; onClose: () => void }) {
  const t = useT()
  const name = useName()
  const act = useAction()
  const me = useUI((s) => s.userId)
  const roles = useStore((s) => s.db.roles)
  const drivers = useStore((s) => s.db.drivers)
  const users = useStore((s) => s.db.users)
  const [f, setF] = useState<UserInput>(() => ({ id: user?.id, name: user?.name ?? '', email: user?.email ?? '', roleKey: user?.roleKey ?? 'supervisor', driverId: user?.driverId, active: user?.active ?? true, password: user ? '' : DEFAULT_PASSWORD }))
  const role = roles.find((r) => r.key === f.roleKey)
  const freeDrivers = drivers.filter((d) => !users.some((u) => u.driverId === d.id && u.id !== user?.id))
  const save = () => {
    const r = act((db, ctx) => saveUser(db, ctx, f, me), user ? 'User updated' : 'User created')
    if (r.ok) onClose()
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>{user ? t('Edit user') : t('Add user')}</DialogTitle></DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Full name" required className="sm:col-span-2"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <Field label="Email" required className="sm:col-span-2"><Input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} placeholder="name@alwahameat.sa" /></Field>
          <Field label="Role" required>
            <Picker value={f.roleKey} onChange={(v) => setF({ ...f, roleKey: v, driverId: roles.find((r) => r.key === v)?.kind === 'driver' ? f.driverId : undefined })} options={roles.map((r) => ({ value: r.key, label: t(r.label) }))} />
          </Field>
          {role?.kind === 'driver' ? (
            <Field label="Driver profile" required>
              <Picker value={f.driverId} onChange={(v) => setF({ ...f, driverId: v, name: f.name || drivers.find((d) => d.id === v)?.name || '' })} options={freeDrivers.map((d) => ({ value: d.id, label: name(d) }))} placeholder="Select driver" />
            </Field>
          ) : (
            <div className="flex items-end">
              <label className="flex h-9 items-center gap-2 text-[13px]"><Switch checked={f.active} onCheckedChange={(v) => setF({ ...f, active: v })} /> {t('Active')}</label>
            </div>
          )}
          {role?.kind === 'driver' && (
            <label className="flex items-center gap-2 text-[13px] sm:col-span-2"><Switch checked={f.active} onCheckedChange={(v) => setF({ ...f, active: v })} /> {t('Active')}</label>
          )}
          <Field label={user ? 'New password' : 'Password'} required={!user} hint={user ? 'Leave blank to keep the current password' : 'At least 6 characters'} className="sm:col-span-2">
            <div className="relative">
              <KeyRound className="absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} className="ps-9" />
            </div>
          </Field>
        </div>
        {role && (
          <Alert tone={role.kind === 'driver' ? 'navy' : 'brand'} icon={role.kind === 'driver' ? Smartphone : ShieldCheck}>
            <span className="font-semibold">{t(role.label)}:</span> {t(role.description)}
          </Alert>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t('Cancel')}</Button>
          <Button onClick={save}>{user ? t('Save changes') : t('Create user')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ───────────── roles & permissions ─────────────
function RolesTab() {
  const t = useT()
  const act = useAction()
  const confirm = useConfirm()
  const roles = useStore((s) => s.db.roles)
  const users = useStore((s) => s.db.users)
  const staffRoles = roles.filter((r) => r.kind === 'staff')
  const [edit, setEdit] = useState<AccessRole | 'new' | null>(null)
  const has = (r: AccessRole, m: string) => r.key === 'owner' || r.modules.includes(m)
  const toggle = (r: AccessRole, m: string, on: boolean) => act((db, ctx) => setRoleModule(db, ctx, r.key, m, on), on ? 'Access granted' : 'Access removed')
  const remove = async (r: AccessRole) => {
    if (await confirm({ title: t('Delete role {name}?', { name: t(r.label) }), confirmText: t('Delete'), destructive: true })) act((db, ctx) => deleteRole(db, ctx, r.key), 'Role deleted')
  }
  return (
    <div className="space-y-4">
      {/* role cards */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {roles.map((r) => {
          const n = users.filter((u) => u.roleKey === r.key).length
          return (
            <div key={r.key} className="rounded-xl border bg-card p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{t(r.label)}</span>
                    {!r.system && <span className="rounded-full bg-info-soft px-1.5 text-[10.5px] font-semibold text-info">{t('Custom')}</span>}
                  </div>
                  <p className="mt-0.5 text-[12.5px] text-muted-foreground">{t(r.description)}</p>
                </div>
                <div className="flex shrink-0 gap-1">
                  {r.kind === 'staff' && r.key !== 'owner' && <Button size="icon-sm" variant="ghost" onClick={() => setEdit(r)} aria-label={t('Edit')}><Pencil /></Button>}
                  {!r.system && <Button size="icon-sm" variant="ghost" className="text-danger" onClick={() => remove(r)} aria-label={t('Delete')}><Trash2 /></Button>}
                </div>
              </div>
              <div className="mt-3 flex items-center justify-between text-[12px] text-muted-foreground">
                <span>{t('{n} users', { n })}</span>
                <span>{r.kind === 'driver' ? t('Driver app') : r.key === 'owner' ? t('All modules') : t('{n} of {m} modules', { n: r.modules.length, m: ALL_MODULES.length })}</span>
              </div>
            </div>
          )
        })}
        <button onClick={() => setEdit('new')} className="flex min-h-[110px] flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed text-[13px] font-medium text-muted-foreground hover:border-brand hover:text-brand">
          <Plus className="size-5" /> {t('New role')}
        </button>
      </div>

      {/* permission matrix: desktop table */}
      <Panel title="Module permissions" description="Tick a box to let a role open that module. The Owner always has full access; drivers use the driver app only." bodyClassName="p-0">
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-[640px] text-[13px]">
            <thead>
              <tr className="border-b bg-muted/40 text-[11.5px] text-muted-foreground">
                <th className="px-4 py-2.5 text-start font-semibold">{t('Module')}</th>
                {staffRoles.map((r) => <th key={r.key} className="px-3 py-2.5 text-center font-semibold">{t(r.label)}</th>)}
              </tr>
            </thead>
            <tbody>
              {MODULE_GROUPS.map((g) => (
                <Fragment key={g.label}>
                  <tr className="bg-muted/20"><td colSpan={staffRoles.length + 1} className="px-4 py-1.5 text-[10.5px] font-semibold tracking-wide text-muted-foreground uppercase">{t(g.label)}</td></tr>
                  {g.items.map((m) => (
                    <tr key={m} className="border-b last:border-0">
                      <td className="px-4 py-2 font-medium">{t(MODULE_LABEL[m] ?? m)}</td>
                      {staffRoles.map((r) => (
                        <td key={r.key} className="px-3 py-2 text-center">
                          <Checkbox checked={has(r, m)} disabled={r.key === 'owner' || m === 'access'} onCheckedChange={(v) => toggle(r, m, !!v)} aria-label={`${r.label} · ${m}`} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
        {/* phones: one card per role with switches */}
        <div className="divide-y md:hidden">
          {staffRoles.filter((r) => r.key !== 'owner').map((r) => (
            <details key={r.key} className="group px-4 py-3">
              <summary className="flex cursor-pointer list-none items-center justify-between font-semibold">
                {t(r.label)} <span className="text-[12px] font-normal text-muted-foreground">{t('{n} of {m} modules', { n: r.modules.length, m: ALL_MODULES.length })}</span>
              </summary>
              <div className="mt-2 space-y-1">
                {ALL_MODULES.filter((m) => m !== 'access').map((m) => (
                  <label key={m} className="flex items-center justify-between py-1.5 text-[13px]">
                    {t(MODULE_LABEL[m] ?? m)}
                    <Switch checked={has(r, m)} onCheckedChange={(v) => toggle(r, m, v)} />
                  </label>
                ))}
              </div>
            </details>
          ))}
        </div>
      </Panel>
      {edit && <RoleDialog role={edit === 'new' ? undefined : edit} onClose={() => setEdit(null)} />}
    </div>
  )
}

function RoleDialog({ role, onClose }: { role?: AccessRole; onClose: () => void }) {
  const t = useT()
  const act = useAction()
  const roles = useStore((s) => s.db.roles)
  const [label, setLabel] = useState(role?.label ?? '')
  const [description, setDescription] = useState(role?.description ?? '')
  const [modules, setModules] = useState<string[]>(role?.modules ?? ['dashboard'])
  const copyable = roles.filter((r) => r.kind === 'staff' && r.key !== role?.key)
  const save = () => {
    const r = act((db, ctx) => saveRole(db, ctx, { key: role?.key, label, description, modules }), role ? 'Role updated' : 'Role created')
    if (r.ok) onClose()
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader><DialogTitle>{role ? t('Edit role') : t('New role')}</DialogTitle></DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Role name" required><Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder={t('e.g. Sales Executive')} /></Field>
          <Field label="Copy permissions from">
            <Picker value="" onChange={(v) => setModules([...(roles.find((r) => r.key === v)?.modules ?? [])].filter((m) => m !== 'access'))} options={copyable.map((r) => ({ value: r.key, label: t(r.label) }))} placeholder="Select role" />
          </Field>
          <Field label="Description" className="sm:col-span-2"><Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
        </div>
        <div>
          <div className="mb-2 text-[12.5px] font-medium">{t('Modules')}</div>
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {ALL_MODULES.filter((m) => m !== 'access').map((m) => (
              <label key={m} className={cn('flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-[13px]', modules.includes(m) && 'border-brand bg-brand-soft')}>
                <Checkbox checked={modules.includes(m)} onCheckedChange={(v) => setModules(v ? [...modules, m] : modules.filter((x) => x !== m))} />
                {t(MODULE_LABEL[m] ?? m)}
              </label>
            ))}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t('Cancel')}</Button>
          <Button onClick={save}>{role ? t('Save changes') : t('Create role')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
