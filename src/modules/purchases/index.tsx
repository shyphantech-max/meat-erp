/** Suppliers & Purchases: supplier master, purchase orders with approval, supplier payments. */
import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { ColumnDef } from '@tanstack/react-table'
import { CheckCircle2, ClipboardList, CreditCard, Hourglass, Pencil, Plus, ShoppingCart, Truck, Users, Wallet, X, XCircle } from 'lucide-react'
import type { ID, PurchaseOrder, Supplier, SupplierPayment } from '@/types'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { DataTable } from '@/components/tables/DataTable'
import { EmptyState, KpiCard, MeterBar, Money, Panel, PageHeader, StatusBadge, useAction } from '@/components/common'
import { useStore } from '@/store/useStore'
import { useT, useName } from '@/i18n'
import * as L from '@/store/logic'
import { poPayable } from '@/store/derive'
import { daysBetween, fmtDate, fmtKg, fmtNum, fmtSAR, todayKey } from '@/lib/format'
import { PayDialog, PODialog, ReasonDialog, SupplierDialog, fmtFx } from './dialogs'
import { PODetailSheet, SupplierSheet } from './sheets'

type Tab = 'suppliers' | 'orders' | 'payments'

export default function PurchasesPage() {
  const t = useT()
  const [params, setParams] = useSearchParams()
  const tab = (['suppliers', 'orders', 'payments'].includes(params.get('tab') ?? '') ? params.get('tab') : 'orders') as Tab
  const q = params.get('q') ?? ''
  const db = useStore((s) => s.db)
  const act = useAction()

  // dialogs / sheets
  const [supplierForm, setSupplierForm] = useState<{ open: boolean; supplier?: Supplier | null }>({ open: false })
  const [supplierSheet, setSupplierSheet] = useState<ID | null>(null)
  const [poForm, setPoForm] = useState<{ open: boolean; po?: PurchaseOrder | null; supplierId?: ID }>({ open: false })
  const [poSheet, setPoSheet] = useState<ID | null>(params.get('id'))
  const [payPO, setPayPO] = useState<PurchaseOrder | null>(null)
  const [rejectPO, setRejectPO] = useState<PurchaseOrder | null>(null)

  const setTab = (v: string) => setParams((p) => { p.set('tab', v); p.delete('q'); return p }, { replace: true })
  const clearQ = () => setParams((p) => { p.delete('q'); return p }, { replace: true })

  const active = db.purchaseOrders.filter((p) => ['approved', 'partially_received', 'received'].includes(p.status))
  const payables = active.reduce((s, p) => s + poPayable(p), 0)
  const pending = db.purchaseOrders.filter((p) => p.status === 'pending_approval')
  const openPOs = db.purchaseOrders.filter((p) => p.status === 'approved' || p.status === 'partially_received')
  const monthStart = todayKey().slice(0, 7)
  const monthPurch = active.filter((p) => p.date.startsWith(monthStart)).reduce((s, p) => s + p.totalSAR, 0)

  return (
    <div>
      <PageHeader
        title="Suppliers & Purchases"
        description="Local and international suppliers, purchase orders with approval, and supplier payment status."
        icon={ShoppingCart}
        actions={
          <>
            <Button variant="outline" onClick={() => setSupplierForm({ open: true, supplier: null })}><Users /> {t('Add supplier')}</Button>
            <Button onClick={() => setPoForm({ open: true, po: null })}><Plus /> {t('New purchase order')}</Button>
          </>
        }
      />
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Pending approval" value={pending.length} sub={fmtSAR(pending.reduce((s, p) => s + p.totalSAR, 0))} icon={Hourglass} tone="warning" alert={pending.length > 0} />
        <KpiCard label="Open purchase orders" value={openPOs.length} sub={t('Awaiting goods receipt')} icon={Truck} tone="info" />
        <KpiCard label="Supplier payables" value={<Money value={payables} />} sub={`${active.filter((p) => poPayable(p) > 0).length} ${t('unpaid POs')}`} icon={Wallet} tone="danger" />
        <KpiCard label="Purchases this month" value={<Money value={monthPurch} />} sub={`${db.suppliers.filter((s) => s.active).length} ${t('active suppliers')}`} icon={ClipboardList} tone="brand" />
      </div>

      {q && (
        <div className="mb-3 inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-[12.5px]">
          {t('Filtered by')}: <span className="font-semibold">{q}</span>
          <button onClick={clearQ} aria-label="Clear"><X className="size-3.5" /></button>
        </div>
      )}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="orders">{t('Purchase orders')}</TabsTrigger>
          <TabsTrigger value="suppliers">{t('Suppliers')}</TabsTrigger>
          <TabsTrigger value="payments">{t('Supplier payments')}</TabsTrigger>
        </TabsList>
        <TabsContent value="orders" className="space-y-4">
          {pending.length > 0 && (
            <Panel title="Approval queue" description="Purchase orders waiting for owner approval" icon={Hourglass}>
              <div className="divide-y">
                {pending.map((po) => {
                  const s = db.suppliers.find((x) => x.id === po.supplierId)
                  return (
                    <div key={po.id} className="flex flex-wrap items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                      <button className="min-w-0 flex-1 text-start" onClick={() => setPoSheet(po.id)}>
                        <div className="text-[13px] font-semibold">{po.poNo} · {s?.name}</div>
                        <div className="text-[12px] text-muted-foreground">
                          {fmtDate(po.date)} · {po.lines.length} {t('lines')} · {fmtKg(po.lines.reduce((a, l) => a + l.qtyKg, 0), 0)} · {t(po.kind === 'import' ? 'Import' : 'Local purchase')}
                        </div>
                      </button>
                      <div className="text-end">
                        <div className="text-[14px] font-semibold tabular">{fmtSAR(po.totalSAR)}</div>
                        {po.currency !== 'SAR' && <div className="text-[11px] text-muted-foreground">{fmtFx(po.totalFx, po.currency)}</div>}
                      </div>
                      <div className="flex gap-1.5">
                        <Button size="sm" onClick={() => act((d, c) => L.setPOStatus(d, c, po.id, 'approve'), 'Purchase order approved')}><CheckCircle2 /> {t('Approve')}</Button>
                        <Button size="sm" variant="outline" onClick={() => setRejectPO(po)}><XCircle /> {t('Reject')}</Button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </Panel>
          )}
          <OrdersTable q={q} onOpen={setPoSheet} onPay={setPayPO} onEdit={(po) => setPoForm({ open: true, po })} />
        </TabsContent>
        <TabsContent value="suppliers">
          <SuppliersTable q={q} onOpen={setSupplierSheet} onEdit={(s) => setSupplierForm({ open: true, supplier: s })} />
        </TabsContent>
        <TabsContent value="payments">
          <PaymentsTab q={q} onOpenPO={setPoSheet} onPay={setPayPO} />
        </TabsContent>
      </Tabs>

      <SupplierDialog open={supplierForm.open} supplier={supplierForm.supplier} onOpenChange={(o) => setSupplierForm((s) => ({ ...s, open: o }))} />
      <PODialog open={poForm.open} po={poForm.po} defaultSupplierId={poForm.supplierId} onOpenChange={(o) => setPoForm((s) => ({ ...s, open: o }))} onSaved={(id) => setPoSheet(id)} />
      <PayDialog po={payPO} open={!!payPO} onOpenChange={(o) => !o && setPayPO(null)} />
      <ReasonDialog
        open={!!rejectPO}
        onOpenChange={(o) => !o && setRejectPO(null)}
        title="Reject purchase order"
        suggestions={['Rate above contract price - renegotiate', 'Quantity not required this month', 'Supplier documents incomplete']}
        onConfirm={(reason) => act((d, c) => L.setPOStatus(d, c, rejectPO!.id, 'reject', reason), 'Purchase order rejected').ok}
      />
      <PODetailSheet poId={poSheet} onOpenChange={(o) => !o && setPoSheet(null)} onEdit={(po) => setPoForm({ open: true, po })} onPay={setPayPO} onReject={setRejectPO} />
      <SupplierSheet
        supplierId={supplierSheet}
        onOpenChange={(o) => !o && setSupplierSheet(null)}
        onEdit={() => setSupplierForm({ open: true, supplier: db.suppliers.find((s) => s.id === supplierSheet) })}
        onNewPO={() => { setPoForm({ open: true, po: null, supplierId: supplierSheet ?? undefined }); setSupplierSheet(null) }}
        onOpenPO={(id) => { setSupplierSheet(null); setPoSheet(id) }}
      />
    </div>
  )
}

const matchQ = (q: string, ...xs: (string | undefined)[]) => !q || xs.some((x) => x?.toLowerCase().includes(q.toLowerCase()))

function OrdersTable({ q, onOpen, onPay, onEdit }: { q: string; onOpen: (id: ID) => void; onPay: (po: PurchaseOrder) => void; onEdit: (po: PurchaseOrder) => void }) {
  const t = useT()
  const db = useStore((s) => s.db)
  const rows = useMemo(
    () => db.purchaseOrders
      .map((po) => ({ po, supplier: db.suppliers.find((s) => s.id === po.supplierId)!, kg: po.lines.reduce((s, l) => s + l.qtyKg, 0), recv: po.lines.reduce((s, l) => s + l.receivedKg, 0) }))
      .filter((r) => matchQ(q, r.po.poNo, r.supplier?.name))
      .sort((a, b) => b.po.date.localeCompare(a.po.date) || b.po.poNo.localeCompare(a.po.poNo)),
    [db.purchaseOrders, db.suppliers, q],
  )
  type Row = (typeof rows)[number]
  const cols: ColumnDef<Row, any>[] = [
    { id: 'poNo', header: 'PO no.', accessorFn: (r) => r.po.poNo, cell: ({ row }) => <span className="font-semibold">{row.original.po.poNo}</span> },
    { id: 'date', header: 'Date', accessorFn: (r) => r.po.date, cell: ({ getValue }) => fmtDate(getValue()) },
    { id: 'supplier', header: 'Supplier', accessorFn: (r) => r.supplier?.name, cell: ({ row }) => <div className="max-w-56"><div className="truncate font-medium">{row.original.supplier?.name}</div><div className="text-[11px] text-muted-foreground">{row.original.supplier?.country}</div></div> },
    { id: 'kind', header: 'Type', accessorFn: (r) => r.po.kind, cell: ({ row }) => <StatusBadge status={row.original.po.kind === 'import' ? 'international' : 'local'} label={t(row.original.po.kind === 'import' ? 'Import' : 'Local')} /> },
    { id: 'kg', header: 'Qty (KG)', accessorFn: (r) => r.kg, cell: ({ row }) => <div className="min-w-28"><div className="tabular">{fmtNum(row.original.recv)} / {fmtNum(row.original.kg)}</div><MeterBar value={row.original.recv} max={row.original.kg} tone="brand" className="mt-1" /></div> },
    { id: 'total', header: 'Total (SAR)', accessorFn: (r) => r.po.totalSAR, cell: ({ row }) => <div className="text-end"><Money value={row.original.po.totalSAR} className="font-medium" />{row.original.po.currency !== 'SAR' && <div className="text-[11px] text-muted-foreground">{fmtFx(row.original.po.totalFx, row.original.po.currency)}</div>}</div> },
    { id: 'status', header: 'Status', accessorFn: (r) => r.po.status, cell: ({ getValue }) => <StatusBadge status={getValue()} /> },
    { id: 'payment', header: 'Payment', accessorFn: (r) => r.po.paymentStatus, cell: ({ getValue }) => <StatusBadge status={getValue()} /> },
    {
      id: 'actions', header: '', enableSorting: false,
      cell: ({ row }) => {
        const po = row.original.po
        return (
          <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
            {['draft', 'pending_approval', 'rejected'].includes(po.status) && <Button size="icon-sm" variant="ghost" onClick={() => onEdit(po)} aria-label="Edit"><Pencil /></Button>}
            {['approved', 'partially_received', 'received'].includes(po.status) && po.paymentStatus !== 'paid' && <Button size="sm" variant="outline" onClick={() => onPay(po)}><CreditCard /> {t('Pay')}</Button>}
          </div>
        )
      },
    },
  ]
  return (
    <DataTable
      data={rows}
      columns={cols}
      onRowClick={(r) => onOpen(r.po.id)}
      searchPlaceholder="Search PO no., supplier…"
      searchText={(r) => `${r.po.poNo} ${r.supplier?.name} ${r.supplier?.country} ${r.po.lines.map((l) => db.products.find((p) => p.id === l.productId)?.name).join(' ')}`}
      facets={[
        { id: 'status', label: 'Status', value: (r) => r.po.status, options: ['draft', 'pending_approval', 'approved', 'partially_received', 'received', 'rejected', 'cancelled'].map((v) => ({ value: v, label: v })) },
        { id: 'payment', label: 'Payment', value: (r) => r.po.paymentStatus, options: ['unpaid', 'partial', 'paid'].map((v) => ({ value: v, label: v })) },
        { id: 'kind', label: 'Type', value: (r) => r.po.kind, options: [{ value: 'local', label: 'Local' }, { value: 'import', label: 'Import' }] },
      ]}
      exportName="purchase-orders"
      emptyText="No purchase orders match your filters."
    />
  )
}

function SuppliersTable({ q, onOpen, onEdit }: { q: string; onOpen: (id: ID) => void; onEdit: (s: Supplier) => void }) {
  const t = useT()
  const db = useStore((s) => s.db)
  const rows = useMemo(
    () => db.suppliers
      .filter((s) => matchQ(q, s.name, s.code, s.country))
      .map((s) => {
        const pos = db.purchaseOrders.filter((p) => p.supplierId === s.id)
        const live = pos.filter((p) => ['approved', 'partially_received', 'received'].includes(p.status))
        return { s, pos: pos.length, purchased: live.reduce((a, p) => a + p.totalSAR, 0), payable: live.reduce((a, p) => a + poPayable(p), 0), last: pos.map((p) => p.date).sort().pop() }
      }),
    [db.suppliers, db.purchaseOrders, q],
  )
  type Row = (typeof rows)[number]
  const cols: ColumnDef<Row, any>[] = [
    { id: 'name', header: 'Supplier', accessorFn: (r) => r.s.name, cell: ({ row }) => <div className="max-w-64"><div className="truncate font-semibold">{row.original.s.name}</div><div className="text-[11px] text-muted-foreground">{row.original.s.code} · {row.original.s.contactPerson}</div></div> },
    { id: 'type', header: 'Type', accessorFn: (r) => r.s.type, cell: ({ getValue }) => <StatusBadge status={getValue()} label={t(getValue() === 'local' ? 'Local' : 'International')} /> },
    { id: 'country', header: 'Country', accessorFn: (r) => r.s.country },
    { id: 'products', header: 'Products', accessorFn: (r) => r.s.products.join(', '), cell: ({ row }) => row.original.s.products.map((p) => t(p === 'chicken' ? 'Chicken' : 'Mutton')).join(' · ') },
    { id: 'currency', header: 'Currency', accessorFn: (r) => r.s.currency },
    { id: 'terms', header: 'Terms', accessorFn: (r) => r.s.paymentTermsDays, cell: ({ getValue }) => `${getValue()} ${t('days')}` },
    { id: 'pos', header: 'POs', accessorFn: (r) => r.pos },
    { id: 'purchased', header: 'Purchased (SAR)', accessorFn: (r) => r.purchased, cell: ({ getValue }) => <Money value={getValue()} /> },
    { id: 'payable', header: 'Payable (SAR)', accessorFn: (r) => r.payable, cell: ({ getValue }) => <Money value={getValue()} className={getValue() > 0 ? 'font-semibold text-danger' : 'text-muted-foreground'} /> },
    { id: 'rating', header: 'Rating', accessorFn: (r) => r.s.rating, cell: ({ getValue }) => <span className="tabular">★ {fmtNum(getValue(), 1)}</span> },
    { id: 'actions', header: '', enableSorting: false, cell: ({ row }) => <div className="flex justify-end" onClick={(e) => e.stopPropagation()}><Button size="icon-sm" variant="ghost" onClick={() => onEdit(row.original.s)} aria-label="Edit"><Pencil /></Button></div> },
  ]
  return (
    <DataTable
      data={rows}
      columns={cols}
      onRowClick={(r) => onOpen(r.s.id)}
      searchPlaceholder="Search suppliers…"
      searchText={(r) => `${r.s.name} ${r.s.code} ${r.s.country} ${r.s.city} ${r.s.contactPerson}`}
      facets={[
        { id: 'type', label: 'Type', value: (r) => r.s.type, options: [{ value: 'local', label: 'Local' }, { value: 'international', label: 'International' }] },
        { id: 'country', label: 'Country', value: (r) => r.s.country },
        { id: 'species', label: 'Products', value: (r) => (r.s.products.length > 1 ? 'both' : r.s.products[0]), options: [{ value: 'chicken', label: 'Chicken' }, { value: 'mutton', label: 'Mutton' }, { value: 'both', label: 'Chicken & mutton' }] },
      ]}
      rowClassName={(r) => (r.s.active ? undefined : 'opacity-60')}
      exportName="suppliers"
    />
  )
}

function PaymentsTab({ q, onOpenPO, onPay }: { q: string; onOpenPO: (id: ID) => void; onPay: (po: PurchaseOrder) => void }) {
  const t = useT()
  const db = useStore((s) => s.db)
  const today = todayKey()
  const due = useMemo(
    () => db.purchaseOrders
      .filter((p) => poPayable(p) > 0)
      .map((po) => {
        const s = db.suppliers.find((x) => x.id === po.supplierId)!
        const grn = db.grns.filter((g) => g.poId === po.id && g.status === 'approved').map((g) => g.receivedDate).sort()[0]
        const dueDate = grn ? new Date(new Date(`${grn}T00:00:00`).getTime() + s.paymentTermsDays * 864e5).toISOString().slice(0, 10) : undefined
        return { po, s, dueDate, overdue: !!dueDate && dueDate < today }
      })
      .filter((r) => matchQ(q, r.po.poNo, r.s.name))
      .sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999')),
    [db, q, today],
  )
  const history = useMemo(
    () => db.supplierPayments.map((p) => ({ p, s: db.suppliers.find((x) => x.id === p.supplierId)!, po: db.purchaseOrders.find((x) => x.id === p.poId) })).filter((r) => matchQ(q, r.p.refNo, r.s?.name, r.po?.poNo)).sort((a, b) => b.p.date.localeCompare(a.p.date)),
    [db.supplierPayments, db.suppliers, db.purchaseOrders, q],
  )
  const bySupplier = useMemo(() => {
    const m: Record<ID, number> = {}
    for (const r of due) m[r.s.id] = (m[r.s.id] ?? 0) + poPayable(r.po)
    return Object.entries(m).map(([id, v]) => ({ s: db.suppliers.find((x) => x.id === id)!, v })).sort((a, b) => b.v - a.v)
  }, [due, db.suppliers])
  const max = Math.max(1, ...bySupplier.map((x) => x.v))
  type DRow = (typeof due)[number]
  const dueCols: ColumnDef<DRow, any>[] = [
    { id: 'po', header: 'PO no.', accessorFn: (r) => r.po.poNo, cell: ({ getValue }) => <span className="font-semibold">{getValue()}</span> },
    { id: 'supplier', header: 'Supplier', accessorFn: (r) => r.s.name },
    { id: 'total', header: 'Total', accessorFn: (r) => r.po.totalSAR, cell: ({ getValue }) => <Money value={getValue()} /> },
    { id: 'paid', header: 'Paid', accessorFn: (r) => r.po.paidSAR, cell: ({ getValue }) => <Money value={getValue()} /> },
    { id: 'balance', header: 'Balance', accessorFn: (r) => poPayable(r.po), cell: ({ getValue }) => <Money value={getValue()} className="font-semibold text-danger" /> },
    { id: 'due', header: 'Due date', accessorFn: (r) => r.dueDate ?? '', cell: ({ row }) => row.original.dueDate ? <span className={row.original.overdue ? 'font-medium text-danger' : ''}>{fmtDate(row.original.dueDate)}{row.original.overdue && ` · ${daysBetween(row.original.dueDate, today)}d ${t('overdue')}`}</span> : <span className="text-muted-foreground">{t('On receipt')}</span> },
    { id: 'status', header: 'Payment', accessorFn: (r) => r.po.paymentStatus, cell: ({ getValue }) => <StatusBadge status={getValue()} /> },
    { id: 'pay', header: '', enableSorting: false, cell: ({ row }) => <div className="flex justify-end" onClick={(e) => e.stopPropagation()}><Button size="sm" onClick={() => onPay(row.original.po)}><CreditCard /> {t('Pay')}</Button></div> },
  ]
  type HRow = (typeof history)[number]
  const histCols: ColumnDef<HRow, any>[] = [
    { id: 'ref', header: 'Voucher', accessorFn: (r) => r.p.refNo, cell: ({ getValue }) => <span className="font-semibold">{getValue()}</span> },
    { id: 'date', header: 'Date', accessorFn: (r) => r.p.date, cell: ({ getValue }) => fmtDate(getValue()) },
    { id: 'supplier', header: 'Supplier', accessorFn: (r) => r.s?.name },
    { id: 'po', header: 'PO no.', accessorFn: (r) => r.po?.poNo },
    { id: 'method', header: 'Method', accessorFn: (r) => r.p.method, cell: ({ getValue }) => t(getValue() === 'lc' ? 'Letter of credit' : getValue() === 'bank' ? 'Bank transfer' : 'Cash') },
    { id: 'reference', header: 'Reference', accessorFn: (r) => r.p.reference ?? '' },
    { id: 'amount', header: 'Amount (SAR)', accessorFn: (r) => r.p.amountSAR, cell: ({ getValue }) => <Money value={getValue()} className="font-medium" /> },
  ]
  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <Panel title="Payables due" description="Approved purchase orders with an outstanding balance" bodyClassName="p-3">
          {due.length === 0 ? <EmptyState title="No supplier payables" description="All approved purchase orders are fully paid." /> : <DataTable data={due} columns={dueCols} onRowClick={(r) => onOpenPO(r.po.id)} exportName="supplier-payables" pageSize={6} rowClassName={(r) => (r.overdue ? 'bg-danger-soft/40' : undefined)} />}
        </Panel>
        <Panel title="Payables by supplier">
          {bySupplier.length === 0 ? <p className="text-center text-[12px] text-muted-foreground">{t('No supplier payables')}</p> : (
            <div className="space-y-3">
              {bySupplier.map(({ s, v }) => (
                <div key={s.id}>
                  <div className="flex justify-between gap-2 text-[12.5px]">
                    <span className="truncate font-medium">{s.name}</span>
                    <Money value={v} className="font-semibold" />
                  </div>
                  <MeterBar value={v} max={max} tone="navy" className="mt-1" />
                </div>
              ))}
              <div className="flex justify-between border-t pt-2 text-[13px] font-semibold">
                <span>{t('Total payables')}</span>
                <Money value={bySupplier.reduce((a, b) => a + b.v, 0)} />
              </div>
            </div>
          )}
        </Panel>
      </div>
      <Panel title="Payment history" bodyClassName="p-3">
        <DataTable data={history} columns={histCols} onRowClick={(r) => r.po && onOpenPO(r.po.id)} exportName="supplier-payments" searchPlaceholder="Search voucher, supplier, reference…" facets={[{ id: 'method', label: 'Method', value: (r) => r.p.method, options: [{ value: 'bank', label: 'Bank transfer' }, { value: 'lc', label: 'Letter of credit' }, { value: 'cash', label: 'Cash' }] }]} />
      </Panel>
    </div>
  )
}
export type { SupplierPayment }
