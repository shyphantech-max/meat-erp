/** Fleet helpers shared by the fleet and distribution modules: per-driver day stats and master forms. */
import { useEffect, useState } from 'react'
import type { DayKey, DB, Driver, DriverStatus, ID, Vehicle, VehicleStatus } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field, NumInput, Picker, useAction } from '@/components/common'
import { useStore } from '@/store/useStore'
import { useT, useName } from '@/i18n'
import * as L from '@/store/logic'
import { vanTotalKg } from '@/store/derive'
import { round2, todayKey, shiftDay } from '@/lib/format'

export interface DriverDay {
  driverId: ID
  stops: number
  done: number
  pending: number
  failed: number
  loadedKg: number
  deliveredKg: number
  vanKg: number
  sales: number
  collections: number
  cash: number
  bank: number
  settlementStatus?: string
}

/** activity of one driver on one day, derived from deliveries, loads, van ledger, invoices and payments */
export function driverDayStats(db: DB, driverId: ID, date: DayKey): DriverDay {
  const dl = db.deliveries.filter((d) => d.driverId === driverId && d.date === date)
  const loadedKg = db.vanMovements.filter((m) => m.driverId === driverId && m.date === date && m.type === 'load').reduce((s, m) => s + m.qtyKg, 0)
  const deliveredKg = -db.vanMovements.filter((m) => m.driverId === driverId && m.date === date && (m.type === 'delivery' || m.type === 'van_sale')).reduce((s, m) => s + m.qtyKg, 0)
  const sales = db.invoices.filter((i) => i.driverId === driverId && i.date === date && i.status !== 'void').reduce((s, i) => s + i.total, 0)
  const pays = db.payments.filter((p) => p.driverId === driverId && p.date === date && p.verification !== 'rejected')
  const cash = pays.filter((p) => p.method === 'cash').reduce((s, p) => s + p.amount, 0)
  const bank = pays.filter((p) => p.method === 'bank').reduce((s, p) => s + p.amount, 0)
  const st = db.settlements.find((s) => s.driverId === driverId && s.date === date && s.status !== 'rejected')
  return {
    driverId,
    stops: dl.length,
    done: dl.filter((d) => ['delivered', 'partial', 'failed'].includes(d.status)).length,
    pending: dl.filter((d) => d.status === 'pending' || d.status === 'out_for_delivery').length,
    failed: dl.filter((d) => d.status === 'failed').length,
    loadedKg: round2(loadedKg),
    deliveredKg: round2(deliveredKg),
    vanKg: vanTotalKg(db, driverId),
    sales: round2(sales),
    collections: round2(cash + bank),
    cash: round2(cash),
    bank: round2(bank),
    settlementStatus: st?.status,
  }
}

export const DRIVER_STATUSES: DriverStatus[] = ['on_duty', 'off_duty', 'on_leave']
export const VEHICLE_STATUSES: VehicleStatus[] = ['active', 'maintenance', 'inactive']

// ───────────── driver form ─────────────
type DriverForm = Omit<Driver, 'id'> & { id?: ID }
const blankDriver = (n: number): DriverForm => ({
  code: `DRV-${String(n).padStart(2, '0')}`, name: '', nameAr: '', mobile: '+966 5', iqamaNo: '', licenseExpiry: shiftDay(todayKey(), 365), vehicleId: undefined, warehouseId: 'wh_1', status: 'on_duty', pin: '1234',
})

export function DriverFormDialog({ open, onOpenChange, driver }: { open: boolean; onOpenChange: (o: boolean) => void; driver?: Driver }) {
  const t = useT()
  const name = useName()
  const act = useAction()
  const db = useStore((s) => s.db)
  const [f, setF] = useState<DriverForm>(() => driver ?? blankDriver(db.drivers.length + 1))
  const [err, setErr] = useState<Record<string, string>>({})
  useEffect(() => {
    if (open) { setF(driver ?? blankDriver(db.drivers.length + 1)); setErr({}) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, driver?.id])
  const set = (p: Partial<DriverForm>) => setF((x) => ({ ...x, ...p }))
  const save = () => {
    const e: Record<string, string> = {}
    if (!f.name.trim()) e.name = 'Name is required'
    if (!/^\+?[\d\s]{9,}$/.test(f.mobile.trim())) e.mobile = 'Enter a valid mobile number'
    if (!f.iqamaNo.trim()) e.iqamaNo = 'Iqama / ID number is required'
    if (!/^\d{4}$/.test(f.pin)) e.pin = 'PIN must be 4 digits'
    setErr(e)
    if (Object.keys(e).length) return
    const vehicleId = f.vehicleId || undefined
    const r = act((d, ctx) => {
      const { vehicleId: _v, ...rest } = f
      const res = L.upsertMaster<Driver>(d, ctx, 'drivers', { ...rest, vehicleId: driver?.vehicleId }, 'drv')
      if (!res.ok) return res
      if (vehicleId !== driver?.vehicleId) {
        const r2 = L.assignVehicle(d, ctx, res.id!, vehicleId)
        if (!r2.ok) return r2
      }
      return res
    }, driver ? 'Driver updated' : 'Driver added')
    if (r.ok) onOpenChange(false)
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t(driver ? 'Edit driver' : 'Add driver')}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Name" required error={err.name}><Input value={f.name} onChange={(e) => set({ name: e.target.value })} /></Field>
          <Field label="Name (Arabic)"><Input dir="rtl" value={f.nameAr} onChange={(e) => set({ nameAr: e.target.value })} /></Field>
          <Field label="Driver code"><Input value={f.code} onChange={(e) => set({ code: e.target.value })} /></Field>
          <Field label="Mobile" required error={err.mobile}><Input value={f.mobile} onChange={(e) => set({ mobile: e.target.value })} dir="ltr" /></Field>
          <Field label="Iqama / ID no." required error={err.iqamaNo}><Input value={f.iqamaNo} onChange={(e) => set({ iqamaNo: e.target.value })} /></Field>
          <Field label="License expiry"><Input type="date" value={f.licenseExpiry} onChange={(e) => set({ licenseExpiry: e.target.value })} /></Field>
          <Field label="Base warehouse">
            <Picker value={f.warehouseId} onChange={(v) => set({ warehouseId: v })} options={db.warehouses.map((w) => ({ value: w.id, label: name(w) }))} />
          </Field>
          <Field label="Status">
            <Picker value={f.status} onChange={(v) => set({ status: v as DriverStatus })} options={DRIVER_STATUSES.map((s) => ({ value: s, label: s }))} />
          </Field>
          <Field label="Assigned vehicle" hint="Only active vehicles can be assigned">
            <Picker
              value={f.vehicleId ?? '__none'}
              onChange={(v) => set({ vehicleId: v === '__none' ? undefined : v })}
              options={[
                { value: '__none', label: t('No vehicle') },
                ...db.vehicles.map((v) => ({ value: v.id, label: `${v.plateNo} · ${v.type}${v.driverId && v.driverId !== driver?.id ? ` (${db.drivers.find((x) => x.id === v.driverId)?.name ?? ''})` : ''}`, disabled: v.status !== 'active' })),
              ]}
            />
          </Field>
          <Field label="Driver app PIN" error={err.pin}><Input value={f.pin} maxLength={4} inputMode="numeric" onChange={(e) => set({ pin: e.target.value.replace(/\D/g, '') })} /></Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t('Cancel')}</Button>
          <Button onClick={save}>{t('Save')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ───────────── vehicle form ─────────────
type VehicleForm = Omit<Vehicle, 'id'> & { id?: ID }
const blankVehicle = (): VehicleForm => ({
  plateNo: '', plateAr: '', type: 'Reefer Truck 3T', make: 'Isuzu NPR', capacityKg: 3000, driverId: undefined, status: 'active', reefer: true, lastServiceDate: todayKey(), insuranceExpiry: shiftDay(todayKey(), 365),
})
export const VEHICLE_TYPES = ['Reefer Truck 4T', 'Reefer Truck 3T', 'Reefer Truck 2.5T', 'Chiller Van 1.5T', 'Chiller Van 1.2T']

export function VehicleFormDialog({ open, onOpenChange, vehicle }: { open: boolean; onOpenChange: (o: boolean) => void; vehicle?: Vehicle }) {
  const t = useT()
  const name = useName()
  const act = useAction()
  const db = useStore((s) => s.db)
  const [f, setF] = useState<VehicleForm>(() => vehicle ?? blankVehicle())
  const [err, setErr] = useState<Record<string, string>>({})
  useEffect(() => {
    if (open) { setF(vehicle ?? blankVehicle()); setErr({}) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, vehicle?.id])
  const set = (p: Partial<VehicleForm>) => setF((x) => ({ ...x, ...p }))
  const save = () => {
    const e: Record<string, string> = {}
    if (!f.plateNo.trim()) e.plateNo = 'Plate number is required'
    else if (db.vehicles.some((v) => v.plateNo.toLowerCase() === f.plateNo.trim().toLowerCase() && v.id !== vehicle?.id)) e.plateNo = 'Plate number already exists'
    if (!(f.capacityKg > 0)) e.capacityKg = 'Capacity must be greater than zero'
    if (f.driverId && f.status !== 'active') e.driverId = 'Only active vehicles can have a driver'
    setErr(e)
    if (Object.keys(e).length) return
    const driverId = f.driverId || undefined
    const r = act((d, ctx) => {
      const { driverId: _d, ...rest } = f
      const res = L.upsertMaster<Vehicle>(d, ctx, 'vehicles', { ...rest, plateNo: rest.plateNo.trim().toUpperCase(), driverId: vehicle?.driverId }, 'veh')
      if (!res.ok) return res
      if (driverId !== vehicle?.driverId) {
        if (vehicle?.driverId) { const r0 = L.assignVehicle(d, ctx, vehicle.driverId, undefined); if (!r0.ok) return r0 }
        if (driverId) { const r2 = L.assignVehicle(d, ctx, driverId, res.id!); if (!r2.ok) return r2 }
      }
      // taking a vehicle out of service releases its driver
      if (f.status !== 'active' && vehicle?.driverId && driverId === vehicle.driverId) {
        const r3 = L.assignVehicle(d, ctx, vehicle.driverId, undefined)
        if (!r3.ok) return r3
      }
      return res
    }, vehicle ? 'Vehicle updated' : 'Vehicle added')
    if (r.ok) onOpenChange(false)
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t(vehicle ? 'Edit vehicle' : 'Add vehicle')}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Plate number" required error={err.plateNo}><Input value={f.plateNo} onChange={(e) => set({ plateNo: e.target.value })} placeholder="RKA 1234" /></Field>
          <Field label="Plate (Arabic)"><Input dir="rtl" value={f.plateAr} onChange={(e) => set({ plateAr: e.target.value })} placeholder="ر ك أ ١٢٣٤" /></Field>
          <Field label="Type">
            <Picker value={f.type} onChange={(v) => set({ type: v })} options={[...new Set([...VEHICLE_TYPES, f.type])].map((x) => ({ value: x, label: x }))} />
          </Field>
          <Field label="Make / model"><Input value={f.make} onChange={(e) => set({ make: e.target.value })} /></Field>
          <Field label="Capacity (KG)" required error={err.capacityKg}><NumInput value={f.capacityKg} onChange={(v) => set({ capacityKg: v })} /></Field>
          <Field label="Status">
            <Picker value={f.status} onChange={(v) => set({ status: v as VehicleStatus })} options={VEHICLE_STATUSES.map((s) => ({ value: s, label: s }))} />
          </Field>
          <Field label="Last service"><Input type="date" value={f.lastServiceDate} onChange={(e) => set({ lastServiceDate: e.target.value })} /></Field>
          <Field label="Insurance expiry"><Input type="date" value={f.insuranceExpiry} onChange={(e) => set({ insuranceExpiry: e.target.value })} /></Field>
          <Field label="Assigned driver" error={err.driverId}>
            <Picker
              value={f.driverId ?? '__none'}
              onChange={(v) => set({ driverId: v === '__none' ? undefined : v })}
              options={[{ value: '__none', label: t('Unassigned') }, ...db.drivers.map((d) => ({ value: d.id, label: name(d) }))]}
            />
          </Field>
          <label className="flex items-center gap-2 self-end pb-2 text-[13px]">
            <Switch checked={f.reefer} onCheckedChange={(v) => set({ reefer: v })} /> {t('Refrigerated (reefer) unit')}
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t('Cancel')}</Button>
          <Button onClick={save}>{t('Save')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
