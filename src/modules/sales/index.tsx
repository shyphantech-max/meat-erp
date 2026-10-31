/** Sales & Invoices: sales orders, invoices (direct / delivery / van sale), sales returns. */
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import type { ColumnDef } from '@tanstack/react-table'
import { Ban, ClipboardList, FilePlus2, FileText, Printer, Receipt, RotateCcw, ShoppingBag, Truck, Undo2, Wallet, X } from 'lucide-react'
import type { Invoice, SalesOrder, SalesReturn } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DataTable } from '@/components/tables/DataTable'
import { Alert, EntityLink, Field, KpiCard, PageHeader, Picker, PrintDialog, Stat, StatusBadge, SummaryRow, useAction, useConfirm, useDialog } from '@/components/common'
import { InvoiceDoc } from '@/components/docs'
import { useStore } from '@/store/useStore'
import { useLookups } from '@/store/selectors'
import { invoiceBalance } from '@/store/derive'
import * as L from '@/store/logic'
import { useT, useName } from '@/i18n'
import { cn } from '@/lib/utils'
import { fmtDate, fmtDateTime, fmtKg, fmtNum, fmtSAR, todayKey } from '@/lib/format'
import { DirectInvoiceDialog, ReturnDialog, SalesOrderDialog } from './dialogs'

const TABS = ['orders', 'invoices', 'returns'] as const
const kgOf = (lines: { qtyKg: number }[]) => lines.reduce((s, l) => s + l.qtyKg, 0)

export default function SalesPage() {
  const t = useT()
  const [sp, setSp] = useSearchParams()
  const tab = (TABS as readonly string[]).includes(sp.get('tab') ?? '') ? (sp.get('tab') as string) : 'invoices'
  const q = sp.get('q') ?? ''
  const db = useStore((s) => s.db)
  const today = todayKey()
  const soDlg = useDialog<string | undefined>()
  const invDlg = useDialog<true>()
  const retDlg = useDialog<string | undefined>()
  const invDetail = useDialog<string>()
  const soDetail = useDialog<string>()

  // ?new=<customerId> opens a prefilled sales order
  useEffect(() => {
    const nc = sp.get('new')
    if (nc) {
      soDlg.open(nc)
      const n = new URLSearchParams(sp)
      n.delete('new')
      setSp(n, { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const setParam = (k: string, v?: string) => {
    const n = new URLSearchParams(sp)
    if (v) n.set(k, v)
    else n.delete(k)
    setSp(n, { replace: true })
  }

  const live = db.invoices.filter((i) => i.status !== 'void' && i.source !== 'opening')
  const todays = live.filter((i) => i.date === today)
  const mtd = live.filter((i) => i.date.slice(0, 7) === today.slice(0, 7))
  const credit = db.invoices.filter((i) => i.paymentType === 'credit').reduce((s, i) => s + invoiceBalance(i), 0)
  const openOrders = db.salesOrders.filter((s) => s.status === 'open' || s.status === 'assigned')

  return (
    <div>
      <PageHeader
        title="Sales & Invoices"
        icon={FileText}
        description="B2B sales orders, direct invoices, delivery and van-sale invoices, returns. Prices excl. VAT; VAT is added per Settings."
        actions={
          <>
            <Button variant="outline" onClick={() => retDlg.open(undefined)}><Undo2 /> {t('Sales return')}</Button>
            <Button variant="outline" onClick={() => invDlg.open(true)}><FilePlus2 /> {t('Direct invoice')}</Button>
            <Button onClick={() => soDlg.open(undefined)}><ShoppingBag /> {t('New sales order')}</Button>
          </>
        }
      />
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Today's sales" value={fmtSAR(todays.reduce((s, i) => s + i.total, 0))} sub={`${todays.length} ${t('invoices')} · ${fmtKg(todays.reduce((s, i) => s + kgOf(i.lines), 0), 0)}`} icon={Receipt} />
        <KpiCard label="Sales this month" value={fmtSAR(mtd.reduce((s, i) => s + i.total, 0), { compact: true })} sub={`${mtd.length} ${t('invoices')}`} icon={FileText} tone="navy" />
        <KpiCard label="Unpaid credit invoices" value={fmtSAR(credit, { compact: true })} sub={t('Balance on credit sales')} icon={Wallet} tone="warning" to="/accounts" />
        <KpiCard label="Open sales orders" value={openOrders.length} sub={`${openOrders.filter((o) => o.status === 'open').length} ${t('awaiting driver')}`} icon={ClipboardList} tone="info" to="/distribution" />
      </div>

      {q && (
        <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-brand/30 bg-brand-soft px-3 py-1 text-[12.5px] text-brand">
          {t('Filtered')}: <b>{q}</b>
          <button onClick={() => setParam('q')} aria-label={t('Clear')}><X className="size-3.5" /></button>
        </div>
      )}

      <Tabs value={tab} onValueChange={(v) => setParam('tab', v)}>
        <TabsList>
          <TabsTrigger value="orders"><ClipboardList /> {t('Sales orders')}</TabsTrigger>
          <TabsTrigger value="invoices"><Receipt /> {t('Invoices')}</TabsTrigger>
          <TabsTrigger value="returns"><RotateCcw /> {t('Sales returns')}</TabsTrigger>
        </TabsList>
        <TabsContent value="orders"><OrdersTab q={q} onOpen={(id) => soDetail.open(id)} /></TabsContent>
        <TabsContent value="invoices"><InvoicesTab q={q} onOpen={(id) => invDetail.open(id)} /></TabsContent>
        <TabsContent value="returns"><ReturnsTab q={q} onOpenInvoice={(id) => invDetail.open(id)} /></TabsContent>
      </Tabs>

      <SalesOrderDialog open={soDlg.isOpen} onOpenChange={soDlg.onOpenChange} customerId={soDlg.value ?? undefined} />
      <DirectInvoiceDialog open={invDlg.isOpen} onOpenChange={invDlg.onOpenChange} onCreated={(id) => invDetail.open(id)} />
      <ReturnDialog open={retDlg.isOpen} onOpenChange={retDlg.onOpenChange} invoiceId={retDlg.value ?? undefined} />
      <InvoiceSheet id={invDetail.value} onOpenChange={invDetail.onOpenChange} onReturn={(id) => retDlg.open(id)} />
      <OrderSheet id={soDetail.value} onOpenChange={soDetail.onOpenChange} onOpenInvoice={(id) => { soDetail.close(); invDetail.open(id) }} />
    </div>
  )
}

// ───────────── orders ─────────────
function OrdersTab({ q, onOpen }: { q: string; onOpen: (id: string) => void }) {
  const t = useT()
  const name = useName()
  const db = useStore((s) => s.db)
  const lk = useLookups()
  const delivered = (so: SalesOrder) => db.deliveries.filter((d) => d.soId === so.id).reduce((s, d) => s + d.lines.reduce((x, l) => x + l.deliveredKg, 0), 0)
  const data = useMemo(() => db.salesOrders.filter((s) => !q || s.soNo.includes(q) || lk.customer[s.customerId]?.name.toLowerCase().includes(q.toLowerCase())).sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [db.salesOrders, q, lk])
  const columns = useMemo<ColumnDef<SalesOrder, any>[]>(
    () => [
      { accessorKey: 'soNo', header: 'Order no.', cell: ({ getValue }) => <span className="font-medium">{getValue()}</span> },
      { id: 'customer', header: 'Customer', accessorFn: (s) => lk.customer[s.customerId]?.name, cell: ({ row }) => <EntityLink to={`/customers/${row.original.customerId}`}>{name(lk.customer[row.original.customerId])}</EntityLink> },
      { id: 'date', header: 'Order date', accessorFn: (s) => s.date, cell: ({ getValue }) => fmtDate(getValue()) },
      { id: 'ddate', header: 'Delivery date', accessorFn: (s) => s.deliveryDate, cell: ({ getValue }) => fmtDate(getValue()) },
      { id: 'kg', header: 'Ordered KG', accessorFn: (s) => kgOf(s.lines), cell: ({ getValue }) => <span className="tabular">{fmtNum(getValue(), 1)}</span> },
      { id: 'dkg', header: 'Delivered KG', accessorFn: (s) => delivered(s), cell: ({ getValue, row }) => <span className={cn('tabular', getValue() > 0 && getValue() < kgOf(row.original.lines) - 0.01 && 'font-medium text-warning')}>{fmtNum(getValue(), 1)}</span> },
      { id: 'value', header: 'Value (excl. VAT)', accessorFn: (s) => s.lines.reduce((x, l) => x + l.qtyKg * l.price, 0), cell: ({ getValue }) => <span className="tabular">{fmtSAR(getValue())}</span> },
      { id: 'pay', header: 'Payment', accessorFn: (s) => s.paymentType, cell: ({ getValue }) => <StatusBadge status={getValue()} label={t(getValue() === 'cash' ? 'Cash' : 'Credit')} /> },
      { id: 'driver', header: 'Driver', accessorFn: (s) => (s.driverId ? lk.driver[s.driverId]?.name : ''), cell: ({ row }) => (row.original.driverId ? name(lk.driver[row.original.driverId]) : <span className="text-muted-foreground">-</span>) },
      { id: 'status', header: 'Status', accessorFn: (s) => s.status, cell: ({ getValue }) => <StatusBadge status={getValue()} /> },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lk, name, t, db.deliveries],
  )
  return (
    <DataTable
      data={data}
      columns={columns}
      exportName="sales-orders"
      onRowClick={(s) => onOpen(s.id)}
      searchText={(s) => `${s.soNo} ${lk.customer[s.customerId]?.name}`}
      facets={[
        { id: 'status', label: 'Status', value: (s) => s.status, options: ['open', 'assigned', 'partially_delivered', 'delivered', 'cancelled'].map((v) => ({ value: v, label: v })) },
        { id: 'pay', label: 'Payment', value: (s) => s.paymentType, options: [{ value: 'cash', label: 'Cash' }, { value: 'credit', label: 'Credit' }] },
      ]}
      emptyText="No sales orders."
    />
  )
}

function OrderSheet({ id, onOpenChange, onOpenInvoice }: { id: string | null; onOpenChange: (o: boolean) => void; onOpenInvoice: (id: string) => void }) {
  const t = useT()
  const name = useName()
  const act = useAction()
  const confirm = useConfirm()
  const nav = useNavigate()
  const db = useStore((s) => s.db)
  const [driverId, setDriverId] = useState('')
  const so = db.salesOrders.find((s) => s.id === id)
  const deliveries = so ? db.deliveries.filter((d) => d.soId === so.id) : []
  useEffect(() => { setDriverId(so ? (db.customers.find((c) => c.id === so.customerId)?.driverId ?? '') : '') }, [so?.id]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Sheet open={!!so} onOpenChange={onOpenChange}>
      <SheetContent>
        {so && (
          <>
            <SheetHeader>
              <SheetTitle>{so.soNo}</SheetTitle>
              <div className="flex flex-wrap items-center gap-2 text-[12.5px] text-muted-foreground">
                <StatusBadge status={so.status} /> {name(db.customers.find((c) => c.id === so.customerId))} · {t('Delivery')} {fmtDate(so.deliveryDate)}
              </div>
            </SheetHeader>
            <div className="flex-1 space-y-4 overflow-y-auto p-5">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b text-[11.5px] text-muted-foreground">
                    <th className="py-1.5 text-start font-medium">{t('Product')}</th>
                    <th className="py-1.5 text-end font-medium">{t('Ordered')}</th>
                    <th className="py-1.5 text-end font-medium">{t('Delivered')}</th>
                    <th className="py-1.5 text-end font-medium">{t('Price / kg')}</th>
                  </tr>
                </thead>
                <tbody>
                  {so.lines.map((l) => {
                    const dk = deliveries.reduce((s, d) => s + (d.lines.find((x) => x.productId === l.productId)?.deliveredKg ?? 0), 0)
                    return (
                      <tr key={l.productId} className="border-b last:border-0">
                        <td className="py-2">{name(db.products.find((p) => p.id === l.productId))}</td>
                        <td className="py-2 text-end tabular">{fmtKg(l.qtyKg)}</td>
                        <td className={cn('py-2 text-end tabular', dk > 0 && dk < l.qtyKg - 0.01 && 'font-medium text-warning')}>{fmtKg(dk)}</td>
                        <td className="py-2 text-end tabular">{fmtNum(l.price, 2)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              {so.status === 'partially_delivered' && <Alert tone="warning">{t('Partially delivered - the invoice covers only the delivered KG.')}</Alert>}
              <div>
                <div className="mb-2 text-[12px] font-semibold text-muted-foreground uppercase">{t('Deliveries')}</div>
                {deliveries.length === 0 && <p className="text-[13px] text-muted-foreground">{t('Not yet assigned to a driver.')}</p>}
                <div className="space-y-2">
                  {deliveries.map((d) => {
                    const inv = d.invoiceId ? db.invoices.find((i) => i.id === d.invoiceId) : undefined
                    return (
                      <div key={d.id} className="rounded-lg border p-3 text-[13px]">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium">{d.deliveryNo}</span>
                          <StatusBadge status={d.status} />
                        </div>
                        <div className="mt-1 text-[12px] text-muted-foreground">{fmtDate(d.date)} · {name(db.drivers.find((x) => x.id === d.driverId))} · {db.vehicles.find((v) => v.id === d.vehicleId)?.plateNo} · {t('Stop')} {d.routeSeq}</div>
                        {d.failReason && <div className="mt-1 text-[12px] text-danger">{d.failReason}</div>}
                        {inv && <Button variant="link" className="mt-1 h-auto p-0 text-brand" onClick={() => onOpenInvoice(inv.id)}>{inv.invNo} · {fmtSAR(inv.total)}</Button>}
                      </div>
                    )
                  })}
                </div>
              </div>
              {so.status === 'open' && (
                <div className="rounded-lg border bg-muted/40 p-3">
                  <Field label="Assign to driver">
                    <div className="flex gap-2">
                      <Picker value={driverId} onChange={setDriverId} options={db.drivers.filter((d) => d.status === 'on_duty' && d.vehicleId).map((d) => ({ value: d.id, label: name(d) }))} />
                      <Button onClick={() => act((d, ctx) => L.assignOrders(d, ctx, [so.id], driverId, so.deliveryDate < todayKey() ? todayKey() : so.deliveryDate), 'Order assigned to driver')} disabled={!driverId}><Truck /> {t('Assign')}</Button>
                    </div>
                  </Field>
                </div>
              )}
              <Button variant="outline" className="w-full" onClick={() => nav('/distribution')}><Truck /> {t('Open distribution board')}</Button>
              {so.status === 'open' && (
                <Button
                  variant="ghost"
                  className="w-full text-danger"
                  onClick={async () => {
                    if (await confirm({ title: t('Cancel order {n}?', { n: so.soNo }), description: t('The order is removed from the dispatch queue. No stock or invoice is affected.'), confirmText: t('Cancel order'), destructive: true }))
                      act((d, ctx) => L.cancelSalesOrder(d, ctx, so.id, 'Cancelled by customer'), 'Order cancelled')
                  }}
                >
                  {t('Cancel order')}
                </Button>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}

// ───────────── invoices ─────────────
function InvoicesTab({ q, onOpen }: { q: string; onOpen: (id: string) => void }) {
  const t = useT()
  const name = useName()
  const db = useStore((s) => s.db)
  const lk = useLookups()
  const today = todayKey()
  const data = useMemo(() => db.invoices.filter((i) => !q || i.invNo.includes(q) || lk.customer[i.customerId]?.name.toLowerCase().includes(q.toLowerCase())).sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.invNo.localeCompare(a.invNo)), [db.invoices, q, lk])
  const columns = useMemo<ColumnDef<Invoice, any>[]>(
    () => [
      { accessorKey: 'invNo', header: 'Invoice no.', cell: ({ getValue }) => <span className="font-medium">{getValue()}</span> },
      { id: 'date', header: 'Date', accessorFn: (i) => i.date, cell: ({ getValue }) => fmtDate(getValue()) },
      { id: 'customer', header: 'Customer', accessorFn: (i) => lk.customer[i.customerId]?.name, cell: ({ row }) => <EntityLink to={`/customers/${row.original.customerId}`}>{name(lk.customer[row.original.customerId])}</EntityLink> },
      { id: 'source', header: 'Source', accessorFn: (i) => i.source, cell: ({ getValue }) => <StatusBadge status={getValue()} /> },
      { id: 'kg', header: 'KG', accessorFn: (i) => kgOf(i.lines), cell: ({ getValue }) => <span className="tabular">{fmtNum(getValue(), 1)}</span> },
      { id: 'subtotal', header: 'Subtotal', accessorFn: (i) => i.subtotal, cell: ({ getValue }) => <span className="tabular">{fmtNum(getValue(), 2)}</span> },
      { id: 'vat', header: 'VAT', accessorFn: (i) => i.vat, cell: ({ getValue }) => <span className="tabular text-muted-foreground">{fmtNum(getValue(), 2)}</span> },
      { id: 'total', header: 'Total', accessorFn: (i) => i.total, cell: ({ getValue }) => <span className="font-medium tabular">{fmtSAR(getValue())}</span> },
      { id: 'balance', header: 'Balance', accessorFn: (i) => invoiceBalance(i), cell: ({ getValue }) => <span className={cn('tabular', getValue() > 0 ? 'font-semibold text-danger' : 'text-muted-foreground')}>{fmtNum(getValue(), 2)}</span> },
      { id: 'pay', header: 'Payment', accessorFn: (i) => i.paymentType, cell: ({ getValue }) => <StatusBadge status={getValue()} label={t(getValue() === 'cash' ? 'Cash' : 'Credit')} /> },
      { id: 'due', header: 'Due date', accessorFn: (i) => i.dueDate, cell: ({ row: { original: i } }) => {
        const overdue = invoiceBalance(i) > 0 && i.dueDate < today
        return <span className={cn('whitespace-nowrap', overdue && 'font-medium text-warning')}>{fmtDate(i.dueDate)}{overdue ? ` · ${t('Overdue')}` : ''}</span>
      } },
      { id: 'status', header: 'Status', accessorFn: (i) => i.status, cell: ({ getValue }) => <StatusBadge status={getValue()} /> },
    ],
    [lk, name, t, today],
  )
  return (
    <DataTable
      data={data}
      columns={columns}
      exportName="sales-invoices"
      onRowClick={(i) => onOpen(i.id)}
      searchText={(i) => `${i.invNo} ${lk.customer[i.customerId]?.name} ${lk.customer[i.customerId]?.nameAr}`}
      facets={[
        { id: 'status', label: 'Status', value: (i) => i.status, options: ['unpaid', 'partial', 'paid', 'void'].map((v) => ({ value: v, label: v })) },
        { id: 'source', label: 'Source', value: (i) => i.source, options: ['direct', 'delivery', 'van_sale', 'opening'].map((v) => ({ value: v, label: v })) },
        { id: 'pay', label: 'Payment', value: (i) => i.paymentType, options: [{ value: 'cash', label: 'Cash' }, { value: 'credit', label: 'Credit' }] },
        { id: 'due', label: 'Due', value: (i) => (invoiceBalance(i) <= 0 ? 'settled' : i.dueDate < today ? 'overdue' : 'not_due'), options: [{ value: 'overdue', label: 'Overdue' }, { value: 'not_due', label: 'Not yet due' }, { value: 'settled', label: 'Settled' }] },
      ]}
      rowClassName={(i) => (i.status === 'void' ? 'opacity-55' : undefined)}
    />
  )
}

function InvoiceSheet({ id, onOpenChange, onReturn }: { id: string | null; onOpenChange: (o: boolean) => void; onReturn: (id: string) => void }) {
  const t = useT()
  const name = useName()
  const nav = useNavigate()
  const act = useAction()
  const confirm = useConfirm()
  const db = useStore((s) => s.db)
  const [print, setPrint] = useState(false)
  const [voidOpen, setVoidOpen] = useState(false)
  const [reason, setReason] = useState('')
  const inv = db.invoices.find((i) => i.id === id)
  const payments = inv ? db.payments.filter((p) => p.allocations.some((a) => a.invoiceId === inv.id)) : []
  const returns = inv ? db.salesReturns.filter((r) => r.invoiceId === inv.id) : []
  const bal = inv ? invoiceBalance(inv) : 0
  const doVoid = async () => {
    if (!inv) return
    if (!reason.trim()) return
    if (!(await confirm({ title: t('Void invoice {n}?', { n: inv.invNo }), description: t('Stock is returned to the warehouse and the invoice is cancelled.'), confirmText: t('Void invoice'), destructive: true }))) return
    const r = act((d, ctx) => L.voidInvoice(d, ctx, inv.id, reason), 'Invoice voided · stock restored')
    if (r.ok) { setVoidOpen(false); setReason('') }
  }
  return (
    <>
      <Sheet open={!!inv} onOpenChange={onOpenChange}>
        <SheetContent>
          {inv && (
            <>
              <SheetHeader>
                <SheetTitle>{inv.invNo}</SheetTitle>
                <div className="flex flex-wrap items-center gap-2 text-[12.5px] text-muted-foreground">
                  <StatusBadge status={inv.status} /> <StatusBadge status={inv.source} /> {fmtDate(inv.date)}
                </div>
              </SheetHeader>
              <div className="flex-1 space-y-4 overflow-y-auto p-5">
                <div>
                  <EntityLink to={`/customers/${inv.customerId}`} className="text-[15px]">{name(db.customers.find((c) => c.id === inv.customerId))}</EntityLink>
                  <div className="text-[12px] text-muted-foreground">
                    {t(inv.paymentType === 'cash' ? 'Cash' : 'Credit')} · {t('Due date')} {fmtDate(inv.dueDate)}
                    {inv.driverId && ` · ${t('Driver')}: ${name(db.drivers.find((d) => d.id === inv.driverId))}`}
                    {inv.warehouseId && ` · ${name(db.warehouses.find((w) => w.id === inv.warehouseId))}`}
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <Stat label="Total" value={fmtSAR(inv.total)} />
                  <Stat label="Paid" value={fmtSAR(inv.paid)} tone="success" />
                  <Stat label="Balance" value={fmtSAR(bal)} tone={bal > 0 ? 'danger' : undefined} />
                </div>
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="border-b text-[11.5px] text-muted-foreground">
                      <th className="py-1.5 text-start font-medium">{t('Product')}</th>
                      <th className="py-1.5 text-end font-medium">KG</th>
                      <th className="py-1.5 text-end font-medium">{t('Price / kg')}</th>
                      <th className="py-1.5 text-end font-medium">{t('Amount')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {inv.lines.map((l) => (
                      <tr key={l.productId} className="border-b last:border-0">
                        <td className="py-2">{name(db.products.find((p) => p.id === l.productId))}</td>
                        <td className="py-2 text-end tabular">{fmtNum(l.qtyKg, 1)}</td>
                        <td className="py-2 text-end tabular">{fmtNum(l.price, 2)}</td>
                        <td className="py-2 text-end tabular">{fmtNum(l.qtyKg * l.price, 2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="ms-auto max-w-xs space-y-1 rounded-lg bg-muted/60 p-3 text-[13px]">
                  <SummaryRow label={t('Subtotal')} value={fmtSAR(inv.subtotal)} />
                  <SummaryRow label={`${t('VAT')} ${inv.vatRate}%`} value={fmtSAR(inv.vat)} />
                  <SummaryRow label={t('Total')} value={fmtSAR(inv.total)} strong />
                  {inv.returned > 0 && <SummaryRow label={t('Credit notes')} value={`- ${fmtSAR(inv.returned)}`} />}
                </div>
                {inv.notes && <p className="text-[12.5px] text-muted-foreground">{inv.notes}</p>}
                <div>
                  <div className="mb-2 text-[12px] font-semibold text-muted-foreground uppercase">{t('Payments & credits')}</div>
                  {payments.length + returns.length === 0 && <p className="text-[13px] text-muted-foreground">{t('No payments recorded yet.')}</p>}
                  <ul className="space-y-1.5 text-[13px]">
                    {payments.map((p) => (
                      <li key={p.id} className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2">
                        <span>{p.receiptNo} · {t(p.method === 'cash' ? 'Cash' : 'Bank transfer')} · {fmtDateTime(p.createdAt)}</span>
                        <span className="flex items-center gap-2"><StatusBadge status={p.verification} /><b className="tabular">{fmtSAR(p.allocations.find((a) => a.invoiceId === inv.id)?.amount ?? 0)}</b></span>
                      </li>
                    ))}
                    {returns.map((r) => (
                      <li key={r.id} className="flex items-center justify-between gap-2 rounded-lg border border-warning/30 px-3 py-2">
                        <span>{r.returnNo} · {t('Credit note')} · {r.reason}</span>
                        <b className="tabular">- {fmtSAR(r.amount)}</b>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 border-t p-4">
                <Button onClick={() => setPrint(true)}><Printer /> {t('Print preview')}</Button>
                {bal > 0 && <Button variant="outline" onClick={() => nav(`/collections?customer=${inv.customerId}&invoice=${inv.id}`)}><Wallet /> {t('Record payment')}</Button>}
                {inv.status !== 'void' && inv.source !== 'opening' && <Button variant="outline" onClick={() => onReturn(inv.id)}><Undo2 /> {t('Return')}</Button>}
                {inv.source === 'direct' && inv.status === 'unpaid' && inv.returned === 0 && <Button variant="ghost" className="text-danger" onClick={() => setVoidOpen(true)}><Ban /> {t('Void')}</Button>}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
      <PrintDialog open={print && !!inv} onOpenChange={setPrint} title="Invoice preview">
        {inv && <InvoiceDoc invoiceId={inv.id} />}
      </PrintDialog>
      <Dialog open={voidOpen} onOpenChange={setVoidOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('Void invoice')}</DialogTitle>
          </DialogHeader>
          <Field label="Reason" required error={!reason.trim() ? 'Enter a reason' : undefined}>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t('e.g. Wrong customer selected')} autoFocus />
          </Field>
          <DialogFooter>
            <Button variant="outline" onClick={() => setVoidOpen(false)}>{t('Cancel')}</Button>
            <Button variant="destructive" disabled={!reason.trim()} onClick={doVoid}>{t('Void invoice')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

// ───────────── returns ─────────────
function ReturnsTab({ q, onOpenInvoice }: { q: string; onOpenInvoice: (id: string) => void }) {
  const t = useT()
  const name = useName()
  const db = useStore((s) => s.db)
  const lk = useLookups()
  const data = useMemo(() => db.salesReturns.filter((r) => !q || r.returnNo.includes(q) || db.invoices.find((i) => i.id === r.invoiceId)?.invNo.includes(q)).sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [db.salesReturns, db.invoices, q])
  const columns = useMemo<ColumnDef<SalesReturn, any>[]>(
    () => [
      { accessorKey: 'returnNo', header: 'Return no.', cell: ({ getValue }) => <span className="font-medium">{getValue()}</span> },
      { id: 'date', header: 'Date', accessorFn: (r) => r.date, cell: ({ getValue }) => fmtDate(getValue()) },
      { id: 'inv', header: 'Invoice', accessorFn: (r) => db.invoices.find((i) => i.id === r.invoiceId)?.invNo, cell: ({ row, getValue }) => <button className="font-medium text-brand-ink hover:text-brand hover:underline" onClick={(e) => { e.stopPropagation(); onOpenInvoice(row.original.invoiceId) }}>{getValue()}</button> },
      { id: 'customer', header: 'Customer', accessorFn: (r) => lk.customer[r.customerId]?.name, cell: ({ row }) => name(lk.customer[row.original.customerId]) },
      { id: 'items', header: 'Products', accessorFn: (r) => r.lines.map((l) => `${lk.product[l.productId]?.code} ${l.qtyKg}kg`).join(', '), cell: ({ row }) => <span className="text-[12px]">{row.original.lines.map((l) => `${name(lk.product[l.productId])} · ${fmtNum(l.qtyKg, 1)} kg`).join(', ')}</span> },
      { id: 'kg', header: 'KG', accessorFn: (r) => kgOf(r.lines), cell: ({ getValue }) => <span className="tabular">{fmtNum(getValue(), 1)}</span> },
      { id: 'amount', header: 'Credit', accessorFn: (r) => r.amount, cell: ({ getValue }) => <span className="font-medium tabular">{fmtSAR(getValue())}</span> },
      { id: 'cond', header: 'Condition', accessorFn: (r) => r.condition, cell: ({ getValue }) => <StatusBadge status={getValue()} tone={getValue() === 'damaged' ? 'danger' : 'success'} label={t(getValue() === 'damaged' ? 'Damaged' : 'Resaleable')} /> },
      { id: 'dest', header: 'Received into', accessorFn: (r) => r.destination, cell: ({ row: { original: r } }) => (r.destination === 'van' ? `${t('Van')} · ${name(lk.driver[r.driverId ?? ''])}` : name(lk.warehouse[r.warehouseId ?? ''])) },
      { accessorKey: 'reason', header: 'Reason', cell: ({ getValue }) => <span className="text-[12px] text-muted-foreground">{getValue()}</span> },
    ],
    [db.invoices, lk, name, t, onOpenInvoice],
  )
  return <DataTable data={data} columns={columns} exportName="sales-returns" searchText={(r) => `${r.returnNo} ${r.reason} ${lk.customer[r.customerId]?.name}`} facets={[{ id: 'cond', label: 'Condition', value: (r) => r.condition, options: [{ value: 'resaleable', label: 'Resaleable' }, { value: 'damaged', label: 'Damaged' }] }]} emptyText="No sales returns yet." />
}
