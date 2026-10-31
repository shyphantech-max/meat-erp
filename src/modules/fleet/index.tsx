import { useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import type { ColumnDef } from '@tanstack/react-table'
import { AlertTriangle, Pencil, Plus, Smartphone, Truck, UserCheck, Users, Wrench } from 'lucide-react'
import type { Driver, Vehicle } from '@/types'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { DataTable } from '@/components/tables/DataTable'
import { KpiCard, Kg, MeterBar, Money, PageHeader, StatusBadge, useDialog } from '@/components/common'
import { useStore } from '@/store/useStore'
import { useUI } from '@/store/useUI'
import { useT, useName } from '@/i18n'
import { daysBetween, fmtDate, fmtNum, todayKey } from '@/lib/format'
import { cn } from '@/lib/utils'
import { DriverFormDialog, VehicleFormDialog, driverDayStats, type DriverDay } from './shared'

type DriverRow = Driver & { vehicle?: Vehicle; customers: number; day: DriverDay }
type VehicleRow = Vehicle & { driver?: Driver; vanKg: number }

export default function FleetPage() {
  const t = useT()
  const name = useName()
  const nav = useNavigate()
  const setRole = useUI((s) => s.setRole)
  const [sp, setSp] = useSearchParams()
  const tab = sp.get('tab') === 'vehicles' ? 'vehicles' : 'drivers'
  const db = useStore((s) => s.db)
  const today = todayKey()
  const driverDlg = useDialog<Driver | 'new'>()
  const vehicleDlg = useDialog<Vehicle | 'new'>()

  const drivers = useMemo<DriverRow[]>(
    () =>
      db.drivers.map((d) => ({
        ...d,
        vehicle: db.vehicles.find((v) => v.id === d.vehicleId),
        customers: db.customers.filter((c) => c.driverId === d.id).length,
        day: driverDayStats(db, d.id, today),
      })),
    [db, today],
  )
  const vehicles = useMemo<VehicleRow[]>(
    () => db.vehicles.map((v) => ({ ...v, driver: db.drivers.find((d) => d.id === v.driverId), vanKg: v.driverId ? drivers.find((d) => d.id === v.driverId)?.day.vanKg ?? 0 : 0 })),
    [db.vehicles, db.drivers, drivers],
  )

  const onDuty = db.drivers.filter((d) => d.status === 'on_duty').length
  const active = db.vehicles.filter((v) => v.status === 'active').length
  const onRoute = drivers.filter((d) => d.day.stops > 0 && d.day.pending > 0).length
  const expiring = db.vehicles.filter((v) => daysBetween(today, v.insuranceExpiry) <= 30).length + db.drivers.filter((d) => daysBetween(today, d.licenseExpiry) <= 30).length

  const driverCols: ColumnDef<DriverRow, any>[] = [
    {
      id: 'name', header: 'Driver', accessorFn: (r) => r.name,
      cell: ({ row: { original: r } }) => (
        <div className="flex items-center gap-2.5">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-soft text-[11px] font-semibold text-brand">{r.name.split(' ').map((w) => w[0]).slice(0, 2).join('')}</span>
          <div className="min-w-0">
            <div className="truncate font-medium">{name(r)}</div>
            <div className="text-[11.5px] text-muted-foreground">{r.code}</div>
          </div>
        </div>
      ),
    },
    { id: 'mobile', header: 'Mobile', accessorFn: (r) => r.mobile, cell: ({ getValue }) => <span dir="ltr" className="tabular">{getValue()}</span> },
    { id: 'vehicle', header: 'Vehicle', accessorFn: (r) => r.vehicle?.plateNo ?? '', cell: ({ row: { original: r } }) => (r.vehicle ? <span><span className="font-medium">{r.vehicle.plateNo}</span> <span className="text-[11.5px] text-muted-foreground">· {r.vehicle.type}</span></span> : <span className="text-muted-foreground">{t('No vehicle')}</span>) },
    { id: 'status', header: 'Status', accessorFn: (r) => r.status, cell: ({ getValue }) => <StatusBadge status={getValue()} /> },
    { id: 'customers', header: 'Assigned customers', accessorFn: (r) => r.customers, cell: ({ getValue }) => <span className="tabular">{getValue()}</span> },
    {
      id: 'deliveries', header: "Today's deliveries", accessorFn: (r) => r.day.done,
      cell: ({ row: { original: r } }) =>
        r.day.stops ? (
          <div className="w-28">
            <div className="mb-1 text-[12px] tabular">{r.day.done}/{r.day.stops}{r.day.failed ? <span className="text-danger"> · {r.day.failed} {t('failed')}</span> : null}</div>
            <MeterBar value={r.day.done} max={r.day.stops} tone="brand" />
          </div>
        ) : (
          <span className="text-muted-foreground">-</span>
        ),
    },
    { id: 'collections', header: "Today's collections", accessorFn: (r) => r.day.collections, cell: ({ getValue }) => <Money value={getValue()} /> },
    { id: 'van', header: 'Van stock', accessorFn: (r) => r.day.vanKg, cell: ({ getValue }) => <Kg value={getValue()} className={cn(!getValue() && 'text-muted-foreground')} /> },
    {
      id: 'actions', header: '', enableSorting: false,
      cell: ({ row: { original: r } }) => (
        <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          <Button size="icon-sm" variant="ghost" title={t('Open Driver View')} disabled={r.status === 'on_leave'} onClick={() => { setRole('driver', r.id); nav('/driver') }}><Smartphone /></Button>
          <Button size="icon-sm" variant="ghost" title={t('Edit')} onClick={() => driverDlg.open(r)}><Pencil /></Button>
        </div>
      ),
    },
  ]
  const vehicleCols: ColumnDef<VehicleRow, any>[] = [
    {
      id: 'plate', header: 'Vehicle number', accessorFn: (r) => r.plateNo,
      cell: ({ row: { original: r } }) => (
        <div className="flex items-center gap-2.5">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-maroon-soft text-maroon"><Truck className="size-4" /></span>
          <div>
            <div className="font-semibold tracking-wide">{r.plateNo}</div>
            <div className="text-[11.5px] text-muted-foreground" dir="rtl">{r.plateAr}</div>
          </div>
        </div>
      ),
    },
    { id: 'type', header: 'Type', accessorFn: (r) => r.type, cell: ({ row: { original: r } }) => <div><div>{r.type}</div><div className="text-[11.5px] text-muted-foreground">{r.make}{r.reefer ? ` · ${t('Reefer')}` : ''}</div></div> },
    { id: 'capacity', header: 'Capacity', accessorFn: (r) => r.capacityKg, cell: ({ row: { original: r } }) => <div className="w-32"><div className="mb-1 text-[12px] tabular">{fmtNum(r.vanKg)} / {fmtNum(r.capacityKg)} kg</div><MeterBar value={r.vanKg} max={r.capacityKg} /></div> },
    { id: 'driver', header: 'Assigned driver', accessorFn: (r) => r.driver?.name ?? '', cell: ({ row: { original: r } }) => (r.driver ? name(r.driver) : <span className="text-muted-foreground">{t('Unassigned')}</span>) },
    { id: 'status', header: 'Status', accessorFn: (r) => r.status, cell: ({ getValue }) => <StatusBadge status={getValue()} /> },
    { id: 'service', header: 'Last service', accessorFn: (r) => r.lastServiceDate, cell: ({ getValue }) => fmtDate(getValue()) },
    {
      id: 'insurance', header: 'Insurance expiry', accessorFn: (r) => r.insuranceExpiry,
      cell: ({ getValue }) => {
        const d = daysBetween(today, getValue())
        return <span className={cn(d <= 30 && 'font-medium text-warning', d < 0 && 'text-danger')}>{fmtDate(getValue())}{d <= 30 && <AlertTriangle className="ms-1 inline size-3.5" />}</span>
      },
    },
    { id: 'actions', header: '', enableSorting: false, cell: ({ row: { original: r } }) => <div className="flex justify-end"><Button size="icon-sm" variant="ghost" title={t('Edit')} onClick={(e) => { e.stopPropagation(); vehicleDlg.open(r) }}><Pencil /></Button></div> },
  ]

  return (
    <div>
      <PageHeader
        title="Drivers & Vehicles"
        description="Driver and refrigerated vehicle master, assignments and today's activity."
        icon={Users}
        actions={
          tab === 'drivers' ? <Button onClick={() => driverDlg.open('new')}><Plus /> {t('Add driver')}</Button> : <Button onClick={() => vehicleDlg.open('new')}><Plus /> {t('Add vehicle')}</Button>
        }
      />
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Drivers on duty" value={`${onDuty} / ${db.drivers.length}`} icon={UserCheck} />
        <KpiCard label="Drivers on route now" value={onRoute} icon={Truck} tone="info" to="/distribution" />
        <KpiCard label="Active vehicles" value={`${active} / ${db.vehicles.length}`} icon={Truck} tone="navy" />
        <KpiCard label="Licence / insurance due ≤30d" value={expiring} icon={Wrench} tone={expiring ? 'warning' : 'neutral'} alert={expiring > 0} />
      </div>
      <Tabs value={tab} onValueChange={(v) => { sp.set('tab', v); setSp(sp, { replace: true }) }}>
        <TabsList>
          <TabsTrigger value="drivers"><Users /> {t('Drivers')} ({db.drivers.length})</TabsTrigger>
          <TabsTrigger value="vehicles"><Truck /> {t('Vehicles')} ({db.vehicles.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="drivers">
          <DataTable
            data={drivers}
            columns={driverCols}
            exportName="drivers"
            searchPlaceholder="Search drivers…"
            searchText={(r) => `${r.name} ${r.nameAr} ${r.mobile} ${r.code} ${r.vehicle?.plateNo ?? ''}`}
            facets={[{ id: 'status', label: 'Status', value: (r) => r.status }]}
            onRowClick={(r) => nav(`/fleet/drivers/${r.id}`)}
          />
        </TabsContent>
        <TabsContent value="vehicles">
          <DataTable
            data={vehicles}
            columns={vehicleCols}
            exportName="vehicles"
            searchPlaceholder="Search vehicles…"
            searchText={(r) => `${r.plateNo} ${r.plateAr} ${r.type} ${r.make} ${r.driver?.name ?? ''}`}
            facets={[{ id: 'status', label: 'Status', value: (r) => r.status }, { id: 'type', label: 'Type', value: (r) => r.type }]}
            onRowClick={(r) => vehicleDlg.open(r)}
          />
        </TabsContent>
      </Tabs>
      <DriverFormDialog open={driverDlg.isOpen} onOpenChange={driverDlg.onOpenChange} driver={driverDlg.value && driverDlg.value !== 'new' ? db.drivers.find((d) => d.id === (driverDlg.value as Driver).id) : undefined} />
      <VehicleFormDialog open={vehicleDlg.isOpen} onOpenChange={vehicleDlg.onOpenChange} vehicle={vehicleDlg.value && vehicleDlg.value !== 'new' ? db.vehicles.find((v) => v.id === (vehicleDlg.value as Vehicle).id) : undefined} />
    </div>
  )
}
