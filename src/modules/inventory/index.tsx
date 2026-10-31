/** Inventory: stock overview, batches, movement history, adjustments and product master. */
import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { ColumnDef } from '@tanstack/react-table'
import { AlertTriangle, ArrowLeftRight, Boxes, CalendarClock, Coins, PackageMinus, Pencil, Plus, Scale, TrendingDown, X } from 'lucide-react'
import type { Batch, Product, StockMovement } from '@/types'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { DataTable } from '@/components/tables/DataTable'
import { EmptyState, KpiCard, MeterBar, Panel, PageHeader, Picker, StatusBadge, useDialog } from '@/components/common'
import { useStore } from '@/store/useStore'
import { useStockSummary } from '@/store/selectors'
import { batchState } from '@/store/derive'
import { useT, useName } from '@/i18n'
import { cn } from '@/lib/utils'
import { fmtDate, fmtKg, fmtNum, fmtSAR, todayKey } from '@/lib/format'
import { AdjustDialog, ProductDialog, TransferDialog, daysLeft } from './dialogs'

type Row = ReturnType<typeof useStockSummary>[number]
const TABS = ['stock', 'batches', 'movements', 'adjustments', 'products'] as const

export default function InventoryPage() {
  const t = useT()
  const [sp, setSp] = useSearchParams()
  const tab = (TABS as readonly string[]).includes(sp.get('tab') ?? '') ? (sp.get('tab') as string) : 'stock'
  const focus = sp.get('product') ?? ''
  const db = useStore((s) => s.db)
  const summary = useStockSummary()
  const [wh, setWh] = useState<string>('all')
  const transfer = useDialog<string | undefined>()
  const adjust = useDialog<string | undefined>()
  const productDlg = useDialog<Product | null>()
  const name = useName()

  const setTab = (v: string) => {
    const n = new URLSearchParams(sp)
    n.set('tab', v)
    setSp(n, { replace: true })
  }
  const clearFocus = () => {
    const n = new URLSearchParams(sp)
    n.delete('product')
    setSp(n, { replace: true })
  }
  const focusProduct = db.products.find((p) => p.id === focus)

  const k = useMemo(() => {
    const total = summary.reduce((s, r) => s + r.total, 0)
    return {
      total,
      value: summary.reduce((s, r) => s + r.value, 0),
      low: summary.filter((r) => r.status !== 'ok'),
      near: summary.reduce((s, r) => s + r.nearKg, 0),
      expired: summary.reduce((s, r) => s + r.expiredKg, 0),
      chicken: summary.filter((r) => r.product.species === 'chicken').reduce((s, r) => s + r.available, 0),
      mutton: summary.filter((r) => r.product.species === 'mutton').reduce((s, r) => s + r.available, 0),
    }
  }, [summary])

  return (
    <div>
      <PageHeader
        title="Inventory"
        icon={Boxes}
        description="Stock by warehouse and batch, expiry control, transfers and write-offs. Stock is picked first-expiry-first-out."
        actions={
          <>
            <Button variant="outline" onClick={() => transfer.open(focus || undefined)}><ArrowLeftRight /> {t('Transfer')}</Button>
            <Button variant="outline" onClick={() => adjust.open(undefined)}><PackageMinus /> {t('Write-off')}</Button>
            <Button onClick={() => productDlg.open(null)}><Plus /> {t('New product')}</Button>
          </>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <KpiCard label="Total stock" value={fmtKg(k.total, 0)} sub={`${t('Chicken')} ${fmtNum(k.chicken)} · ${t('Mutton')} ${fmtNum(k.mutton)} kg`} icon={Scale} />
        <KpiCard label="Stock value (cost)" value={fmtSAR(k.value, { compact: true })} sub={t('Weighted batch cost')} icon={Coins} tone="navy" />
        <KpiCard label="Low-stock products" value={k.low.length} sub={t('Below reorder level')} icon={TrendingDown} tone={k.low.length ? 'warning' : 'success'} alert={k.low.length > 0} />
        <KpiCard label="Near expiry" value={fmtKg(k.near, 0)} sub={t('Sell first')} icon={CalendarClock} tone="warning" to="/inventory?tab=batches" />
        <KpiCard label="Expired stock" value={fmtKg(k.expired, 0)} sub={t('Needs write-off')} icon={AlertTriangle} tone={k.expired > 0 ? 'danger' : 'success'} alert={k.expired > 0} to="/inventory?tab=adjustments" />
      </div>

      {focusProduct && (
        <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-brand/30 bg-brand-soft px-3 py-1 text-[12.5px] text-brand">
          {t('Showing')}: <b>{name(focusProduct)}</b>
          <button onClick={clearFocus} aria-label={t('Clear')}><X className="size-3.5" /></button>
        </div>
      )}

      <Tabs value={tab} onValueChange={setTab}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <TabsList>
            <TabsTrigger value="stock">{t('Stock overview')}</TabsTrigger>
            <TabsTrigger value="batches">{t('Batches & expiry')}</TabsTrigger>
            <TabsTrigger value="movements">{t('Stock movements')}</TabsTrigger>
            <TabsTrigger value="adjustments">{t('Transfers & adjustments')}</TabsTrigger>
            <TabsTrigger value="products">{t('Product master')}</TabsTrigger>
          </TabsList>
          {(tab === 'stock' || tab === 'batches') && (
            <Picker size="sm" className="w-56" value={wh} onChange={setWh} options={[{ value: 'all', label: t('All warehouses') }, ...db.warehouses.map((w) => ({ value: w.id, label: name(w) }))]} />
          )}
        </div>
        <TabsContent value="stock">
          <StockTab summary={summary} wh={wh} focus={focus} low={k.low} onTransfer={(id) => transfer.open(id)} onReorder={() => {}} />
        </TabsContent>
        <TabsContent value="batches">
          <BatchesTab wh={wh} focus={focus} onWriteOff={(id) => adjust.open(id)} />
        </TabsContent>
        <TabsContent value="movements">
          <MovementsTab focus={focus} />
        </TabsContent>
        <TabsContent value="adjustments">
          <AdjustmentsTab onTransfer={() => transfer.open(undefined)} onWriteOff={() => adjust.open(undefined)} />
        </TabsContent>
        <TabsContent value="products">
          <ProductsTab onEdit={(p) => productDlg.open(p)} />
        </TabsContent>
      </Tabs>

      <TransferDialog open={transfer.isOpen} onOpenChange={transfer.onOpenChange} productId={transfer.value ?? undefined} />
      <AdjustDialog open={adjust.isOpen} onOpenChange={adjust.onOpenChange} batchId={adjust.value ?? undefined} />
      <ProductDialog open={productDlg.isOpen} onOpenChange={productDlg.onOpenChange} product={productDlg.value} />
    </div>
  )
}

// ───────────── stock overview ─────────────
function StockTab({ summary, wh, focus, low, onTransfer }: { summary: Row[]; wh: string; focus: string; low: Row[]; onTransfer: (id: string) => void; onReorder: () => void }) {
  const t = useT()
  const name = useName()
  const db = useStore((s) => s.db)
  const rows = useMemo(() => {
    const r = focus ? summary.filter((x) => x.product.id === focus) : summary
    if (wh === 'all') return r
    return r.map((x) => ({ ...x, available: x.perWh[wh] ?? 0, total: x.perWh[wh] ?? 0 }))
  }, [summary, focus, wh])
  const columns = useMemo<ColumnDef<Row, any>[]>(
    () => [
      {
        id: 'product',
        header: 'Product',
        accessorFn: (r) => r.product.name,
        cell: ({ row: { original: r } }) => (
          <div className="min-w-48">
            <div className="font-medium text-brand-ink">{name(r.product)}</div>
            <div className="text-[11.5px] text-muted-foreground">{r.product.code} · {t(r.product.category === 'fresh' ? 'Fresh' : r.product.category === 'chilled' ? 'Chilled' : 'Frozen')} · {r.product.origin}</div>
          </div>
        ),
      },
      { id: 'available', header: 'Available KG', accessorFn: (r) => Math.round(r.available * 10) / 10, cell: ({ getValue }) => <span className="font-semibold tabular">{fmtNum(getValue(), 1)}</span> },
      { id: 'cartons', header: 'Cartons', accessorFn: (r) => Math.round((r.available / r.product.cartonKg) * 10) / 10, cell: ({ row: { original: r }, getValue }) => <span className="tabular text-muted-foreground">{fmtNum(getValue(), 1)} <span className="text-[11px]">× {r.product.cartonKg} kg</span></span> },
      ...(wh === 'all'
        ? db.warehouses.map<ColumnDef<Row, any>>((w) => ({ id: w.id, header: w.code, accessorFn: (r) => Math.round(r.perWh[w.id] ?? 0), cell: ({ getValue }) => <span className={cn('tabular', !getValue() && 'text-muted-foreground/50')}>{fmtNum(getValue())}</span> }))
        : []),
      {
        id: 'level',
        header: 'Stock level',
        accessorFn: (r) => r.product.reorderLevelKg,
        enableSorting: false,
        cell: ({ row: { original: r } }) => (
          <div className="w-36">
            <MeterBar value={r.available} max={r.product.reorderLevelKg * 3} tone={r.status === 'out' ? 'danger' : r.status === 'low' ? 'warning' : 'brand'} />
            <div className="mt-0.5 text-[11px] text-muted-foreground">{t('Reorder at')} {fmtNum(r.product.reorderLevelKg)} kg</div>
          </div>
        ),
      },
      { id: 'cost', header: 'Cost / kg', accessorFn: (r) => r.product.costPrice, cell: ({ getValue }) => <span className="tabular">{fmtNum(getValue(), 2)}</span> },
      { id: 'sell', header: 'Sell / kg', accessorFn: (r) => r.product.sellPrice, cell: ({ getValue }) => <span className="tabular">{fmtNum(getValue(), 2)}</span> },
      { id: 'value', header: 'Value (SAR)', accessorFn: (r) => Math.round(r.value), cell: ({ getValue }) => <span className="tabular">{fmtNum(getValue())}</span> },
      {
        id: 'expiry',
        header: 'Next expiry',
        accessorFn: (r) => r.nextExpiry ?? '',
        cell: ({ row: { original: r } }) =>
          r.nextExpiry ? (
            <div className="text-[12.5px]">
              {fmtDate(r.nextExpiry)}
              <div className={cn('text-[11px]', (r.daysToExpiry ?? 99) <= 5 ? 'text-warning' : 'text-muted-foreground')}>{t('{n} days left', { n: r.daysToExpiry ?? 0 })}</div>
            </div>
          ) : (
            '-'
          ),
      },
      {
        id: 'status',
        header: 'Status',
        accessorFn: (r) => r.status,
        cell: ({ row: { original: r } }) => (
          <div className="flex flex-wrap gap-1">
            <StatusBadge status={r.status} label={r.status === 'ok' ? t('In stock') : r.status === 'low' ? t('Low stock') : t('Out of stock')} />
            {r.expiredKg > 0 && <StatusBadge status="expired" label={`${fmtNum(r.expiredKg)} kg ${t('expired')}`} />}
          </div>
        ),
      },
      {
        id: 'act',
        header: '',
        enableSorting: false,
        cell: ({ row: { original: r } }) => (
          <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); onTransfer(r.product.id) }}>
            <ArrowLeftRight /> {t('Transfer')}
          </Button>
        ),
      },
    ],
    [db.warehouses, wh, name, t, onTransfer],
  )
  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_300px]">
      <DataTable
        data={rows}
        columns={columns}
        exportName="stock-availability"
        searchPlaceholder="Search product or code…"
        searchText={(r) => `${r.product.name} ${r.product.nameAr} ${r.product.code} ${r.product.origin}`}
        facets={[
          { id: 'species', label: 'Species', value: (r) => r.product.species, options: [{ value: 'chicken', label: 'Chicken' }, { value: 'mutton', label: 'Mutton' }] },
          { id: 'cat', label: 'Category', value: (r) => r.product.category, options: [{ value: 'fresh', label: 'Fresh' }, { value: 'chilled', label: 'Chilled' }, { value: 'frozen', label: 'Frozen' }] },
          { id: 'status', label: 'Status', value: (r) => r.status, options: [{ value: 'ok', label: 'In stock' }, { value: 'low', label: 'Low stock' }, { value: 'out', label: 'Out of stock' }] },
        ]}
        pageSize={15}
        rowClassName={(r) => (r.status !== 'ok' ? 'bg-warning-soft/30' : undefined)}
      />
      <Panel title="Low-stock alerts" icon={TrendingDown} bodyClassName="p-0">
        {low.length === 0 ? (
          <EmptyState className="m-4 border-0" title="All products above reorder level" />
        ) : (
          <ul className="divide-y">
            {low.map((r) => (
              <li key={r.product.id} className="px-4 py-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-[13px] font-medium">{name(r.product)}</div>
                    <div className="text-[11.5px] text-muted-foreground">{fmtKg(r.available, 0)} / {t('reorder')} {fmtNum(r.product.reorderLevelKg)} kg</div>
                  </div>
                  <StatusBadge status={r.status} label={r.status === 'out' ? t('Out of stock') : t('Low stock')} />
                </div>
                <MeterBar className="mt-2" value={r.available} max={r.product.reorderLevelKg} tone={r.status === 'out' ? 'danger' : 'warning'} showLabel />
              </li>
            ))}
          </ul>
        )}
        <div className="border-t p-3 text-[11.5px] text-muted-foreground">{t('Raise a purchase order from Suppliers & Purchases to replenish.')}</div>
      </Panel>
    </div>
  )
}

// ───────────── batches ─────────────
type BatchRow = Batch & { productName: string; state: ReturnType<typeof batchState>; days: number; value: number }
function BatchesTab({ wh, focus, onWriteOff }: { wh: string; focus: string; onWriteOff: (id: string) => void }) {
  const t = useT()
  const name = useName()
  const db = useStore((s) => s.db)
  const data = useMemo<BatchRow[]>(
    () =>
      db.batches
        .filter((b) => b.qtyKg > 0.0001 && (wh === 'all' || b.warehouseId === wh) && (!focus || b.productId === focus))
        .map((b) => ({ ...b, productName: name(db.products.find((p) => p.id === b.productId)), state: batchState(db, b), days: daysLeft(b.expiryDate), value: b.qtyKg * b.unitCost }))
        .sort((a, b) => a.expiryDate.localeCompare(b.expiryDate)),
    [db, wh, focus, name],
  )
  const columns = useMemo<ColumnDef<BatchRow, any>[]>(
    () => [
      { accessorKey: 'batchNo', header: 'Batch no.', cell: ({ getValue }) => <span className="font-mono text-[12.5px] font-medium">{getValue()}</span> },
      { accessorKey: 'productName', header: 'Product' },
      { id: 'wh', header: 'Warehouse', accessorFn: (b) => db.warehouses.find((w) => w.id === b.warehouseId)?.code ?? '' },
      { id: 'qty', header: 'Qty (KG)', accessorFn: (b) => Math.round(b.qtyKg * 10) / 10, cell: ({ getValue, row }) => (
        <div className="w-28">
          <span className="font-semibold tabular">{fmtNum(getValue(), 1)}</span>
          <MeterBar className="mt-1" value={row.original.qtyKg} max={row.original.initialKg} tone="navy" />
        </div>
      ) },
      { id: 'received', header: 'Received', accessorFn: (b) => b.receivedDate, cell: ({ getValue }) => fmtDate(getValue()) },
      { id: 'expiry', header: 'Expiry date', accessorFn: (b) => b.expiryDate, cell: ({ getValue }) => fmtDate(getValue()) },
      { id: 'days', header: 'Days left', accessorFn: (b) => b.days, cell: ({ getValue }) => <span className={cn('tabular font-medium', getValue() < 0 ? 'text-danger' : getValue() <= 5 ? 'text-warning' : '')}>{getValue()}</span> },
      { id: 'cost', header: 'Unit cost', accessorFn: (b) => b.unitCost, cell: ({ getValue }) => <span className="tabular">{fmtNum(getValue(), 2)}</span> },
      { id: 'state', header: 'Status', accessorFn: (b) => b.state, cell: ({ getValue }) => <StatusBadge status={getValue()} /> },
      {
        id: 'act',
        header: '',
        enableSorting: false,
        cell: ({ row: { original: b } }) => (
          <Button variant={b.state === 'expired' ? 'destructive' : 'ghost'} size="sm" onClick={(e) => { e.stopPropagation(); onWriteOff(b.id) }}>
            <PackageMinus /> {t('Write-off')}
          </Button>
        ),
      },
    ],
    [db.warehouses, t, onWriteOff],
  )
  return (
    <DataTable
      data={data}
      columns={columns}
      exportName="batches-expiry"
      searchPlaceholder="Search batch or product…"
      searchText={(b) => `${b.batchNo} ${b.productName}`}
      facets={[
        { id: 'state', label: 'Expiry status', value: (b) => b.state, options: [{ value: 'ok', label: 'ok' }, { value: 'near_expiry', label: 'near_expiry' }, { value: 'expired', label: 'expired' }] },
        { id: 'cat', label: 'Category', value: (b) => db.products.find((p) => p.id === b.productId)?.category, options: [{ value: 'fresh', label: 'Fresh' }, { value: 'chilled', label: 'Chilled' }, { value: 'frozen', label: 'Frozen' }] },
      ]}
      rowClassName={(b) => (b.state === 'expired' ? 'bg-danger-soft/40' : b.state === 'near_expiry' ? 'bg-warning-soft/40' : undefined)}
      pageSize={15}
    />
  )
}

// ───────────── movements ─────────────
const MOVE_LABEL: Record<string, string> = {
  grn_in: 'GRN inward', van_load: 'Van loading', van_return: 'Van return', transfer_out: 'Transfer out', transfer_in: 'Transfer in', damage: 'Damaged write-off',
  expired: 'Expired write-off', direct_sale: 'Direct sale', customer_return: 'Customer return', adjust_plus: 'Adjustment +',
}
type MoveRow = StockMovement & { productName: string; batchNo: string; whCode: string }
function useMoves(filter: (m: StockMovement) => boolean) {
  const db = useStore((s) => s.db)
  const name = useName()
  return useMemo<MoveRow[]>(
    () =>
      db.stockMovements
        .filter(filter)
        .map((m) => ({ ...m, productName: name(db.products.find((p) => p.id === m.productId)), batchNo: db.batches.find((b) => b.id === m.batchId)?.batchNo ?? '-', whCode: db.warehouses.find((w) => w.id === m.warehouseId)?.code ?? '' }))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [db.stockMovements, db.batches, name],
  )
}
function moveColumns(t: (s: string) => string): ColumnDef<MoveRow, any>[] {
  return [
    { id: 'date', header: 'Date', accessorFn: (m) => m.createdAt, cell: ({ row }) => <span className="whitespace-nowrap">{fmtDate(row.original.date)}</span> },
    { id: 'type', header: 'Type', accessorFn: (m) => t(MOVE_LABEL[m.type] ?? m.type), cell: ({ row }) => <StatusBadge status={row.original.qtyKg >= 0 ? 'received' : 'pending'} tone={row.original.qtyKg >= 0 ? 'success' : ['damage', 'expired'].includes(row.original.type) ? 'danger' : 'navy'} label={t(MOVE_LABEL[row.original.type] ?? row.original.type)} /> },
    { accessorKey: 'productName', header: 'Product' },
    { accessorKey: 'batchNo', header: 'Batch no.', cell: ({ getValue }) => <span className="font-mono text-[12px]">{getValue()}</span> },
    { accessorKey: 'whCode', header: 'Warehouse' },
    { id: 'qty', header: 'Qty (KG)', accessorFn: (m) => m.qtyKg, cell: ({ getValue }) => <span className={cn('font-semibold tabular', getValue() >= 0 ? 'text-success' : 'text-danger')}>{getValue() >= 0 ? '+' : ''}{fmtNum(getValue(), 1)}</span> },
    { accessorKey: 'ref', header: 'Reference', cell: ({ getValue }) => <span className="font-mono text-[12px]">{getValue()}</span> },
    { id: 'note', header: 'Notes', accessorFn: (m) => m.note ?? '', cell: ({ getValue }) => <span className="text-[12px] text-muted-foreground">{getValue()}</span> },
  ]
}
function MovementsTab({ focus }: { focus: string }) {
  const t = useT()
  const rows = useMoves((m) => !focus || m.productId === focus)
  const columns = useMemo(() => moveColumns(t), [t])
  const inKg = rows.filter((m) => m.qtyKg > 0).reduce((s, m) => s + m.qtyKg, 0)
  const outKg = rows.filter((m) => m.qtyKg < 0).reduce((s, m) => s - m.qtyKg, 0)
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-4 text-[13px]">
        <span>{t('Inward')}: <b className="text-success tabular">{fmtKg(inKg, 0)}</b></span>
        <span>{t('Outward')}: <b className="text-danger tabular">{fmtKg(outKg, 0)}</b></span>
      </div>
      <DataTable
        data={rows}
        columns={columns}
        exportName="stock-movements"
        searchPlaceholder="Search reference, batch, product…"
        searchText={(m) => `${m.ref} ${m.batchNo} ${m.productName} ${m.note ?? ''}`}
        facets={[
          { id: 'type', label: 'Type', value: (m) => m.type, options: Object.entries(MOVE_LABEL).map(([value, label]) => ({ value, label })) },
          { id: 'dir', label: 'Direction', value: (m) => (m.qtyKg >= 0 ? 'in' : 'out'), options: [{ value: 'in', label: 'Inward' }, { value: 'out', label: 'Outward' }] },
          { id: 'wh', label: 'Warehouse', value: (m) => m.whCode },
        ]}
        pageSize={15}
      />
    </div>
  )
}

function AdjustmentsTab({ onTransfer, onWriteOff }: { onTransfer: () => void; onWriteOff: () => void }) {
  const t = useT()
  const today = todayKey()
  const db = useStore((s) => s.db)
  const rows = useMoves((m) => ['transfer_out', 'transfer_in', 'damage', 'expired', 'adjust_plus'].includes(m.type))
  const columns = useMemo(() => moveColumns(t), [t])
  const expired = db.batches.filter((b) => b.qtyKg > 0 && b.expiryDate < today)
  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2">
        <Panel title="Warehouse transfers" icon={ArrowLeftRight} actions={<Button size="sm" onClick={onTransfer}><ArrowLeftRight /> {t('New transfer')}</Button>}>
          <p className="text-[13px] text-muted-foreground">{t('Move stock between cold stores. Batches and expiry dates travel with the stock.')}</p>
        </Panel>
        <Panel title="Damaged & expired stock" icon={PackageMinus} actions={<Button size="sm" variant="destructive" onClick={onWriteOff}><PackageMinus /> {t('Write-off')}</Button>}>
          {expired.length ? (
            <p className="text-[13px] text-danger">{t('{n} expired batch(es) with {kg} still on hand - write them off.', { n: expired.length, kg: fmtKg(expired.reduce((s, b) => s + b.qtyKg, 0), 0) })}</p>
          ) : (
            <p className="text-[13px] text-muted-foreground">{t('No expired stock on hand.')}</p>
          )}
        </Panel>
      </div>
      <DataTable data={rows} columns={columns} exportName="transfers-adjustments" searchText={(m) => `${m.ref} ${m.batchNo} ${m.productName} ${m.note ?? ''}`} facets={[{ id: 'type', label: 'Type', value: (m) => m.type, options: ['transfer_out', 'transfer_in', 'damage', 'expired'].map((v) => ({ value: v, label: MOVE_LABEL[v] })) }]} emptyText="No transfers or adjustments yet." />
    </div>
  )
}

function ProductsTab({ onEdit }: { onEdit: (p: Product) => void }) {
  const t = useT()
  const name = useName()
  const products = useStore((s) => s.db.products)
  const columns = useMemo<ColumnDef<Product, any>[]>(
    () => [
      { accessorKey: 'code', header: 'Code', cell: ({ getValue }) => <span className="font-mono text-[12.5px] font-medium">{getValue()}</span> },
      { id: 'name', header: 'Name', accessorFn: (p) => p.name, cell: ({ row: { original: p } }) => <div><div className="font-medium">{name(p)}</div><div className="text-[11.5px] text-muted-foreground" dir="auto">{p.nameAr}</div></div> },
      { id: 'species', header: 'Species', accessorFn: (p) => p.species, cell: ({ getValue }) => <StatusBadge status={getValue()} tone={getValue() === 'chicken' ? 'brand' : 'navy'} label={t(getValue() === 'chicken' ? 'Chicken' : 'Mutton')} /> },
      { id: 'category', header: 'Category', accessorFn: (p) => p.category, cell: ({ getValue }) => <StatusBadge status={getValue()} tone={getValue() === 'frozen' ? 'info' : getValue() === 'chilled' ? 'brand' : 'warning'} label={t(getValue() === 'fresh' ? 'Fresh' : getValue() === 'chilled' ? 'Chilled' : 'Frozen')} /> },
      { id: 'pack', header: 'Pack', accessorFn: (p) => `${t(p.packLabel)} ${p.cartonKg} kg` },
      { id: 'cost', header: 'Cost / kg', accessorFn: (p) => p.costPrice, cell: ({ getValue }) => <span className="tabular">{fmtNum(getValue(), 2)}</span> },
      { id: 'sell', header: 'Sell / kg', accessorFn: (p) => p.sellPrice, cell: ({ getValue }) => <span className="tabular">{fmtNum(getValue(), 2)}</span> },
      { id: 'margin', header: 'Margin', accessorFn: (p) => Math.round(((p.sellPrice - p.costPrice) / p.sellPrice) * 1000) / 10, cell: ({ getValue }) => <span className="tabular">{fmtNum(getValue(), 1)}%</span> },
      { id: 'reorder', header: 'Reorder (KG)', accessorFn: (p) => p.reorderLevelKg, cell: ({ getValue }) => <span className="tabular">{fmtNum(getValue())}</span> },
      { id: 'shelf', header: 'Shelf life', accessorFn: (p) => p.shelfLifeDays, cell: ({ getValue }) => `${getValue()} ${t('days')}` },
      { accessorKey: 'origin', header: 'Origin' },
      { id: 'active', header: 'Status', accessorFn: (p) => (p.active ? 'active' : 'inactive'), cell: ({ getValue }) => <StatusBadge status={getValue()} /> },
      { id: 'act', header: '', enableSorting: false, cell: ({ row }) => <Button variant="ghost" size="icon-sm" onClick={(e) => { e.stopPropagation(); onEdit(row.original) }} aria-label={t('Edit')}><Pencil /></Button> },
    ],
    [name, t, onEdit],
  )
  return (
    <DataTable
      data={products}
      columns={columns}
      exportName="product-master"
      onRowClick={onEdit}
      searchText={(p) => `${p.code} ${p.name} ${p.nameAr} ${p.origin}`}
      facets={[
        { id: 'species', label: 'Species', value: (p) => p.species, options: [{ value: 'chicken', label: 'Chicken' }, { value: 'mutton', label: 'Mutton' }] },
        { id: 'cat', label: 'Category', value: (p) => p.category, options: [{ value: 'fresh', label: 'Fresh' }, { value: 'chilled', label: 'Chilled' }, { value: 'frozen', label: 'Frozen' }] },
      ]}
      pageSize={15}
    />
  )
}
