import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import type { ColumnDef } from '@tanstack/react-table'
import { Building2, Database, Download, FileJson, History, Languages, Pencil, Percent, Plus, RotateCcw, Save, Settings as SettingsIcon, ShieldCheck, Smartphone, Timer, UserCog, Warehouse as WarehouseIcon } from 'lucide-react'
import type { Warehouse } from '@/types'
import * as L from '@/store/logic'
import { useStore } from '@/store/useStore'
import { useUI } from '@/store/useUI'
import { useT, useName } from '@/i18n'
import { fmtDate, fmtDateTime, fmtKg, fmtNum, fmtSAR, todayKey } from '@/lib/format'
import { download } from '@/lib/export'
import { cn } from '@/lib/utils'
import { Alert, Field, NumInput, PageHeader, Panel, Stat, useAction } from '@/components/common'
import { DataTable } from '@/components/tables/DataTable'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useResetDemo } from '@/components/layout/Header'
import { ALL_MODULES } from '@/lib/rbac'
import { NAV } from '@/data/nav'
import { invoiceTotals, warehouseStock } from '@/store/derive'
import { updateSettings, type SettingsPatch } from './actions'

const TABS = [
  { value: 'company', label: 'Company', icon: Building2 },
  { value: 'tax', label: 'Tax & invoicing', icon: Percent },
  { value: 'operations', label: 'Inventory & settlement', icon: Timer },
  { value: 'warehouses', label: 'Warehouses', icon: WarehouseIcon },
  { value: 'preferences', label: 'Preferences', icon: Languages },
  { value: 'data', label: 'Data', icon: Database },
  { value: 'audit', label: 'Audit log', icon: History },
]

export default function SettingsPage() {
  const t = useT()
  const [sp, setSp] = useSearchParams()
  const tab = sp.get('tab') ?? 'company'
  return (
    <div>
      <PageHeader title="Settings" description="Company profile, VAT, thresholds, warehouses, language, access and data." icon={SettingsIcon} />
      <Tabs value={tab} onValueChange={(v) => setSp({ tab: v }, { replace: true })}>
        <TabsList>
          {TABS.map((x) => (
            <TabsTrigger key={x.value} value={x.value}>
              <x.icon /> {t(x.label)}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="company"><CompanySection /></TabsContent>
        <TabsContent value="tax"><TaxSection /></TabsContent>
        <TabsContent value="operations"><OperationsSection /></TabsContent>
        <TabsContent value="warehouses"><WarehousesSection /></TabsContent>
        <TabsContent value="preferences"><PreferencesSection /></TabsContent>
        <TabsContent value="data"><DataSection /></TabsContent>
        <TabsContent value="audit"><AuditSection /></TabsContent>
      </Tabs>
    </div>
  )
}

/** local copy of the settings, saved with validation */
function useSettingsForm<K extends keyof SettingsPatch>(keys: K[]) {
  const settings = useStore((s) => s.db.settings)
  const act = useAction()
  const initial = useMemo(() => Object.fromEntries(keys.map((k) => [k, settings[k]])) as unknown as Pick<SettingsPatch, K>, [settings]) // eslint-disable-line react-hooks/exhaustive-deps
  const [form, setForm] = useState(initial)
  const dirty = keys.some((k) => form[k] !== initial[k])
  const set = <F extends K>(k: F, v: SettingsPatch[F]) => setForm((f) => ({ ...f, [k]: v }))
  const save = () => act((db, ctx) => updateSettings(db, ctx, form), 'Settings saved')
  return { form, set, save, dirty, reset: () => setForm(initial) }
}

function SaveBar({ dirty, onSave, onReset }: { dirty: boolean; onSave: () => void; onReset: () => void }) {
  const t = useT()
  return (
    <div className="mt-4 flex justify-end gap-2 border-t pt-4">
      <Button variant="outline" disabled={!dirty} onClick={onReset}>{t('Cancel')}</Button>
      <Button disabled={!dirty} onClick={onSave}><Save /> {t('Save changes')}</Button>
    </div>
  )
}

function CompanySection() {
  const f = useSettingsForm(['companyName', 'companyNameAr', 'crNo', 'vatNo', 'address', 'phone', 'email'])
  return (
    <Panel title="Company profile" description="Shown on invoices, receipts, loading slips and settlement reports." icon={Building2}>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Company name (English)" required><Input value={f.form.companyName} onChange={(e) => f.set('companyName', e.target.value)} /></Field>
        <Field label="Company name (Arabic)"><Input dir="rtl" value={f.form.companyNameAr} onChange={(e) => f.set('companyNameAr', e.target.value)} /></Field>
        <Field label="Commercial Registration (CR) no." hint="10 digits"><Input value={f.form.crNo} onChange={(e) => f.set('crNo', e.target.value)} inputMode="numeric" /></Field>
        <Field label="VAT registration no." hint="15 digits, starts and ends with 3"><Input value={f.form.vatNo} onChange={(e) => f.set('vatNo', e.target.value)} inputMode="numeric" /></Field>
        <Field label="Phone"><Input value={f.form.phone} onChange={(e) => f.set('phone', e.target.value)} /></Field>
        <Field label="Email"><Input type="email" value={f.form.email} onChange={(e) => f.set('email', e.target.value)} /></Field>
        <Field label="Address" className="md:col-span-2"><Textarea value={f.form.address} onChange={(e) => f.set('address', e.target.value)} className="min-h-16" /></Field>
      </div>
      <SaveBar dirty={f.dirty} onSave={f.save} onReset={f.reset} />
    </Panel>
  )
}

function TaxSection() {
  const t = useT()
  const f = useSettingsForm(['vatRate', 'invoicePrefix'])
  const example = invoiceTotals([{ qtyKg: 100, price: 11.5 }], f.form.vatRate ?? 0)
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Panel title="VAT & invoice numbering" icon={Percent} className="lg:col-span-2">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="VAT rate (%)" hint="Saudi standard rate is 15%. Applies to new invoices only; existing invoices keep their rate.">
            <NumInput value={f.form.vatRate ?? 0} onChange={(v) => f.set('vatRate', v)} />
          </Field>
          <Field label="Invoice number prefix" hint="2-6 capital letters or digits, e.g. INV">
            <Input value={f.form.invoicePrefix} onChange={(e) => f.set('invoicePrefix', e.target.value.toUpperCase())} maxLength={6} />
          </Field>
        </div>
        <Alert tone="info" icon={ShieldCheck} className="mt-4">
          {t('Invoices print as simplified tax invoices. Connecting to ZATCA Fatoora e-invoicing (XML, cryptographic stamp and QR) is a separate integration.')}
        </Alert>
        <SaveBar dirty={f.dirty} onSave={f.save} onReset={f.reset} />
      </Panel>
      <Panel title="Preview" description="100 kg × SAR 11.50">
        <div className="space-y-1.5 text-[13px]">
          <div className="flex justify-between"><span className="text-muted-foreground">{t('Next invoice no.')}</span><span className="font-medium">{f.form.invoicePrefix}-{todayKey().slice(0, 4)}-0xxxx</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">{t('Subtotal')}</span><span className="tabular">{fmtSAR(example.subtotal)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">{t('VAT')} {f.form.vatRate}%</span><span className="tabular">{fmtSAR(example.vat)}</span></div>
          <div className="flex justify-between border-t pt-1.5 font-semibold"><span>{t('Total')}</span><span className="tabular">{fmtSAR(example.total)}</span></div>
        </div>
      </Panel>
    </div>
  )
}

function OperationsSection() {
  const f = useSettingsForm(['nearExpiryFrozenDays', 'nearExpiryChilledDays', 'nearExpiryFreshDays', 'cashVarianceToleranceSAR'])
  return (
    <Panel title="Inventory & settlement thresholds" icon={Timer}>
      <div className="grid gap-4 md:grid-cols-3">
        <Field label="Near-expiry: frozen (days)" hint="Frozen batches within this many days of expiry are flagged"><NumInput value={f.form.nearExpiryFrozenDays ?? 0} onChange={(v) => f.set('nearExpiryFrozenDays', Math.round(v))} step="1" /></Field>
        <Field label="Near-expiry: chilled (days)"><NumInput value={f.form.nearExpiryChilledDays ?? 0} onChange={(v) => f.set('nearExpiryChilledDays', Math.round(v))} step="1" /></Field>
        <Field label="Near-expiry: fresh (days)"><NumInput value={f.form.nearExpiryFreshDays ?? 0} onChange={(v) => f.set('nearExpiryFreshDays', Math.round(v))} step="1" /></Field>
        <Field label="Cash variance tolerance (SAR)" hint="Settlements with a larger shortage/excess are flagged and need supervisor remarks"><NumInput value={f.form.cashVarianceToleranceSAR ?? 0} onChange={(v) => f.set('cashVarianceToleranceSAR', v)} /></Field>
      </div>
      <SaveBar dirty={f.dirty} onSave={f.save} onReset={f.reset} />
    </Panel>
  )
}

const EMPTY_WH: Omit<Warehouse, 'id'> = { code: '', name: '', nameAr: '', city: '', address: '', capacityKg: 100000, manager: '' }
function WarehousesSection() {
  const t = useT()
  const name = useName()
  const db = useStore((s) => s.db)
  const act = useAction()
  const [edit, setEdit] = useState<(Omit<Warehouse, 'id'> & { id?: string }) | null>(null)
  const [err, setErr] = useState<string>()
  const save = () => {
    if (!edit) return
    if (!edit.code.trim() || !edit.name.trim() || !edit.city.trim()) return setErr('Code, name and city are required')
    if (!(edit.capacityKg > 0)) return setErr('Capacity must be greater than zero')
    if (db.warehouses.some((w) => w.code.toLowerCase() === edit.code.trim().toLowerCase() && w.id !== edit.id)) return setErr('Warehouse code already exists')
    const r = act((d, ctx) => L.upsertMaster<Warehouse>(d, ctx, 'warehouses', { ...edit, code: edit.code.trim().toUpperCase() }, 'wh'), edit.id ? 'Warehouse updated' : 'Warehouse added')
    if (r.ok) setEdit(null)
  }
  return (
    <Panel title="Warehouses" description="Cold stores and distribution hubs" icon={WarehouseIcon} actions={<Button size="sm" onClick={() => { setErr(undefined); setEdit({ ...EMPTY_WH }) }}><Plus /> {t('Add warehouse')}</Button>}>
      <div className="grid gap-3 md:grid-cols-3">
        {db.warehouses.map((w) => {
          const kg = db.products.reduce((s, p) => s + warehouseStock(db, p.id, w.id), 0)
          const pct = (kg / w.capacityKg) * 100
          return (
            <div key={w.id} className="rounded-xl border p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-[11px] font-semibold text-brand">{w.code}</div>
                  <div className="truncate font-semibold">{name(w)}</div>
                  <div className="text-[12px] text-muted-foreground">{w.city} · {w.manager}</div>
                </div>
                <Button variant="ghost" size="icon-sm" onClick={() => { setErr(undefined); setEdit({ ...w }) }} aria-label={t('Edit')}><Pencil /></Button>
              </div>
              <div className="mt-3 flex justify-between text-[12px]"><span className="text-muted-foreground">{t('Utilisation')}</span><span className="tabular">{fmtKg(kg, 0)} / {fmtKg(w.capacityKg, 0)}</span></div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted"><div className={cn('h-full rounded-full', pct > 85 ? 'bg-warning' : 'bg-brand')} style={{ width: `${Math.min(100, pct)}%` }} /></div>
              <p className="mt-2 truncate text-[11.5px] text-muted-foreground">{w.address}</p>
            </div>
          )
        })}
      </div>
      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t(edit?.id ? 'Edit warehouse' : 'Add warehouse')}</DialogTitle></DialogHeader>
          {edit && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Code" required><Input value={edit.code} onChange={(e) => setEdit({ ...edit, code: e.target.value })} placeholder="RUH-CS2" /></Field>
              <Field label="City" required><Input value={edit.city} onChange={(e) => setEdit({ ...edit, city: e.target.value })} /></Field>
              <Field label="Name (English)" required className="sm:col-span-2"><Input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
              <Field label="Name (Arabic)" className="sm:col-span-2"><Input dir="rtl" value={edit.nameAr} onChange={(e) => setEdit({ ...edit, nameAr: e.target.value })} /></Field>
              <Field label="Capacity (KG)" required><NumInput value={edit.capacityKg} onChange={(v) => setEdit({ ...edit, capacityKg: v })} /></Field>
              <Field label="Manager"><Input value={edit.manager} onChange={(e) => setEdit({ ...edit, manager: e.target.value })} /></Field>
              <Field label="Address" className="sm:col-span-2"><Input value={edit.address} onChange={(e) => setEdit({ ...edit, address: e.target.value })} /></Field>
              {err && <p className="text-[12.5px] text-danger sm:col-span-2">{t(err)}</p>}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEdit(null)}>{t('Cancel')}</Button>
            <Button onClick={save}><Save /> {t('Save')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Panel>
  )
}

function PreferencesSection() {
  const t = useT()
  const name = useName()
  const nav = useNavigate()
  const { lang, setLang } = useUI()
  const roles = useStore((s) => s.db.roles)
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel title="Language & layout" icon={Languages}>
        <div className="grid grid-cols-2 gap-3">
          {(['en', 'ar'] as const).map((l) => (
            <button key={l} onClick={() => setLang(l)} className={cn('rounded-xl border p-4 text-start transition-colors', lang === l ? 'border-brand bg-brand-soft' : 'hover:bg-muted')}>
              <div className="text-[16px] font-semibold">{l === 'en' ? 'English' : 'العربية'}</div>
              <div className="text-[12px] text-muted-foreground">{l === 'en' ? t('Left-to-right layout') : t('Right-to-left layout (RTL)')}</div>
            </button>
          ))}
        </div>
        <p className="mt-3 text-[12px] text-muted-foreground">{t('Amounts are always shown in Saudi Riyals (SAR) and quantities in KG / cartons.')}</p>
      </Panel>
      <Panel title="Roles & access" icon={UserCog} description="Users, roles and module permissions are managed in Users & Access.">
        <div className="space-y-2 text-[13px]">
          {roles.map((r) => (
            <div key={r.key} className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2">
              <div className="min-w-0">
                <div className="font-semibold">{t(r.label)}</div>
                <div className="truncate text-[12px] text-muted-foreground">{t(r.description)}</div>
              </div>
              <span className="shrink-0 text-[11.5px] text-muted-foreground">{r.kind === 'driver' ? t('Driver app') : t('{n} modules', { n: r.key === 'owner' ? ALL_MODULES.length : r.modules.length })}</span>
            </div>
          ))}
          <Button variant="outline" className="w-full" onClick={() => nav('/access')}><UserCog /> {t('Manage users & permissions')}</Button>
        </div>
      </Panel>
    </div>
  )
}

function DataSection() {
  const t = useT()
  const db = useStore((s) => s.db)
  const touched = useStore((s) => s.touched)
  const resetDemo = useResetDemo()
  const stats: [string, number][] = [
    ['Products', db.products.length], ['Suppliers', db.suppliers.length], ['Customers', db.customers.length], ['Drivers', db.drivers.length], ['Vehicles', db.vehicles.length],
    ['Purchase orders', db.purchaseOrders.length], ['Shipments', db.shipments.length], ['GRNs', db.grns.length], ['Batches', db.batches.length], ['Stock movements', db.stockMovements.length],
    ['Sales orders', db.salesOrders.length], ['Deliveries', db.deliveries.length], ['Invoices', db.invoices.length], ['Sales returns', db.salesReturns.length], ['Payments', db.payments.length],
    ['Van loads', db.vanLoads.length], ['Settlements', db.settlements.length], ['Audit entries', db.activity.length],
  ]
  const size = useMemo(() => new Blob([JSON.stringify(db)]).size, [db])
  const exportJSON = () => download(new Blob([JSON.stringify(db, null, 2)], { type: 'application/json' }), `zad-erp-backup-${todayKey()}.json`)
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Panel title="Data statistics" icon={Database} className="lg:col-span-2">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
          {stats.map(([l, n]) => <Stat key={l} label={l} value={fmtNum(n)} />)}
        </div>
        <p className="mt-3 text-[12px] text-muted-foreground">
          {t('Stored in this browser (LocalStorage) · {kb} KB', { kb: fmtNum(size / 1024) })}
          {touched ? ` · ${t('includes your changes')}` : ''}
        </p>
      </Panel>
      <div className="space-y-4">
        <Panel title="Backup" icon={FileJson}>
          <p className="mb-3 text-[13px] text-muted-foreground">{t('Download the complete database as a JSON file.')}</p>
          <Button variant="outline" className="w-full" onClick={exportJSON}><Download /> {t('Export JSON backup')}</Button>
        </Panel>
        <Panel title="Reset data" icon={RotateCcw}>
          <p className="mb-3 text-[13px] text-muted-foreground">{t('Discard all changes and reload the opening data dated today.')}</p>
          <Button variant="destructive" className="w-full" onClick={resetDemo}><RotateCcw /> {t('Reset data')}</Button>
        </Panel>
      </div>
    </div>
  )
}

function AuditSection() {
  const activity = useStore((s) => s.db.activity)
  const columns = useMemo<ColumnDef<(typeof activity)[number], any>[]>(
    () => [
      { accessorKey: 'at', header: 'Time', cell: ({ row }) => <span className="whitespace-nowrap tabular">{fmtDateTime(row.original.at)}</span> },
      { accessorKey: 'user', header: 'User', cell: ({ row }) => <span className="font-medium">{row.original.user}</span> },
      { accessorKey: 'action', header: 'Action' },
      { accessorKey: 'ref', header: 'Reference', cell: ({ row }) => <span className="text-muted-foreground">{row.original.ref}</span> },
    ],
    [],
  )
  return (
    <Panel title="Audit log" description="Every transaction is stamped with the user and time" icon={History}>
      <DataTable data={activity} columns={columns} searchPlaceholder="Search activity…" exportName="audit-log" pageSize={15} initialSort={[{ id: 'at', desc: true }]} facets={[{ id: 'user', label: 'User', value: (r) => r.user }]} />
    </Panel>
  )
}
