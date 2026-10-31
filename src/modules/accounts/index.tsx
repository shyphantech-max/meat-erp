import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { ColumnDef } from '@tanstack/react-table'
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { AlertTriangle, Banknote, CalendarClock, Landmark, Users, Wallet } from 'lucide-react'
import type { Customer, ID, Invoice, Payment, PurchaseOrder, Settlement, Supplier } from '@/types'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { DataTable } from '@/components/tables/DataTable'
import { EmptyState, EntityLink, KpiCard, MeterBar, Money, PageHeader, Panel, Picker, StatusBadge } from '@/components/common'
import { CHART, ChartTip, axisProps, gridProps, sarTick } from '@/components/charts'
import { useStore } from '@/store/useStore'
import { useCustomerBalances, type CustomerBalance } from '@/store/selectors'
import { AGE_BUCKETS, invoiceBalance, poPayable, ageingFor } from '@/store/derive'
import { useT, useName } from '@/i18n'
import { daysBetween, fmtDate, fmtNum, fmtSAR, fmtTime, shiftDay, todayKey } from '@/lib/format'
import { cn } from '@/lib/utils'
import { RangePicker, inRange, type Range } from '../collections/shared'

const TABS = ['receivables', 'payables', 'ledger', 'history', 'credit', 'ageing', 'cashbook', 'handover'] as const
const TAB_LABEL: Record<(typeof TABS)[number], string> = {
  receivables: 'Customer receivables', payables: 'Supplier payables', ledger: 'Customer ledger', history: 'Payment history', credit: 'Credit sales', ageing: 'Outstanding ageing', cashbook: 'Cash collection register', handover: 'Driver cash handover',
}
const BUCKET_COLOR = [CHART.brand, CHART.mint, CHART.amber, CHART.red]

export default function AccountsPage() {
  const t = useT()
  const db = useStore((s) => s.db)
  const balances = useCustomerBalances()
  const [params, setParams] = useSearchParams()
  const tab = (TABS as readonly string[]).includes(params.get('tab') ?? '') ? (params.get('tab') as (typeof TABS)[number]) : 'receivables'
  const totalAR = Object.values(balances).reduce((s, b) => s + b.outstanding, 0)
  const overdue = Object.values(balances).reduce((s, b) => s + b.overdue, 0)
  const totalAP = db.purchaseOrders.reduce((s, p) => s + poPayable(p), 0)
  const over = Object.values(balances).filter((b) => b.overLimit).length
  const age = ageingFor(db)

  return (
    <div>
      <PageHeader title="Accounts & Outstanding" description="Receivables, payables, ledgers, ageing and cash handover in SAR." icon={Wallet} />
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <KpiCard label="Customer receivables" value={fmtSAR(totalAR)} icon={Users} to="/accounts?tab=receivables" />
        <KpiCard label="Overdue receivables" value={fmtSAR(overdue)} icon={CalendarClock} tone="danger" />
        <KpiCard label="90+ days" value={fmtSAR(age['90+'])} icon={AlertTriangle} tone="warning" to="/accounts?tab=ageing" />
        <KpiCard label="Supplier payables" value={fmtSAR(totalAP)} icon={Landmark} tone="navy" to="/accounts?tab=payables" />
        <KpiCard label="Over credit limit" value={over} sub={t('customers')} icon={AlertTriangle} tone="danger" alert={over > 0} />
      </div>
      <Tabs value={tab} onValueChange={(v) => setParams({ tab: v })}>
        <TabsList className="w-full sm:w-fit">
          {TABS.map((k) => <TabsTrigger key={k} value={k}>{t(TAB_LABEL[k])}</TabsTrigger>)}
        </TabsList>
        <TabsContent value="receivables"><Receivables balances={balances} /></TabsContent>
        <TabsContent value="payables"><Payables /></TabsContent>
        <TabsContent value="ledger"><Ledger initial={params.get('customer') ?? undefined} /></TabsContent>
        <TabsContent value="history"><History /></TabsContent>
        <TabsContent value="credit"><CreditSales /></TabsContent>
        <TabsContent value="ageing"><Ageing balances={balances} /></TabsContent>
        <TabsContent value="cashbook"><CashBook /></TabsContent>
        <TabsContent value="handover"><Handover /></TabsContent>
      </Tabs>
    </div>
  )
}

function Receivables({ balances }: { balances: Record<ID, CustomerBalance> }) {
  const t = useT()
  const name = useName()
  const customers = useStore((s) => s.db.customers)
  type R = { c: Customer; b: CustomerBalance }
  const rows: R[] = customers.map((c) => ({ c, b: balances[c.id] })).filter((r) => r.b)
  const cols: ColumnDef<R, any>[] = [
    { header: 'Customer', id: 'name', accessorFn: (r) => r.c.name, cell: ({ row }) => <div><EntityLink to={`/customers/${row.original.c.id}`}>{name(row.original.c)}</EntityLink><div className="text-[11px] text-muted-foreground">{t(row.original.c.businessType[0].toUpperCase() + row.original.c.businessType.slice(1))} · {t(row.original.c.city)}</div></div> },
    { header: 'Outstanding', id: 'outstanding', accessorFn: (r) => r.b.outstanding, cell: ({ row }) => <Money value={row.original.b.outstanding} className="font-semibold" /> },
    { header: 'Overdue', id: 'overdue', accessorFn: (r) => r.b.overdue, cell: ({ row }) => <Money value={row.original.b.overdue} className={row.original.b.overdue > 0 ? 'text-danger' : 'text-muted-foreground'} /> },
    { header: 'Open invoices', id: 'open', accessorFn: (r) => r.b.openInvoices },
    { header: 'Credit limit', id: 'limit', accessorFn: (r) => r.c.creditLimit, cell: ({ row }) => <Money value={row.original.c.creditLimit} /> },
    { header: 'Credit used', id: 'used', accessorFn: (r) => r.b.creditUsedPct, cell: ({ row }) => <MeterBar value={row.original.b.outstanding} max={row.original.c.creditLimit} showLabel className="w-32" /> },
    { header: 'Terms', id: 'terms', accessorFn: (r) => r.c.paymentTermsDays, cell: ({ row }) => `${row.original.c.paymentTermsDays} ${t('days')}` },
    { header: 'Alert', id: 'alert', accessorFn: (r) => (r.b.overLimit ? 'over' : r.b.nearLimit ? 'near' : ''), cell: ({ row }) => (row.original.b.overLimit ? <StatusBadge status="failed" label={t('Over limit')} /> : row.original.b.nearLimit ? <StatusBadge status="pending" label={t('Near limit')} /> : null) },
  ]
  return <DataTable data={rows} columns={cols} exportName="customer-receivables" initialSort={[{ id: 'outstanding', desc: true }]} searchText={(r) => `${r.c.name} ${r.c.nameAr} ${r.c.code}`} facets={[{ id: 'alert', label: 'Credit alert', value: (r) => (r.b.overLimit ? 'over' : r.b.nearLimit ? 'near' : 'ok'), options: [{ value: 'over', label: 'Over limit' }, { value: 'near', label: 'Near limit' }, { value: 'ok', label: 'Within limit' }] }]} />
}

function Payables() {
  const t = useT()
  const db = useStore((s) => s.db)
  const today = todayKey()
  const open = db.purchaseOrders.filter((p) => poPayable(p) > 0)
  const due = (p: PurchaseOrder) => shiftDay(p.date, db.suppliers.find((s) => s.id === p.supplierId)?.paymentTermsDays ?? 30)
  type S = { s: Supplier; total: number; paid: number; payable: number; overdue: number; next?: string; count: number }
  const sum: S[] = db.suppliers
    .map((s) => {
      const pos = db.purchaseOrders.filter((p) => p.supplierId === s.id && ['approved', 'partially_received', 'received'].includes(p.status))
      const o = pos.filter((p) => poPayable(p) > 0)
      return { s, total: pos.reduce((x, p) => x + p.totalSAR, 0), paid: pos.reduce((x, p) => x + p.paidSAR, 0), payable: o.reduce((x, p) => x + poPayable(p), 0), overdue: o.filter((p) => due(p) < today).reduce((x, p) => x + poPayable(p), 0), next: o.map(due).sort()[0], count: o.length }
    })
    .filter((r) => r.total > 0)
  const sCols: ColumnDef<S, any>[] = [
    { header: 'Supplier', id: 'name', accessorFn: (r) => r.s.name, cell: ({ row }) => <div><div className="font-medium">{row.original.s.name}</div><div className="text-[11px] text-muted-foreground">{t(row.original.s.country)} · {t(row.original.s.type === 'local' ? 'Local' : 'International')} · {row.original.s.paymentTermsDays} {t('days')}</div></div> },
    { header: 'Purchases', id: 'total', accessorFn: (r) => r.total, cell: ({ row }) => <Money value={row.original.total} /> },
    { header: 'Paid', id: 'paid', accessorFn: (r) => r.paid, cell: ({ row }) => <Money value={row.original.paid} /> },
    { header: 'Payable', id: 'payable', accessorFn: (r) => r.payable, cell: ({ row }) => <Money value={row.original.payable} className="font-semibold" /> },
    { header: 'Overdue', id: 'overdue', accessorFn: (r) => r.overdue, cell: ({ row }) => <Money value={row.original.overdue} className={row.original.overdue > 0 ? 'text-danger' : 'text-muted-foreground'} /> },
    { header: 'Open POs', id: 'count', accessorFn: (r) => r.count },
    { header: 'Next due', id: 'next', accessorFn: (r) => r.next ?? '', cell: ({ row }) => fmtDate(row.original.next) },
  ]
  const pCols: ColumnDef<PurchaseOrder, any>[] = [
    { header: 'PO', accessorKey: 'poNo', cell: ({ row }) => <EntityLink to={`/purchases?tab=orders&q=${row.original.poNo}`}>{row.original.poNo}</EntityLink> },
    { header: 'Supplier', id: 'supplier', accessorFn: (p) => db.suppliers.find((s) => s.id === p.supplierId)?.name },
    { header: 'PO date', accessorKey: 'date', cell: ({ row }) => fmtDate(row.original.date) },
    { header: 'Due date', id: 'due', accessorFn: (p) => due(p), cell: ({ row }) => <span className={due(row.original) < today ? 'font-medium text-danger' : ''}>{fmtDate(due(row.original))}</span> },
    { header: 'Total', accessorKey: 'totalSAR', cell: ({ row }) => <Money value={row.original.totalSAR} /> },
    { header: 'Paid', accessorKey: 'paidSAR', cell: ({ row }) => <Money value={row.original.paidSAR} /> },
    { header: 'Balance', id: 'bal', accessorFn: (p) => poPayable(p), cell: ({ row }) => <Money value={poPayable(row.original)} className="font-semibold" /> },
    { header: 'Payment', id: 'pay', accessorFn: (p) => p.paymentStatus, cell: ({ row }) => <StatusBadge status={row.original.paymentStatus} /> },
  ]
  return (
    <div className="space-y-4">
      <DataTable data={sum} columns={sCols} exportName="supplier-payables" initialSort={[{ id: 'payable', desc: true }]} searchText={(r) => `${r.s.name} ${r.s.country}`} />
      <Panel title="Open purchase order balances" bodyClassName="p-3">
        <DataTable data={open} columns={pCols} exportName="po-payables" initialSort={[{ id: 'due', desc: false }]} compact />
      </Panel>
    </div>
  )
}

type LedgerRow = { date: string; at: string; kind: 'invoice' | 'payment' | 'return'; ref: string; detail: string; debit: number; credit: number; balance: number }
function Ledger({ initial }: { initial?: ID }) {
  const t = useT()
  const name = useName()
  const db = useStore((s) => s.db)
  const [customerId, setCustomerId] = useState<ID>(initial ?? db.customers[0]?.id ?? '')
  const rows = useMemo(() => {
    const e: Omit<LedgerRow, 'balance'>[] = []
    for (const i of db.invoices) if (i.customerId === customerId && i.status !== 'void') e.push({ date: i.date, at: i.createdAt, kind: 'invoice', ref: i.invNo, detail: `${t(i.source)} · ${t(i.paymentType === 'cash' ? 'Cash' : 'Credit')}`, debit: i.total, credit: 0 })
    for (const p of db.payments) if (p.customerId === customerId && p.verification !== 'rejected') e.push({ date: p.date, at: p.createdAt, kind: 'payment', ref: p.receiptNo, detail: `${t(p.method === 'cash' ? 'Cash' : 'Bank transfer')}${p.bankRef ? ` · ${p.bankRef}` : ''}`, debit: 0, credit: p.amount })
    for (const r of db.salesReturns) if (r.customerId === customerId) e.push({ date: r.date, at: r.createdAt, kind: 'return', ref: r.returnNo, detail: r.reason, debit: 0, credit: r.amount })
    e.sort((a, b) => a.date.localeCompare(b.date) || a.at.localeCompare(b.at))
    let bal = 0
    return e.map((x) => ({ ...x, balance: (bal = Math.round((bal + x.debit - x.credit) * 100) / 100) }))
  }, [db.invoices, db.payments, db.salesReturns, customerId, t])
  const c = db.customers.find((x) => x.id === customerId)
  const cols: ColumnDef<LedgerRow, any>[] = [
    { header: 'Date', accessorKey: 'date', cell: ({ row }) => fmtDate(row.original.date) },
    { header: 'Type', accessorKey: 'kind', cell: ({ row }) => <StatusBadge status={row.original.kind === 'invoice' ? 'credit' : row.original.kind === 'payment' ? 'paid' : 'partial'} label={t(row.original.kind === 'invoice' ? 'Invoice' : row.original.kind === 'payment' ? 'Payment' : 'Sales return')} /> },
    { header: 'Reference', accessorKey: 'ref', cell: ({ row }) => <span className="font-medium">{row.original.ref}</span> },
    { header: 'Details', accessorKey: 'detail', cell: ({ row }) => <span className="text-[12px] text-muted-foreground">{row.original.detail}</span> },
    { header: 'Debit', accessorKey: 'debit', cell: ({ row }) => (row.original.debit ? <Money value={row.original.debit} /> : '') },
    { header: 'Credit', accessorKey: 'credit', cell: ({ row }) => (row.original.credit ? <Money value={row.original.credit} className="text-success" /> : '') },
    { header: 'Balance', accessorKey: 'balance', cell: ({ row }) => <Money value={row.original.balance} className="font-semibold" /> },
  ]
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <Picker value={customerId} onChange={setCustomerId} options={db.customers.map((x) => ({ value: x.id, label: name(x) }))} className="w-full sm:w-80" />
        {c && (
          <div className="flex flex-wrap gap-4 text-[13px]">
            <span>{t('Invoiced')}: <b className="tabular">{fmtSAR(rows.reduce((s, r) => s + r.debit, 0))}</b></span>
            <span>{t('Received')}: <b className="tabular">{fmtSAR(rows.reduce((s, r) => s + r.credit, 0))}</b></span>
            <span>{t('Closing balance')}: <b className="tabular text-brand-ink">{fmtSAR(rows[rows.length - 1]?.balance ?? 0)}</b></span>
          </div>
        )}
      </div>
      {rows.length === 0 ? <EmptyState title="No ledger entries" /> : <DataTable data={rows} columns={cols} exportName={`ledger-${c?.code ?? 'customer'}`} pageSize={15} searchText={(r) => `${r.ref} ${r.detail}`} />}
    </div>
  )
}

function History() {
  const t = useT()
  const name = useName()
  const db = useStore((s) => s.db)
  const [range, setRange] = useState<Range>('30d')
  const rows = db.payments.filter((p) => inRange(p.date, range)).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const cols: ColumnDef<Payment, any>[] = [
    { header: 'Receipt', accessorKey: 'receiptNo', cell: ({ row }) => <span className="font-medium">{row.original.receiptNo}</span> },
    { header: 'Date', accessorKey: 'date', cell: ({ row }) => `${fmtDate(row.original.date)} ${fmtTime(row.original.createdAt)}` },
    { header: 'Customer', id: 'customer', accessorFn: (p) => db.customers.find((c) => c.id === p.customerId)?.name, cell: ({ row }) => name(db.customers.find((c) => c.id === row.original.customerId)) },
    { header: 'Collected by', id: 'by', accessorFn: (p) => db.drivers.find((d) => d.id === p.driverId)?.name ?? 'Head office', cell: ({ row }) => (row.original.driverId ? name(db.drivers.find((d) => d.id === row.original.driverId)) : t('Head office')) },
    { header: 'Method', id: 'method', accessorFn: (p) => p.method, cell: ({ row }) => t(row.original.method === 'cash' ? 'Cash' : 'Bank transfer') },
    { header: 'Amount', accessorKey: 'amount', cell: ({ row }) => <Money value={row.original.amount} className={cn('font-semibold', row.original.verification === 'rejected' && 'line-through opacity-60')} /> },
    { header: 'Type', id: 'type', accessorFn: (p) => p.collectionType, cell: ({ row }) => <StatusBadge status={row.original.collectionType} /> },
    { header: 'Verification', id: 'verification', accessorFn: (p) => p.verification, cell: ({ row }) => <StatusBadge status={row.original.verification} /> },
  ]
  return (
    <DataTable
      data={rows}
      columns={cols}
      exportName="payment-history"
      toolbar={<RangePicker value={range} onChange={setRange} />}
      facets={[
        { id: 'method', label: 'Method', value: (p) => p.method, options: [{ value: 'cash', label: 'Cash' }, { value: 'bank', label: 'Bank transfer' }] },
        { id: 'verification', label: 'Verification', value: (p) => p.verification, options: ['pending', 'verified', 'rejected'].map((v) => ({ value: v, label: v })) },
      ]}
    />
  )
}

function CreditSales() {
  const t = useT()
  const name = useName()
  const db = useStore((s) => s.db)
  const today = todayKey()
  const rows = db.invoices.filter((i) => i.paymentType === 'credit' && i.status !== 'void').sort((a, b) => b.date.localeCompare(a.date))
  const cols: ColumnDef<Invoice, any>[] = [
    { header: 'Invoice', accessorKey: 'invNo', cell: ({ row }) => <EntityLink to={`/sales?tab=invoices&q=${row.original.invNo}`}>{row.original.invNo}</EntityLink> },
    { header: 'Date', accessorKey: 'date', cell: ({ row }) => fmtDate(row.original.date) },
    { header: 'Customer', id: 'customer', accessorFn: (i) => db.customers.find((c) => c.id === i.customerId)?.name, cell: ({ row }) => <EntityLink to={`/customers/${row.original.customerId}`}>{name(db.customers.find((c) => c.id === row.original.customerId))}</EntityLink> },
    { header: 'Source', id: 'source', accessorFn: (i) => i.source, cell: ({ row }) => <StatusBadge status={row.original.source} /> },
    { header: 'Total', accessorKey: 'total', cell: ({ row }) => <Money value={row.original.total} /> },
    { header: 'Balance', id: 'balance', accessorFn: (i) => invoiceBalance(i), cell: ({ row }) => <Money value={invoiceBalance(row.original)} className="font-semibold" /> },
    { header: 'Due date', accessorKey: 'dueDate', cell: ({ row }) => fmtDate(row.original.dueDate) },
    { header: 'Days overdue', id: 'overdue', accessorFn: (i) => (invoiceBalance(i) > 0 && i.dueDate < today ? daysBetween(i.dueDate, today) : 0), cell: ({ getValue }) => (getValue() > 0 ? <span className="font-semibold text-danger">{getValue()}</span> : '-') },
    { header: 'Status', id: 'status', accessorFn: (i) => i.status, cell: ({ row }) => <StatusBadge status={row.original.status} /> },
  ]
  return <DataTable data={rows} columns={cols} exportName="credit-sales" facets={[{ id: 'status', label: 'Status', value: (i) => i.status, options: ['unpaid', 'partial', 'paid'].map((v) => ({ value: v, label: v })) }, { id: 'overdue', label: 'Overdue', value: (i) => (invoiceBalance(i) > 0 && i.dueDate < today ? 'yes' : 'no'), options: [{ value: 'yes', label: 'Overdue' }, { value: 'no', label: 'Not overdue' }] }]} />
}

function Ageing({ balances }: { balances: Record<ID, CustomerBalance> }) {
  const t = useT()
  const name = useName()
  const customers = useStore((s) => s.db.customers)
  type R = { c: Customer; b: CustomerBalance }
  const rows: R[] = customers.map((c) => ({ c, b: balances[c.id] })).filter((r) => r.b && r.b.outstanding > 0)
  const totals = AGE_BUCKETS.map((k) => ({ bucket: `${k} ${t('days')}`, value: rows.reduce((s, r) => s + r.b.ageing[k], 0) }))
  const grand = totals.reduce((s, x) => s + x.value, 0)
  const cols: ColumnDef<R, any>[] = [
    { header: 'Customer', id: 'name', accessorFn: (r) => r.c.name, cell: ({ row }) => <EntityLink to={`/customers/${row.original.c.id}`}>{name(row.original.c)}</EntityLink> },
    ...AGE_BUCKETS.map((k, i) => ({ header: `${k} days`, id: k, accessorFn: (r: R) => r.b.ageing[k], cell: ({ row }: { row: { original: R } }) => (row.original.b.ageing[k] ? <Money value={row.original.b.ageing[k]} className={i === 3 ? 'font-semibold text-danger' : i === 2 ? 'text-warning' : ''} /> : <span className="text-muted-foreground">-</span>) }) as ColumnDef<R, any>),
    { header: 'Total', id: 'total', accessorFn: (r) => r.b.outstanding, cell: ({ row }) => <Money value={row.original.b.outstanding} className="font-semibold" /> },
  ]
  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <Panel title="Outstanding by age" description="Days since invoice date">
          <div className="h-60">
            <ResponsiveContainer>
              <BarChart data={totals} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="bucket" {...axisProps} />
                <YAxis {...axisProps} tickFormatter={sarTick} width={48} />
                <Tooltip content={<ChartTip money />} cursor={{ fill: 'rgba(8,127,91,0.06)' }} />
                <Bar isAnimationActive={false} dataKey="value" name={t('Outstanding')} radius={[6, 6, 0, 0]}>
                  {totals.map((_, i) => <Cell key={i} fill={BUCKET_COLOR[i]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        <Panel title="Ageing summary">
          <div className="space-y-2.5">
            {totals.map((x, i) => (
              <div key={x.bucket}>
                <div className="flex justify-between text-[13px]"><span className="flex items-center gap-2"><span className="size-2.5 rounded-sm" style={{ background: BUCKET_COLOR[i] }} />{x.bucket}</span><span className="font-semibold tabular">{fmtSAR(x.value)}</span></div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full" style={{ width: `${grand ? (x.value / grand) * 100 : 0}%`, background: BUCKET_COLOR[i] }} /></div>
              </div>
            ))}
            <div className="flex justify-between border-t pt-2 text-[14px] font-bold"><span>{t('Total')}</span><span className="tabular">{fmtSAR(grand)}</span></div>
            <p className="text-[11.5px] text-muted-foreground">{fmtNum(grand ? ((totals[2].value + totals[3].value) / grand) * 100 : 0)}% {t('of receivables are older than 60 days')}</p>
          </div>
        </Panel>
      </div>
      <DataTable data={rows} columns={cols} exportName="outstanding-ageing" initialSort={[{ id: '90+', desc: true }]} searchText={(r) => `${r.c.name} ${r.c.nameAr}`} />
    </div>
  )
}

function CashBook() {
  const t = useT()
  const name = useName()
  const db = useStore((s) => s.db)
  const [range, setRange] = useState<Range>('7d')
  const cash = db.payments.filter((p) => p.method === 'cash' && p.verification !== 'rejected' && inRange(p.date, range)).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const byDay = Object.entries(cash.reduce<Record<string, number>>((m, p) => ((m[p.date] = (m[p.date] ?? 0) + p.amount), m), {})).sort((a, b) => b[0].localeCompare(a[0]))
  const cols: ColumnDef<Payment, any>[] = [
    { header: 'Date', accessorKey: 'date', cell: ({ row }) => `${fmtDate(row.original.date)} ${fmtTime(row.original.createdAt)}` },
    { header: 'Receipt', accessorKey: 'receiptNo' },
    { header: 'Customer', id: 'customer', accessorFn: (p) => db.customers.find((c) => c.id === p.customerId)?.name, cell: ({ row }) => name(db.customers.find((c) => c.id === row.original.customerId)) },
    { header: 'Collected by', id: 'by', accessorFn: (p) => db.drivers.find((d) => d.id === p.driverId)?.name ?? 'Head office', cell: ({ row }) => (row.original.driverId ? name(db.drivers.find((d) => d.id === row.original.driverId)) : t('Head office')) },
    { header: 'Amount', accessorKey: 'amount', cell: ({ row }) => <Money value={row.original.amount} className="font-semibold" /> },
    { header: 'Settlement', id: 'stl', accessorFn: (p) => db.settlements.find((s) => s.id === p.settlementId)?.settlementNo ?? '', cell: ({ row }) => { const s = db.settlements.find((x) => x.id === row.original.settlementId); return s ? <EntityLink to={`/settlement?id=${s.id}`}>{s.settlementNo}</EntityLink> : <span className="text-muted-foreground">-</span> } },
    { header: 'Verification', id: 'v', accessorFn: (p) => p.verification, cell: ({ row }) => <StatusBadge status={row.original.verification} /> },
  ]
  return (
    <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
      <Panel title="Daily cash totals" icon={Banknote}>
        {byDay.length === 0 ? <p className="text-sm text-muted-foreground">{t('No cash collections')}</p> : (
          <ul className="space-y-1.5 text-[13px]">
            {byDay.map(([d, v]) => <li key={d} className="flex justify-between"><span>{fmtDate(d)}</span><span className="font-semibold tabular">{fmtSAR(v)}</span></li>)}
            <li className="flex justify-between border-t pt-1.5 font-bold"><span>{t('Total')}</span><span className="tabular">{fmtSAR(cash.reduce((s, p) => s + p.amount, 0))}</span></li>
          </ul>
        )}
      </Panel>
      <DataTable data={cash} columns={cols} exportName="cash-collection-register" toolbar={<RangePicker value={range} onChange={setRange} />} facets={[{ id: 'by', label: 'Collected by', value: (p) => db.drivers.find((d) => d.id === p.driverId)?.name ?? 'Head office' }]} />
    </div>
  )
}

function Handover() {
  const t = useT()
  const name = useName()
  const db = useStore((s) => s.db)
  const tol = db.settings.cashVarianceToleranceSAR
  const rows = [...db.settlements].sort((a, b) => b.date.localeCompare(a.date))
  const cols: ColumnDef<Settlement, any>[] = [
    { header: 'Date', accessorKey: 'date', cell: ({ row }) => fmtDate(row.original.date) },
    { header: 'Settlement', accessorKey: 'settlementNo', cell: ({ row }) => <EntityLink to={`/settlement?id=${row.original.id}`}>{row.original.settlementNo}</EntityLink> },
    { header: 'Driver', id: 'driver', accessorFn: (s) => db.drivers.find((d) => d.id === s.driverId)?.name, cell: ({ row }) => name(db.drivers.find((d) => d.id === row.original.driverId)) },
    { header: 'Expected cash', accessorKey: 'expectedCash', cell: ({ row }) => <Money value={row.original.expectedCash} /> },
    { header: 'Cash handed over', accessorKey: 'cashHandedOver', cell: ({ row }) => <Money value={row.original.cashHandedOver} className="font-semibold" /> },
    { header: 'Variance', accessorKey: 'cashVariance', cell: ({ row }) => <Money value={row.original.cashVariance} className={cn('font-semibold', Math.abs(row.original.cashVariance) > tol ? 'text-danger' : row.original.cashVariance === 0 ? 'text-success' : 'text-warning')} /> },
    { header: 'Bank transfers', accessorKey: 'bankTransfers', cell: ({ row }) => <Money value={row.original.bankTransfers} /> },
    { header: 'Status', id: 'status', accessorFn: (s) => s.status, cell: ({ row }) => <StatusBadge status={row.original.status} /> },
  ]
  const live = rows.filter((s) => s.status !== 'rejected')
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard label="Expected cash" value={fmtSAR(live.reduce((s, x) => s + x.expectedCash, 0))} icon={Banknote} />
        <KpiCard label="Cash handed over" value={fmtSAR(live.reduce((s, x) => s + x.cashHandedOver, 0))} icon={Wallet} tone="success" />
        <KpiCard label="Net variance" value={fmtSAR(live.reduce((s, x) => s + x.cashVariance, 0))} icon={AlertTriangle} tone="warning" />
        <KpiCard label="Handovers with shortage" value={live.filter((x) => x.cashVariance < -0.009).length} icon={AlertTriangle} tone="danger" />
      </div>
      <DataTable data={rows} columns={cols} exportName="driver-cash-handover" facets={[{ id: 'driver', label: 'Driver', value: (s) => db.drivers.find((d) => d.id === s.driverId)?.name }, { id: 'status', label: 'Status', value: (s) => s.status }]} />
    </div>
  )
}
