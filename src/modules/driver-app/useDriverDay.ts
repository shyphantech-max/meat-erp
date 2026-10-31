/** Everything the driver app needs about "my day", derived from the store in one memo. */
import { useMemo } from 'react'
import type { ID } from '@/types'
import { useStore } from '@/store/useStore'
import { useUI } from '@/store/useUI'
import { customerOutstanding, invoiceBalance, vanStockByProduct } from '@/store/derive'
import { round2, todayKey } from '@/lib/format'

export const DONE = ['delivered', 'partial', 'failed']

export function useDriverDay() {
  const db = useStore((s) => s.db)
  const driverId = useUI((s) => s.driverId)
  const today = todayKey()
  return useMemo(() => {
    const driver = db.drivers.find((d) => d.id === driverId)
    const vehicle = driver?.vehicleId ? db.vehicles.find((v) => v.id === driver.vehicleId) : undefined
    const warehouse = db.warehouses.find((w) => w.id === driver?.warehouseId)
    const stops = db.deliveries.filter((d) => d.driverId === driverId && d.date === today).sort((a, b) => a.routeSeq - b.routeSeq)
    const done = stops.filter((s) => DONE.includes(s.status))
    const pending = stops.filter((s) => !DONE.includes(s.status))
    const invoices = db.invoices.filter((i) => i.driverId === driverId && i.date === today && i.status !== 'void')
    const payments = db.payments.filter((p) => p.driverId === driverId && p.date === today && p.verification !== 'rejected')
    const loads = db.vanLoads.filter((l) => l.driverId === driverId && l.date === today)
    const loadedKg = round2(loads.reduce((s, l) => s + l.lines.reduce((t, x) => t + x.qtyKg, 0), 0))
    const van = vanStockByProduct(db, driverId)
    const vanKg = round2(Object.values(van).reduce((s, v) => s + v, 0))
    const customerIds: ID[] = [...new Set([...stops.map((s) => s.customerId), ...db.customers.filter((c) => c.driverId === driverId && c.active).map((c) => c.id)])]
    const routeCustomers = customerIds.map((id) => db.customers.find((c) => c.id === id)!).filter(Boolean)
    const outstanding: Record<ID, number> = Object.fromEntries(customerIds.map((id) => [id, customerOutstanding(db, id)]))
    const oldOutstanding: Record<ID, number> = Object.fromEntries(
      customerIds.map((id) => [id, round2(db.invoices.filter((i) => i.customerId === id && i.date < today).reduce((s, i) => s + invoiceBalance(i), 0))]),
    )
    const mine = db.settlements.filter((s) => s.driverId === driverId && s.date === today)
    const settlement = mine.find((s) => s.status !== 'rejected') ?? mine[mine.length - 1]
    const sum = (xs: number[]) => round2(xs.reduce((s, x) => s + x, 0))
    return {
      db, today, driverId, driver, vehicle, warehouse, stops, done, pending, invoices, payments, loads, loadedKg, van, vanKg, routeCustomers, outstanding, oldOutstanding, settlement,
      sales: sum(invoices.map((i) => i.total)),
      cash: sum(payments.filter((p) => p.method === 'cash').map((p) => p.amount)),
      bank: sum(payments.filter((p) => p.method === 'bank').map((p) => p.amount)),
      collected: sum(payments.map((p) => p.amount)),
      pendingPayments: sum(Object.values(outstanding)),
      unpaidToday: invoices.filter((i) => invoiceBalance(i) > 0),
      dayClosed: !!settlement && settlement.status !== 'rejected',
    }
  }, [db, driverId, today])
}
export type DriverDay = ReturnType<typeof useDriverDay>

// ───── demo login (per browser session) ─────
const KEY = 'meatflow-driver-session'
export const isSignedIn = (id: string) => {
  try {
    return (JSON.parse(sessionStorage.getItem(KEY) ?? '[]') as string[]).includes(id)
  } catch {
    return false
  }
}
export const signIn = (id: string) => {
  const cur = new Set<string>(JSON.parse(sessionStorage.getItem(KEY) ?? '[]'))
  cur.add(id)
  sessionStorage.setItem(KEY, JSON.stringify([...cur]))
}
export const signOut = (id: string) => {
  const cur = (JSON.parse(sessionStorage.getItem(KEY) ?? '[]') as string[]).filter((x) => x !== id)
  sessionStorage.setItem(KEY, JSON.stringify(cur))
}
