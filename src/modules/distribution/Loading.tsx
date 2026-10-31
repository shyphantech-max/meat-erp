import { useEffect, useMemo, useState } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { Boxes, PackagePlus, Printer, Sparkles, Truck } from 'lucide-react'
import type { ID, SalesLine, VanLoad } from '@/types'
import { Button } from '@/components/ui/button'
import { DataTable } from '@/components/tables/DataTable'
import { Alert, EmptyState, Field, Kg, LineItemsEditor, MeterBar, Panel, Picker, PrintDialog, Stat, useAction, useDialog } from '@/components/common'
import { LoadingSlipDoc } from '@/components/docs'
import { useStore } from '@/store/useStore'
import { useT, useName } from '@/i18n'
import * as L from '@/store/logic'
import { sellableStock, vanStockByProduct } from '@/store/derive'
import { fmtKg, fmtNum, fmtTime, round2, todayKey } from '@/lib/format'
import { useDistParams } from './params'

const blank = (): SalesLine[] => [{ productId: '', qtyKg: 0, price: 0 }]

export default function LoadingTab() {
  const t = useT()
  const name = useName()
  const act = useAction()
  const db = useStore((s) => s.db)
  const { date, driver: driverParam } = useDistParams()
  const today = todayKey()
  const [driverId, setDriverId] = useState<ID>(driverParam || '')
  const [vehicleId, setVehicleId] = useState<ID>('')
  const [warehouseId, setWarehouseId] = useState<ID>('')
  const [lines, setLines] = useState<SalesLine[]>(blank)
  const slip = useDialog<ID>()

  const driver = db.drivers.find((d) => d.id === driverId)
  const vehicle = db.vehicles.find((v) => v.id === vehicleId)
  useEffect(() => {
    if (driver) {
      setVehicleId(driver.vehicleId ?? '')
      setWarehouseId(driver.warehouseId)
    }
  }, [driver?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const available = useMemo(() => (warehouseId ? Object.fromEntries(db.products.map((p) => [p.id, sellableStock(db, p.id, warehouseId, today)])) : undefined), [db, warehouseId, today])
  const van = useMemo(() => (driverId ? vanStockByProduct(db, driverId) : {}), [db, driverId])
  const onVan = round2(Object.values(van).reduce((s, v) => s + v, 0))
  const loading = round2(lines.reduce((s, l) => s + (l.productId ? l.qtyKg : 0), 0))
  const capacity = vehicle?.capacityKg ?? 0
  const over = capacity > 0 && onVan + loading > capacity
  const settled = driverId && db.settlements.some((s) => s.driverId === driverId && s.date === today && s.status !== 'rejected')

  // what today's open stops still need, minus what is already on the van
  const required = useMemo(() => {
    if (!driverId) return [] as { productId: ID; need: number; onVan: number; load: number }[]
    const need: Record<ID, number> = {}
    for (const d of db.deliveries) {
      if (d.driverId !== driverId || d.date !== today || !['pending', 'out_for_delivery'].includes(d.status)) continue
      for (const l of d.lines) need[l.productId] = (need[l.productId] ?? 0) + l.orderedKg
    }
    return Object.entries(need).map(([productId, q]) => {
      const p = db.products.find((x) => x.id === productId)!
      const short = Math.max(0, q - (van[productId] ?? 0))
      return { productId, need: q, onVan: van[productId] ?? 0, load: short > 0 ? Math.ceil(short / p.cartonKg) * p.cartonKg : 0 }
    })
  }, [db, driverId, today, van])

  const suggest = () => {
    const ls = required.filter((r) => r.load > 0).map((r) => ({ productId: r.productId, qtyKg: Math.min(r.load, Math.floor(available?.[r.productId] ?? r.load)), price: 0 }))
    if (!ls.length) return
    setLines(ls)
  }
  const submit = () => {
    if (!driver || !vehicle || !warehouseId) return
    const r = act(
      (d, ctx) => L.loadVan(d, ctx, { driverId: driver.id, vehicleId: vehicle.id, warehouseId, date: today, lines: lines.filter((l) => l.productId).map((l) => ({ productId: l.productId, qtyKg: l.qtyKg })) }),
      () => t('Loading slip generated · {kg} moved to {plate}', { kg: fmtKg(loading), plate: vehicle.plateNo }),
    )
    if (r.ok) {
      setLines(blank())
      slip.open(r.id!)
    }
  }

  const loads = useMemo(() => db.vanLoads.filter((l) => l.date === date).sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [db.vanLoads, date])
  const cols: ColumnDef<VanLoad, any>[] = [
    { id: 'slip', header: 'Slip no.', accessorFn: (r) => r.slipNo, cell: ({ row: { original: r } }) => <div><div className="font-medium">{r.slipNo}</div><div className="text-[11px] text-muted-foreground">{fmtTime(r.createdAt)} · {r.loadedBy}</div></div> },
    { id: 'driver', header: 'Driver', accessorFn: (r) => db.drivers.find((d) => d.id === r.driverId)?.name ?? '', cell: ({ row: { original: r } }) => name(db.drivers.find((d) => d.id === r.driverId)) },
    { id: 'vehicle', header: 'Vehicle', accessorFn: (r) => db.vehicles.find((v) => v.id === r.vehicleId)?.plateNo ?? '' },
    { id: 'wh', header: 'Warehouse', accessorFn: (r) => db.warehouses.find((w) => w.id === r.warehouseId)?.code ?? '' },
    { id: 'products', header: 'Products', accessorFn: (r) => r.lines.length, cell: ({ row: { original: r } }) => <span className="text-[12px]">{r.lines.map((l) => db.products.find((p) => p.id === l.productId)?.code).join(', ')}</span> },
    { id: 'kg', header: 'Loaded KG', accessorFn: (r) => round2(r.lines.reduce((s, l) => s + l.qtyKg, 0)), cell: ({ getValue }) => <Kg value={getValue()} className="font-semibold" /> },
    { id: 'print', header: '', enableSorting: false, cell: ({ row: { original: r } }) => <Button size="icon-sm" variant="ghost" onClick={(e) => { e.stopPropagation(); slip.open(r.id) }} aria-label={t('Print')}><Printer /></Button> },
  ]

  const drivers = db.drivers.filter((d) => d.status === 'on_duty')
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
      <Panel title="Load products into van" description="Stock is picked first-expiry-first-out and moves from warehouse to van stock." icon={PackagePlus}>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Driver" required>
            <Picker value={driverId} onChange={(v) => { setDriverId(v); setLines(blank()) }} options={drivers.map((d) => ({ value: d.id, label: name(d) }))} placeholder="Select driver" />
          </Field>
          <Field label="Vehicle" required>
            <Picker value={vehicleId} onChange={setVehicleId} options={db.vehicles.filter((v) => v.status === 'active').map((v) => ({ value: v.id, label: `${v.plateNo} · ${fmtNum(v.capacityKg)} kg` }))} placeholder="Select vehicle" />
          </Field>
          <Field label="Warehouse" required>
            <Picker value={warehouseId} onChange={setWarehouseId} options={db.warehouses.map((w) => ({ value: w.id, label: name(w) }))} placeholder="Select warehouse" />
          </Field>
        </div>

        {!driverId ? (
          <EmptyState className="mt-4" icon={Truck} title="Select a driver to start loading" description="The driver's vehicle and base warehouse are filled in automatically." />
        ) : (
          <div className="mt-4 space-y-4">
            {settled && <Alert tone="danger">{t('This driver has already submitted today’s settlement - no further loading is allowed.')}</Alert>}
            {date !== today && <Alert tone="info">{t('Loading is always posted on today’s business day.')}</Alert>}
            {required.length > 0 && (
              <div className="rounded-lg border bg-muted/40 p-3">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[12.5px] font-semibold">{t('Required for open stops today')}</span>
                  <Button size="sm" variant="secondary" onClick={suggest} disabled={!required.some((r) => r.load > 0)}><Sparkles /> {t('Suggest from assigned orders')}</Button>
                </div>
                <div className="grid gap-1 text-[12px]">
                  {required.map((r) => (
                    <div key={r.productId} className="grid grid-cols-[1fr_auto_auto_auto] gap-3">
                      <span className="truncate">{name(db.products.find((p) => p.id === r.productId))}</span>
                      <span className="text-muted-foreground tabular">{t('Need')} {fmtNum(r.need)}</span>
                      <span className="text-muted-foreground tabular">{t('On van')} {fmtNum(r.onVan)}</span>
                      <span className={r.load ? 'font-semibold text-brand tabular' : 'text-success tabular'}>{r.load ? `+${fmtNum(r.load)}` : '✓'}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <LineItemsEditor lines={lines} onChange={setLines} products={db.products} available={available} showPrice={false} />
            <div className="grid gap-3 sm:grid-cols-3">
              <Stat label="Already on van" value={fmtKg(onVan)} />
              <Stat label="Loading now" value={fmtKg(loading)} tone="brand" />
              <Stat label="After loading" value={capacity ? `${fmtNum(onVan + loading)} / ${fmtNum(capacity)} kg` : '-'} tone={over ? 'danger' : undefined} />
            </div>
            {capacity > 0 && <MeterBar value={onVan + loading} max={capacity} showLabel />}
            {over && <Alert tone="danger">{t('Load exceeds vehicle capacity by {kg}', { kg: fmtKg(onVan + loading - capacity) })}</Alert>}
            <div className="flex justify-end">
              <Button size="lg" onClick={submit} disabled={!vehicle || !warehouseId || loading <= 0 || over || !!settled}>
                <Boxes /> {t('Generate loading slip')}
              </Button>
            </div>
          </div>
        )}
      </Panel>

      <Panel title="Loading slips" description={t('{n} slip(s) on this day', { n: loads.length })} bodyClassName="p-3">
        {loads.length === 0 ? (
          <EmptyState icon={Boxes} title="No vans loaded on this day" />
        ) : (
          <DataTable data={loads} columns={cols} exportName={`loading-slips-${date}`} compact pageSize={8} onRowClick={(r) => slip.open(r.id)} />
        )}
      </Panel>

      <PrintDialog open={slip.isOpen} onOpenChange={slip.onOpenChange} title="Van Loading Slip">{slip.value && <LoadingSlipDoc loadId={slip.value} />}</PrintDialog>
    </div>
  )
}
