import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { ColumnDef } from '@tanstack/react-table'
import { Banknote, CheckCheck, Clock, HandCoins, History, Landmark, Plus, Printer, ShieldCheck, X } from 'lucide-react'
import type { ID, Payment } from '@/types'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DataTable } from '@/components/tables/DataTable'
import { EmptyState, EntityLink, Field, KpiCard, Money, PageHeader, PrintDialog, StatusBadge, useAction, useDialog } from '@/components/common'
import { ReceiptDoc } from '@/components/docs'
import { useStore } from '@/store/useStore'
import { useCustomerBalances } from '@/store/selectors'
import * as L from '@/store/logic'
import { useT, useName } from '@/i18n'
import { fmtDate, fmtDateTime, fmtSAR, fmtTime, todayKey } from '@/lib/format'
import { RecordPaymentDialog } from './RecordPaymentDialog'
import { RangePicker, inRange, type Range } from './shared'

export default function CollectionsPage() {
  const t = useT()
  const name = useName()
  const act = useAction()
  const db = useStore((s) => s.db)
  const balances = useCustomerBalances()
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') ?? 'payments'
  const presetCustomer = params.get('customer') ?? undefined
  const [recordOpen, setRecordOpen] = useState(!!presetCustomer)
  const [recordFor, setRecordFor] = useState<{ customerId?: ID; driverId?: ID }>({ customerId: presetCustomer })
  const [range, setRange] = useState<Range>('7d')
  const receipt = useDialog<ID>()
  const reject = useDialog<Payment>()
  const [rejectNote, setRejectNote] = useState('')
  const today = todayKey()
  // deep link: /collections?customer=<id> opens the dialog preselected
  useEffect(() => {
    if (presetCustomer) {
      setRecordFor({ customerId: presetCustomer })
      setRecordOpen(true)
    }
  }, [presetCustomer])

  const cust = (id: ID) => db.customers.find((c) => c.id === id)
  const drv = (id?: ID) => (id ? db.drivers.find((d) => d.id === id) : undefined)

  const live = db.payments.filter((p) => p.verification !== 'rejected')
  const todays = live.filter((p) => p.date === today)
  const sum = (a: Payment[]) => a.reduce((s, p) => s + p.amount, 0)
  const oldToday = todays.reduce((s, p) => s + p.allocations.reduce((x, a) => x + ((db.invoices.find((i) => i.id === a.invoiceId)?.date ?? today) < p.date ? a.amount : 0), 0), 0)
  const pending = db.payments.filter((p) => p.verification === 'pending')

  const inR = useMemo(() => db.payments.filter((p) => inRange(p.date, range)).sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [db.payments, range])

  const openRecord = (customerId?: ID, driverId?: ID) => {
    setRecordFor({ customerId, driverId })
    setRecordOpen(true)
  }
  const verify = (p: Payment) => act((d, ctx) => L.verifyPayment(d, ctx, p.id, 'verified'), 'Payment verified')

  const payCols: ColumnDef<Payment, any>[] = [
    {
      header: 'Receipt',
      accessorKey: 'receiptNo',
      cell: ({ row }) => (
        <div>
          <div className="font-medium">{row.original.receiptNo}</div>
          <div className="text-[11px] text-muted-foreground">{fmtDate(row.original.date)} · {fmtTime(row.original.createdAt)}</div>
        </div>
      ),
    },
    { header: 'Customer', id: 'customer', accessorFn: (p) => cust(p.customerId)?.name, cell: ({ row }) => <EntityLink to={`/customers/${row.original.customerId}`}>{name(cust(row.original.customerId))}</EntityLink> },
    { header: 'Collected by', id: 'by', accessorFn: (p) => drv(p.driverId)?.name ?? 'Head office', cell: ({ row }) => (row.original.driverId ? name(drv(row.original.driverId)) : <span className="text-muted-foreground">{t('Head office')}</span>) },
    { header: 'Method', id: 'method', accessorFn: (p) => p.method, cell: ({ row }) => <div><StatusBadge status={row.original.method} label={t(row.original.method === 'cash' ? 'Cash' : 'Bank transfer')} />{row.original.bankRef && <div className="mt-0.5 text-[11px] text-muted-foreground">{row.original.bankRef}</div>}</div> },
    { header: 'Amount', accessorKey: 'amount', cell: ({ row }) => <Money value={row.original.amount} className="font-semibold" /> },
    { header: 'Type', id: 'type', accessorFn: (p) => p.collectionType, cell: ({ row }) => <StatusBadge status={row.original.collectionType} /> },
    { header: 'Invoices', id: 'invoices', accessorFn: (p) => p.allocations.map((a) => db.invoices.find((i) => i.id === a.invoiceId)?.invNo).join(' '), cell: ({ row }) => <span className="text-[12px] text-muted-foreground">{row.original.allocations.map((a) => db.invoices.find((i) => i.id === a.invoiceId)?.invNo).join(', ')}</span> },
    { header: 'Verification', id: 'verification', accessorFn: (p) => p.verification, cell: ({ row }) => <StatusBadge status={row.original.verification} /> },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => (
        <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          {row.original.verification === 'pending' && (
            <>
              <Button size="sm" variant="outline" onClick={() => verify(row.original)}><CheckCheck /> {t('Verify')}</Button>
              <Button size="icon-sm" variant="ghost" onClick={() => { setRejectNote(''); reject.open(row.original) }} aria-label={t('Reject')}><X className="text-danger" /></Button>
            </>
          )}
          <Button size="icon-sm" variant="ghost" onClick={() => receipt.open(row.original.id)} aria-label={t('Print receipt')}><Printer /></Button>
        </div>
      ),
    },
  ]

  const facets = [
    { id: 'method', label: 'Method', value: (p: Payment) => p.method, options: [{ value: 'cash', label: 'Cash' }, { value: 'bank', label: 'Bank transfer' }] },
    { id: 'verification', label: 'Verification', value: (p: Payment) => p.verification, options: ['pending', 'verified', 'rejected'].map((v) => ({ value: v, label: v })) },
    { id: 'type', label: 'Type', value: (p: Payment) => p.collectionType, options: ['current', 'old_dues', 'mixed'].map((v) => ({ value: v, label: v })) },
  ]

  // customer-wise
  const custRows = useMemo(
    () =>
      db.customers.map((c) => {
        const ps = inR.filter((p) => p.customerId === c.id && p.verification !== 'rejected')
        return { c, collected: sum(ps), count: ps.length, last: db.payments.filter((p) => p.customerId === c.id).sort((a, b) => b.date.localeCompare(a.date))[0]?.date, outstanding: balances[c.id]?.outstanding ?? 0, overdue: balances[c.id]?.overdue ?? 0 }
      }),
    [db.customers, db.payments, inR, balances],
  )
  type CR = (typeof custRows)[number]
  const custCols: ColumnDef<CR, any>[] = [
    { header: 'Customer', id: 'name', accessorFn: (r) => r.c.name, cell: ({ row }) => <div><EntityLink to={`/customers/${row.original.c.id}`}>{name(row.original.c)}</EntityLink><div className="text-[11px] text-muted-foreground">{row.original.c.code} · {t(row.original.c.city)}</div></div> },
    { header: 'Collected', accessorFn: (r) => r.collected, id: 'collected', cell: ({ row }) => <Money value={row.original.collected} className="font-semibold" /> },
    { header: 'Receipts', accessorFn: (r) => r.count, id: 'count' },
    { header: 'Last payment', accessorFn: (r) => r.last ?? '', id: 'last', cell: ({ row }) => fmtDate(row.original.last) },
    { header: 'Outstanding', accessorFn: (r) => r.outstanding, id: 'outstanding', cell: ({ row }) => <Money value={row.original.outstanding} /> },
    { header: 'Overdue', accessorFn: (r) => r.overdue, id: 'overdue', cell: ({ row }) => <Money value={row.original.overdue} className={row.original.overdue > 0 ? 'text-danger' : 'text-muted-foreground'} /> },
    { id: 'act', header: '', cell: ({ row }) => row.original.outstanding > 0 && <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); openRecord(row.original.c.id) }}><HandCoins /> {t('Collect')}</Button> },
  ]

  // driver-wise
  const drvRows = useMemo(
    () =>
      db.drivers.map((d) => {
        const ps = inR.filter((p) => p.driverId === d.id && p.verification !== 'rejected')
        const old = ps.reduce((s, p) => s + p.allocations.reduce((x, a) => x + ((db.invoices.find((i) => i.id === a.invoiceId)?.date ?? p.date) < p.date ? a.amount : 0), 0), 0)
        return { d, cash: sum(ps.filter((p) => p.method === 'cash')), bank: sum(ps.filter((p) => p.method === 'bank')), total: sum(ps), old, count: ps.length, pending: ps.filter((p) => p.verification === 'pending').length }
      }),
    [db.drivers, inR, db.invoices],
  )
  type DR = (typeof drvRows)[number]
  const drvCols: ColumnDef<DR, any>[] = [
    { header: 'Driver', id: 'name', accessorFn: (r) => r.d.name, cell: ({ row }) => <EntityLink to={`/fleet/drivers/${row.original.d.id}`}>{name(row.original.d)}</EntityLink> },
    { header: 'Cash', accessorFn: (r) => r.cash, id: 'cash', cell: ({ row }) => <Money value={row.original.cash} /> },
    { header: 'Bank transfer', accessorFn: (r) => r.bank, id: 'bank', cell: ({ row }) => <Money value={row.original.bank} /> },
    { header: 'Old dues collected', accessorFn: (r) => r.old, id: 'old', cell: ({ row }) => <Money value={row.original.old} /> },
    { header: 'Total', accessorFn: (r) => r.total, id: 'total', cell: ({ row }) => <Money value={row.original.total} className="font-semibold" /> },
    { header: 'Receipts', accessorFn: (r) => r.count, id: 'count' },
    { header: 'Pending verification', accessorFn: (r) => r.pending, id: 'pending', cell: ({ row }) => (row.original.pending ? <StatusBadge status="pending" label={String(row.original.pending)} /> : '-') },
  ]

  return (
    <div>
      <PageHeader
        title="Payment Collections"
        description="Customer and driver collections, invoice allocation, receipts and verification."
        icon={HandCoins}
        actions={<Button onClick={() => openRecord()}><Plus /> {t('Record payment')}</Button>}
      />
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <KpiCard label="Today's collections" value={fmtSAR(sum(todays))} sub={t('{n} receipts', { n: todays.length })} icon={HandCoins} />
        <KpiCard label="Cash today" value={fmtSAR(sum(todays.filter((p) => p.method === 'cash')))} icon={Banknote} tone="success" />
        <KpiCard label="Bank transfers today" value={fmtSAR(sum(todays.filter((p) => p.method === 'bank')))} icon={Landmark} tone="info" />
        <KpiCard label="Old dues collected today" value={fmtSAR(oldToday)} icon={History} tone="navy" />
        <KpiCard label="Pending verification" value={pending.length} sub={fmtSAR(sum(pending))} icon={Clock} tone="warning" alert={pending.length > 0} to="/collections?tab=verification" />
      </div>

      <Tabs value={tab} onValueChange={(v) => setParams((p) => { p.set('tab', v); p.delete('customer'); return p })}>
        <TabsList>
          <TabsTrigger value="payments">{t('All payments')}</TabsTrigger>
          <TabsTrigger value="customers">{t('Customer-wise')}</TabsTrigger>
          <TabsTrigger value="drivers">{t('Driver-wise')}</TabsTrigger>
          <TabsTrigger value="verification">{t('Verification queue')} {pending.length > 0 && <span className="rounded-full bg-warning px-1.5 text-[10px] text-white">{pending.length}</span>}</TabsTrigger>
        </TabsList>
        <TabsContent value="payments">
          <DataTable data={inR} columns={payCols} facets={facets} exportName="payments" searchPlaceholder="Search receipt, customer, invoice…" toolbar={<RangePicker value={range} onChange={setRange} />} emptyText="No payments in this period." />
        </TabsContent>
        <TabsContent value="customers">
          <DataTable data={custRows} columns={custCols} exportName="collections-by-customer" initialSort={[{ id: 'outstanding', desc: true }]} toolbar={<RangePicker value={range} onChange={setRange} />} searchText={(r) => `${r.c.name} ${r.c.nameAr} ${r.c.code}`} />
        </TabsContent>
        <TabsContent value="drivers">
          <DataTable data={drvRows} columns={drvCols} exportName="collections-by-driver" initialSort={[{ id: 'total', desc: true }]} toolbar={<RangePicker value={range} onChange={setRange} />} searchText={(r) => `${r.d.name} ${r.d.nameAr}`} />
        </TabsContent>
        <TabsContent value="verification">
          {pending.length === 0 ? (
            <EmptyState icon={ShieldCheck} title="All payments verified" description="Driver collections are verified automatically when their daily settlement is approved." />
          ) : (
            <DataTable data={pending} columns={payCols} exportName="pending-verification" searchPlaceholder="Search…" />
          )}
        </TabsContent>
      </Tabs>

      <RecordPaymentDialog open={recordOpen} onOpenChange={(o) => { setRecordOpen(o); if (!o && presetCustomer) setParams((p) => { p.delete('customer'); return p }) }} customerId={recordFor.customerId} driverId={recordFor.driverId} />

      {receipt.value && (
        <PrintDialog open={receipt.isOpen} onOpenChange={receipt.onOpenChange} title="Payment Receipt">
          <ReceiptDoc paymentId={receipt.value} />
        </PrintDialog>
      )}

      <Dialog open={reject.isOpen} onOpenChange={reject.onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('Reject payment')} {reject.value?.receiptNo}</DialogTitle>
          </DialogHeader>
          <p className="text-[13px] text-muted-foreground">{t('Rejecting reverses the invoice allocations, so the customer outstanding goes back up.')}</p>
          <Field label="Reason" required>
            <Textarea rows={3} value={rejectNote} onChange={(e) => setRejectNote(e.target.value)} placeholder={t('e.g. Bank transfer not received in statement')} />
          </Field>
          <DialogFooter>
            <Button variant="outline" onClick={reject.close}>{t('Cancel')}</Button>
            <Button
              variant="destructive"
              disabled={!rejectNote.trim()}
              onClick={() => {
                const p = reject.value!
                const r = act((d, ctx) => L.verifyPayment(d, ctx, p.id, 'rejected', rejectNote), 'Payment rejected')
                if (r.ok) reject.close()
              }}
            >
              {t('Reject')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <p className="mt-4 text-[11.5px] text-muted-foreground">{t('Last receipt')}: {db.payments.length ? fmtDateTime([...db.payments].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0].createdAt) : '-'}</p>
    </div>
  )
}
