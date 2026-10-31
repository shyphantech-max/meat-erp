/** B2B customers: list with credit usage, outstanding and alerts. */
import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import type { ColumnDef } from '@tanstack/react-table'
import { AlertTriangle, CreditCard, Pencil, Plus, Store, Users, Wallet } from 'lucide-react'
import type { Customer } from '@/types'
import { Button } from '@/components/ui/button'
import { DataTable } from '@/components/tables/DataTable'
import { Alert, KpiCard, MeterBar, PageHeader, StatusBadge, useDialog } from '@/components/common'
import { useStore } from '@/store/useStore'
import { useCustomerBalances, useLookups } from '@/store/selectors'
import { useT, useName } from '@/i18n'
import { fmtNum, fmtSAR } from '@/lib/format'
import { cn } from '@/lib/utils'
import { BUSINESS_TYPES, CustomerDialog } from './CustomerDialog'

type Row = Customer & { outstanding: number; overdue: number; pct: number; over: boolean; near: boolean; driverName: string }

export default function CustomersPage() {
  const t = useT()
  const name = useName()
  const nav = useNavigate()
  const customers = useStore((s) => s.db.customers)
  const bal = useCustomerBalances()
  const lk = useLookups()
  const dlg = useDialog<Customer | null>()

  const rows = useMemo<Row[]>(
    () =>
      customers.map((c) => {
        const b = bal[c.id]
        return { ...c, outstanding: b.outstanding, overdue: b.overdue, pct: b.creditUsedPct, over: b.overLimit, near: b.nearLimit, driverName: c.driverId ? name(lk.driver[c.driverId]) : '-' }
      }),
    [customers, bal, lk, name],
  )
  const total = rows.reduce((s, r) => s + r.outstanding, 0)
  const overdue = rows.reduce((s, r) => s + r.overdue, 0)
  const alerts = rows.filter((r) => r.over || r.near).sort((a, b) => b.pct - a.pct)

  const columns = useMemo<ColumnDef<Row, any>[]>(
    () => [
      {
        id: 'name',
        header: 'Customer',
        accessorFn: (r) => r.name,
        cell: ({ row: { original: r } }) => (
          <div className="min-w-48">
            <div className="font-medium text-brand-ink">{name(r)}</div>
            <div className="text-[11.5px] text-muted-foreground">{r.code} · {r.contactPerson} · {r.phone}</div>
          </div>
        ),
      },
      { id: 'type', header: 'Business type', accessorFn: (r) => r.businessType, cell: ({ getValue }) => <StatusBadge status={getValue()} tone="neutral" label={t(BUSINESS_TYPES.find((b) => b.value === getValue())?.label ?? getValue())} /> },
      { id: 'city', header: 'City', accessorFn: (r) => `${r.city}`, cell: ({ row: { original: r } }) => <div><div>{t(r.city)}</div><div className="text-[11.5px] text-muted-foreground">{r.district}</div></div> },
      { accessorKey: 'driverName', header: 'Assigned driver' },
      { id: 'pay', header: 'Payment', accessorFn: (r) => r.defaultPayment, cell: ({ row: { original: r } }) => <div><StatusBadge status={r.defaultPayment} label={t(r.defaultPayment === 'cash' ? 'Cash' : 'Credit')} /><div className="mt-0.5 text-[11px] text-muted-foreground">{r.paymentTermsDays} {t('days')}</div></div> },
      { id: 'limit', header: 'Credit limit', accessorFn: (r) => r.creditLimit, cell: ({ getValue }) => <span className="tabular">{fmtNum(getValue())}</span> },
      { id: 'outstanding', header: 'Outstanding', accessorFn: (r) => r.outstanding, cell: ({ row: { original: r } }) => (
        <div>
          <div className={cn('font-semibold tabular', r.over && 'text-danger')}>{fmtSAR(r.outstanding)}</div>
          {r.overdue > 0 && <div className="text-[11px] text-warning tabular">{t('Overdue')} {fmtSAR(r.overdue)}</div>}
        </div>
      ) },
      { id: 'usage', header: 'Credit used', accessorFn: (r) => Math.round(r.pct), cell: ({ row: { original: r } }) => (
        <div className="w-32">
          <MeterBar value={r.outstanding} max={r.creditLimit} showLabel />
          {(r.over || r.near) && <div className={cn('mt-0.5 text-[11px] font-medium', r.over ? 'text-danger' : 'text-warning')}>{t(r.over ? 'Over credit limit' : 'Near credit limit')}</div>}
        </div>
      ) },
      { id: 'act', header: '', enableSorting: false, cell: ({ row }) => <Button variant="ghost" size="icon-sm" onClick={(e) => { e.stopPropagation(); dlg.open(row.original) }} aria-label={t('Edit')}><Pencil /></Button> },
    ],
    [name, t, dlg],
  )

  return (
    <div>
      <PageHeader title="Customers" icon={Store} description="Restaurants, hotels, supermarkets, caterers and wholesale meat traders - credit, pricing and ledgers." actions={<Button onClick={() => dlg.open(null)}><Plus /> {t('New customer')}</Button>} />
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Active customers" value={rows.filter((r) => r.active).length} sub={`${rows.filter((r) => r.defaultPayment === 'credit').length} ${t('on credit terms')}`} icon={Users} />
        <KpiCard label="Total outstanding" value={fmtSAR(total, { compact: true })} sub={`${rows.filter((r) => r.outstanding > 0).length} ${t('customers with balance')}`} icon={Wallet} tone="navy" to="/accounts" />
        <KpiCard label="Overdue" value={fmtSAR(overdue, { compact: true })} sub={t('Past payment terms')} icon={AlertTriangle} tone={overdue > 0 ? 'warning' : 'success'} />
        <KpiCard label="Credit limit alerts" value={alerts.length} sub={`${alerts.filter((a) => a.over).length} ${t('over limit')}`} icon={CreditCard} tone={alerts.some((a) => a.over) ? 'danger' : 'warning'} alert={alerts.length > 0} />
      </div>
      {alerts.length > 0 && (
        <div className="mb-4 space-y-2">
          {alerts.slice(0, 3).map((a) => (
            <Alert key={a.id} tone={a.over ? 'danger' : 'warning'} icon={CreditCard}>
              <button className="text-start" onClick={() => nav(`/customers/${a.id}`)}>
                <b>{name(a)}</b> - {t('{pct}% of credit limit used', { pct: fmtNum(a.pct) })} ({fmtSAR(a.outstanding)} / {fmtSAR(a.creditLimit)}). {t(a.over ? 'New credit sales need an override.' : 'Approaching the credit limit.')}
              </button>
            </Alert>
          ))}
        </div>
      )}
      <DataTable
        data={rows}
        columns={columns}
        exportName="customers"
        onRowClick={(r) => nav(`/customers/${r.id}`)}
        searchPlaceholder="Search name, code, contact, phone…"
        searchText={(r) => `${r.name} ${r.nameAr} ${r.code} ${r.contactPerson} ${r.phone} ${r.city} ${r.district}`}
        facets={[
          { id: 'type', label: 'Business type', value: (r) => r.businessType, options: BUSINESS_TYPES },
          { id: 'city', label: 'City', value: (r) => r.city },
          { id: 'driver', label: 'Driver', value: (r) => r.driverName },
          { id: 'credit', label: 'Credit status', value: (r) => (r.over ? 'over' : r.near ? 'near' : 'ok'), options: [{ value: 'over', label: 'Over credit limit' }, { value: 'near', label: 'Near credit limit' }, { value: 'ok', label: 'Within limit' }] },
        ]}
        initialSort={[{ id: 'outstanding', desc: true }]}
        rowClassName={(r) => (r.over ? 'bg-danger-soft/30' : undefined)}
      />
      <CustomerDialog open={dlg.isOpen} onOpenChange={dlg.onOpenChange} customer={dlg.value} onSaved={(id) => !dlg.value && nav(`/customers/${id}`)} />
    </div>
  )
}
