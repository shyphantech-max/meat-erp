/** Customer detail: credit position, ageing, ledger, purchase history and customer-specific pricing. */
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import type { ColumnDef } from '@tanstack/react-table'
import { ArrowLeft, BookOpen, CreditCard, FileText, HandCoins, MapPin, Pencil, Phone, Printer, Receipt, ShoppingBag, Tag, Truck, User } from 'lucide-react'
import type { Customer, Invoice, Product } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { DataTable } from '@/components/tables/DataTable'
import { Alert, EmptyState, MeterBar, NumInput, Panel, PrintDialog, Stat, StatusBadge, useAction, useConfirm, useDialog } from '@/components/common'
import { InvoiceDoc } from '@/components/docs'
import { useStore } from '@/store/useStore'
import { useCustomerBalances, useLookups } from '@/store/selectors'
import { AGE_BUCKETS, invoiceBalance } from '@/store/derive'
import * as L from '@/store/logic'
import { useT, useName } from '@/i18n'
import { cn } from '@/lib/utils'
import { fmtDate, fmtKg, fmtNum, fmtSAR, round2, shiftDay, todayKey } from '@/lib/format'
import { CustomerDialog, BUSINESS_TYPES } from './CustomerDialog'

interface LedgerRow { key: string; date: string; at: string; type: 'invoice' | 'payment' | 'return'; ref: string; detail: string; debit: number; credit: number; balance: number; invoiceId?: string }

export default function CustomerDetail() {
  const { id = '' } = useParams()
  const t = useT()
  const name = useName()
  const nav = useNavigate()
  const db = useStore((s) => s.db)
  const lk = useLookups()
  const bal = useCustomerBalances()[id]
  const c = db.customers.find((x) => x.id === id)
  const edit = useDialog<Customer>()
  const print = useDialog<string>()

  const invoices = useMemo(() => db.invoices.filter((i) => i.customerId === id).sort((a, b) => b.date.localeCompare(a.date) || b.invNo.localeCompare(a.invNo)), [db.invoices, id])
  const ledger = useMemo<LedgerRow[]>(() => {
    if (!c) return []
    const rows: Omit<LedgerRow, 'balance'>[] = []
    for (const i of db.invoices) if (i.customerId === id && i.status !== 'void')
      rows.push({ key: i.id, date: i.date, at: i.createdAt, type: 'invoice', ref: i.invNo, detail: `${t(i.source === 'opening' ? 'Opening balance (register)' : i.source === 'van_sale' ? 'Van sale' : i.source === 'delivery' ? 'Delivery invoice' : 'Direct invoice')} · ${t(i.paymentType === 'cash' ? 'Cash' : 'Credit')}`, debit: i.total, credit: 0, invoiceId: i.id })
    for (const p of db.payments) if (p.customerId === id && p.verification !== 'rejected')
      rows.push({ key: p.id, date: p.date, at: p.createdAt, type: 'payment', ref: p.receiptNo, detail: `${t(p.method === 'cash' ? 'Cash' : 'Bank transfer')}${p.bankRef ? ` · ${p.bankRef}` : ''} · ${p.allocations.map((a) => db.invoices.find((i) => i.id === a.invoiceId)?.invNo).join(', ')}`, debit: 0, credit: p.amount })
    for (const r of db.salesReturns) if (r.customerId === id)
      rows.push({ key: r.id, date: r.date, at: r.createdAt, type: 'return', ref: r.returnNo, detail: `${t('Credit note')} · ${db.invoices.find((i) => i.id === r.invoiceId)?.invNo} · ${r.reason}`, debit: 0, credit: r.amount })
    rows.sort((a, b) => a.date.localeCompare(b.date) || a.at.localeCompare(b.at))
    let run = 0
    return rows.map((r) => ({ ...r, balance: (run = round2(run + r.debit - r.credit)) })).reverse()
  }, [db.invoices, db.payments, db.salesReturns, id, c, t])

  if (!c || !bal) return <EmptyState title="Customer not found" action={<Button variant="outline" onClick={() => nav('/customers')}><ArrowLeft /> {t('Back')}</Button>} />

  const since90 = shiftDay(todayKey(), -90)
  const recent = invoices.filter((i) => i.date >= since90 && i.status !== 'void' && i.source !== 'opening')
  const purchases90 = recent.reduce((s, i) => s + i.total, 0)
  const available = Math.max(0, c.creditLimit - bal.outstanding)
  const lastPay = db.payments.filter((p) => p.customerId === id && p.verification !== 'rejected').sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
  const driver = c.driverId ? lk.driver[c.driverId] : undefined

  return (
    <div>
      <Link to="/customers" className="mb-3 inline-flex items-center gap-1 text-[13px] text-muted-foreground hover:text-foreground"><ArrowLeft className="flip-rtl size-4" /> {t('Customers')}</Link>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-[22px] font-bold tracking-tight text-brand-ink">{name(c)}</h1>
            <StatusBadge status={c.businessType} tone="neutral" label={t(BUSINESS_TYPES.find((b) => b.value === c.businessType)?.label ?? c.businessType)} />
            <StatusBadge status={c.defaultPayment} label={t(c.defaultPayment === 'cash' ? 'Cash' : 'Credit')} />
            {!c.active && <StatusBadge status="inactive" />}
          </div>
          <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-muted-foreground">
            <span className="inline-flex items-center gap-1"><User className="size-3.5" /> {c.contactPerson}</span>
            <span className="inline-flex items-center gap-1"><Phone className="size-3.5" /> {c.phone}</span>
            <span className="inline-flex items-center gap-1"><MapPin className="size-3.5" /> {c.address}</span>
            <span className="inline-flex items-center gap-1"><Truck className="size-3.5" /> {driver ? name(driver) : t('Unassigned')}</span>
            <span>{c.code} · {t('VAT')} {c.vatNo || '-'}</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => edit.open(c)}><Pencil /> {t('Edit')}</Button>
          <Button variant="outline" onClick={() => nav(`/sales?tab=orders&new=${c.id}`)}><ShoppingBag /> {t('New sales order')}</Button>
          <Button onClick={() => nav(`/collections?customer=${c.id}`)}><HandCoins /> {t('Record payment')}</Button>
        </div>
      </div>

      {(bal.overLimit || bal.nearLimit) && (
        <Alert tone={bal.overLimit ? 'danger' : 'warning'} icon={CreditCard} className="mb-4">
          <b>{t(bal.overLimit ? 'Credit limit exceeded' : 'Near credit limit')}</b> - {t('{pct}% of credit limit used', { pct: fmtNum(bal.creditUsedPct) })}. {t(bal.overLimit ? 'New credit sales need an override.' : 'Approaching the credit limit.')}
        </Alert>
      )}

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Stat label="Outstanding" value={fmtSAR(bal.outstanding)} tone={bal.overLimit ? 'danger' : undefined} />
        <Stat label="Credit limit" value={fmtSAR(c.creditLimit)} />
        <Stat label="Available credit" value={fmtSAR(available)} tone={available <= 0 ? 'danger' : 'success'} />
        <Stat label="Overdue" value={fmtSAR(bal.overdue)} tone={bal.overdue > 0 ? 'warning' : undefined} />
        <Stat label="Purchases (90 days)" value={fmtSAR(purchases90, { compact: true })} />
        <Stat label="Last payment" value={lastPay ? `${fmtSAR(lastPay.amount, { compact: true })} · ${fmtDate(lastPay.date)}` : '-'} />
      </div>

      <div className="mb-5 grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <Panel title="Outstanding ageing" icon={CreditCard}>
          <div className="grid grid-cols-4 gap-2">
            {AGE_BUCKETS.map((b, i) => (
              <div key={b} className={cn('rounded-lg border p-3', bal.ageing[b] > 0 && i >= 2 && 'border-danger/30 bg-danger-soft/40', bal.ageing[b] > 0 && i === 1 && 'border-warning/30 bg-warning-soft/40')}>
                <div className="text-[11px] font-medium text-muted-foreground">{b} {t('days')}</div>
                <div className="mt-0.5 text-[14px] font-semibold tabular">{fmtSAR(bal.ageing[b], { compact: true })}</div>
              </div>
            ))}
          </div>
          <div className="mt-4">
            <div className="mb-1 flex justify-between text-[12px] text-muted-foreground"><span>{t('Credit used')}</span><span className="tabular">{fmtSAR(bal.outstanding)} / {fmtSAR(c.creditLimit)}</span></div>
            <MeterBar value={bal.outstanding} max={c.creditLimit} showLabel />
          </div>
        </Panel>
        <PurchaseMix invoices={recent} />
      </div>

      <Tabs defaultValue="ledger">
        <TabsList>
          <TabsTrigger value="ledger"><BookOpen /> {t('Customer ledger')}</TabsTrigger>
          <TabsTrigger value="invoices"><FileText /> {t('Purchase history')}</TabsTrigger>
          <TabsTrigger value="pricing"><Tag /> {t('Customer pricing')}</TabsTrigger>
        </TabsList>
        <TabsContent value="ledger">
          <LedgerTable rows={ledger} onPrint={(invId) => print.open(invId)} />
        </TabsContent>
        <TabsContent value="invoices">
          <InvoiceHistory invoices={invoices} onPrint={(invId) => print.open(invId)} />
        </TabsContent>
        <TabsContent value="pricing">
          <PricingEditor customer={c} />
        </TabsContent>
      </Tabs>

      <CustomerDialog open={edit.isOpen} onOpenChange={edit.onOpenChange} customer={edit.value} />
      <PrintDialog open={print.isOpen} onOpenChange={print.onOpenChange} title="Invoice preview">
        {print.value && <InvoiceDoc invoiceId={print.value} />}
      </PrintDialog>
    </div>
  )
}

function PurchaseMix({ invoices }: { invoices: Invoice[] }) {
  const t = useT()
  const name = useName()
  const products = useStore((s) => s.db.products)
  const mix = useMemo(() => {
    const m: Record<string, { kg: number; sar: number }> = {}
    for (const i of invoices) for (const l of i.lines) {
      const x = (m[l.productId] ??= { kg: 0, sar: 0 })
      x.kg += l.qtyKg
      x.sar += l.qtyKg * l.price
    }
    return Object.entries(m).sort((a, b) => b[1].sar - a[1].sar).slice(0, 6)
  }, [invoices])
  const max = mix[0]?.[1].sar ?? 1
  return (
    <Panel title="Top products (90 days)" icon={ShoppingBag}>
      {mix.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">{t('No purchases in the last 90 days.')}</p>
      ) : (
        <ul className="space-y-2.5">
          {mix.map(([pid, v]) => (
            <li key={pid}>
              <div className="flex justify-between gap-2 text-[12.5px]">
                <span className="truncate">{name(products.find((p) => p.id === pid))}</span>
                <span className="shrink-0 text-muted-foreground tabular">{fmtKg(v.kg, 0)} · {fmtSAR(v.sar, { compact: true })}</span>
              </div>
              <MeterBar className="mt-1" value={v.sar} max={max} tone="brand" />
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

function LedgerTable({ rows, onPrint }: { rows: LedgerRow[]; onPrint: (id: string) => void }) {
  const t = useT()
  const columns = useMemo<ColumnDef<LedgerRow, any>[]>(
    () => [
      { id: 'date', header: 'Date', accessorFn: (r) => r.date, cell: ({ getValue }) => <span className="whitespace-nowrap">{fmtDate(getValue())}</span> },
      { id: 'type', header: 'Type', accessorFn: (r) => r.type, cell: ({ getValue }) => <StatusBadge status={getValue()} tone={getValue() === 'invoice' ? 'navy' : getValue() === 'payment' ? 'success' : 'warning'} label={t(getValue() === 'invoice' ? 'Invoice' : getValue() === 'payment' ? 'Payment' : 'Credit note')} /> },
      { accessorKey: 'ref', header: 'Reference', cell: ({ row: { original: r } }) => r.invoiceId ? <button className="font-medium text-brand-ink hover:text-brand hover:underline" onClick={(e) => { e.stopPropagation(); onPrint(r.invoiceId!) }}>{r.ref}</button> : <span className="font-medium">{r.ref}</span> },
      { accessorKey: 'detail', header: 'Details', cell: ({ getValue }) => <span className="text-[12px] text-muted-foreground">{getValue()}</span> },
      { id: 'debit', header: 'Debit', accessorFn: (r) => r.debit, cell: ({ getValue }) => (getValue() ? <span className="tabular">{fmtNum(getValue(), 2)}</span> : '') },
      { id: 'credit', header: 'Credit', accessorFn: (r) => r.credit, cell: ({ getValue }) => (getValue() ? <span className="text-success tabular">{fmtNum(getValue(), 2)}</span> : '') },
      { id: 'balance', header: 'Balance', accessorFn: (r) => r.balance, cell: ({ getValue }) => <span className="font-semibold tabular">{fmtNum(getValue(), 2)}</span> },
    ],
    [t, onPrint],
  )
  return <DataTable data={rows} columns={columns} exportName="customer-ledger" searchText={(r) => `${r.ref} ${r.detail}`} facets={[{ id: 'type', label: 'Type', value: (r) => r.type, options: [{ value: 'invoice', label: 'Invoice' }, { value: 'payment', label: 'Payment' }, { value: 'return', label: 'Credit note' }] }]} pageSize={12} emptyText="No transactions yet." />
}

function InvoiceHistory({ invoices, onPrint }: { invoices: Invoice[]; onPrint: (id: string) => void }) {
  const t = useT()
  const today = todayKey()
  const columns = useMemo<ColumnDef<Invoice, any>[]>(
    () => [
      { accessorKey: 'invNo', header: 'Invoice no.', cell: ({ getValue }) => <span className="font-medium">{getValue()}</span> },
      { id: 'date', header: 'Date', accessorFn: (i) => i.date, cell: ({ getValue }) => fmtDate(getValue()) },
      { id: 'source', header: 'Source', accessorFn: (i) => i.source, cell: ({ getValue }) => <StatusBadge status={getValue()} /> },
      { id: 'kg', header: 'KG', accessorFn: (i) => i.lines.reduce((s, l) => s + l.qtyKg, 0), cell: ({ getValue }) => <span className="tabular">{fmtNum(getValue(), 1)}</span> },
      { id: 'total', header: 'Total', accessorFn: (i) => i.total, cell: ({ getValue }) => <span className="tabular">{fmtSAR(getValue())}</span> },
      { id: 'balance', header: 'Balance', accessorFn: (i) => invoiceBalance(i), cell: ({ getValue }) => <span className={cn('font-semibold tabular', getValue() > 0 && 'text-danger')}>{fmtSAR(getValue())}</span> },
      { id: 'due', header: 'Due date', accessorFn: (i) => i.dueDate, cell: ({ row: { original: i } }) => <span className={cn(invoiceBalance(i) > 0 && i.dueDate < today && 'font-medium text-warning')}>{fmtDate(i.dueDate)}</span> },
      { id: 'status', header: 'Status', accessorFn: (i) => i.status, cell: ({ getValue }) => <StatusBadge status={getValue()} /> },
      { id: 'act', header: '', enableSorting: false, cell: ({ row }) => <Button variant="ghost" size="icon-sm" onClick={(e) => { e.stopPropagation(); onPrint(row.original.id) }} aria-label={t('Print')}><Printer /></Button> },
    ],
    [t, today, onPrint],
  )
  return <DataTable data={invoices} columns={columns} exportName="customer-invoices" onRowClick={(i) => onPrint(i.id)} searchText={(i) => i.invNo} facets={[{ id: 'status', label: 'Status', value: (i) => i.status }]} emptyText="No invoices yet." />
}

function PricingEditor({ customer }: { customer: Customer }) {
  const t = useT()
  const name = useName()
  const act = useAction()
  const confirm = useConfirm()
  const products = useStore((s) => s.db.products)
  const [prices, setPrices] = useState<Record<string, number>>(customer.prices)
  const [q, setQ] = useState('')
  useEffect(() => { setPrices(customer.prices) }, [customer.prices])
  const dirty = JSON.stringify(prices) !== JSON.stringify(customer.prices)
  const save = async () => {
    const clean = Object.fromEntries(Object.entries(prices).filter(([, v]) => v > 0))
    const bad = Object.entries(clean).find(([pid, v]) => v < (products.find((p) => p.id === pid)?.costPrice ?? 0))
    if (bad && !(await confirm({ title: t('Price below cost'), description: t('{p} is priced below cost. Save anyway?', { p: name(products.find((p) => p.id === bad[0])) }), confirmText: t('Save prices') }))) return
    act((db, ctx) => L.upsertMaster<Customer>(db, ctx, 'customers', { ...customer, prices: clean }, 'cus'), 'Customer pricing saved')
  }
  const list = products.filter((p) => p.active && `${p.name} ${p.nameAr} ${p.code}`.toLowerCase().includes(q.toLowerCase()))
  return (
    <Panel
      title="Customer-specific pricing"
      description="Prices in SAR/kg excl. VAT. Leave blank to use the list price."
      icon={Receipt}
      actions={
        <>
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('Search…')} className="h-8 w-44" />
          <Button size="sm" variant="outline" disabled={!dirty} onClick={() => setPrices(customer.prices)}>{t('Discard')}</Button>
          <Button size="sm" disabled={!dirty} onClick={save}>{t('Save prices')}</Button>
        </>
      }
      bodyClassName="p-0"
    >
      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b bg-muted/40 text-[11.5px] text-muted-foreground">
              <th className="px-4 py-2 text-start font-medium">{t('Product')}</th>
              <th className="px-3 py-2 text-end font-medium">{t('Cost / kg')}</th>
              <th className="px-3 py-2 text-end font-medium">{t('List price')}</th>
              <th className="px-3 py-2 text-start font-medium">{t('Customer price')}</th>
              <th className="px-3 py-2 text-end font-medium">{t('Discount')}</th>
              <th className="px-4 py-2 text-end font-medium">{t('Margin')}</th>
            </tr>
          </thead>
          <tbody>
            {list.map((p: Product) => {
              const cp = prices[p.id] ?? 0
              const eff = cp > 0 ? cp : p.sellPrice
              const disc = cp > 0 ? ((p.sellPrice - cp) / p.sellPrice) * 100 : 0
              const margin = ((eff - p.costPrice) / eff) * 100
              return (
                <tr key={p.id} className={cn('border-b last:border-0', cp > 0 && 'bg-brand-soft/30')}>
                  <td className="px-4 py-2"><div className="font-medium">{name(p)}</div><div className="text-[11px] text-muted-foreground">{p.code}</div></td>
                  <td className="px-3 py-2 text-end text-muted-foreground tabular">{fmtNum(p.costPrice, 2)}</td>
                  <td className="px-3 py-2 text-end tabular">{fmtNum(p.sellPrice, 2)}</td>
                  <td className="px-3 py-2"><NumInput value={cp} placeholder={fmtNum(p.sellPrice, 2)} onChange={(v) => setPrices((x) => ({ ...x, [p.id]: v }))} className="h-8 w-28" aria-label={t('Customer price')} /></td>
                  <td className={cn('px-3 py-2 text-end tabular', disc > 0 ? 'text-brand' : disc < 0 ? 'text-warning' : 'text-muted-foreground')}>{cp > 0 ? `${fmtNum(disc, 1)}%` : '-'}</td>
                  <td className={cn('px-4 py-2 text-end tabular', margin < 0 && 'font-semibold text-danger')}>{fmtNum(margin, 1)}%</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </Panel>
  )
}
