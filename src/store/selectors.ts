/** Memoised React selectors over the store. Pure maths lives in ./derive. */
import { useMemo } from 'react'
import type { Customer, Driver, ID, Product, Supplier, Vehicle, Warehouse } from '@/types'
import { useStore } from './useStore'
import { ageingFor, customerOutstanding, invoiceBalance, warehouseStock, batchState, type AgeBucket } from './derive'
import { todayKey, daysBetween } from '@/lib/format'

const byId = <T extends { id: ID }>(a: T[]) => Object.fromEntries(a.map((x) => [x.id, x])) as Record<ID, T>

export function useLookups() {
  const db = useStore((s) => s.db)
  return useMemo(
    () => ({
      product: byId<Product>(db.products),
      customer: byId<Customer>(db.customers),
      driver: byId<Driver>(db.drivers),
      vehicle: byId<Vehicle>(db.vehicles),
      warehouse: byId<Warehouse>(db.warehouses),
      supplier: byId<Supplier>(db.suppliers),
    }),
    [db.products, db.customers, db.drivers, db.vehicles, db.warehouses, db.suppliers],
  )
}

export interface CustomerBalance {
  outstanding: number
  overdue: number
  ageing: Record<AgeBucket, number>
  openInvoices: number
  creditUsedPct: number
  overLimit: boolean
  nearLimit: boolean
}
export function useCustomerBalances() {
  const db = useStore((s) => s.db)
  return useMemo(() => {
    const today = todayKey()
    const out: Record<ID, CustomerBalance> = {}
    for (const c of db.customers) {
      const inv = db.invoices.filter((i) => i.customerId === c.id && invoiceBalance(i) > 0)
      const outstanding = customerOutstanding(db, c.id)
      const pct = c.creditLimit > 0 ? (outstanding / c.creditLimit) * 100 : 0
      out[c.id] = {
        outstanding,
        overdue: inv.filter((i) => i.dueDate < today).reduce((s, i) => s + invoiceBalance(i), 0),
        ageing: ageingFor(db, c.id),
        openInvoices: inv.length,
        creditUsedPct: pct,
        overLimit: pct > 100,
        nearLimit: pct >= 80 && pct <= 100,
      }
    }
    return out
  }, [db.customers, db.invoices])
}

/** stock per product (all warehouses + per warehouse) with status flags */
export function useStockSummary() {
  const db = useStore((s) => s.db)
  return useMemo(() => {
    const today = todayKey()
    return db.products.map((p) => {
      const perWh = Object.fromEntries(db.warehouses.map((w) => [w.id, warehouseStock(db, p.id, w.id)]))
      const batches = db.batches.filter((b) => b.productId === p.id && b.qtyKg > 0.0001)
      const total = batches.reduce((s, b) => s + b.qtyKg, 0)
      const expiredKg = batches.filter((b) => b.expiryDate < today).reduce((s, b) => s + b.qtyKg, 0)
      const nearKg = batches.filter((b) => batchState(db, b) === 'near_expiry').reduce((s, b) => s + b.qtyKg, 0)
      const value = batches.reduce((s, b) => s + b.qtyKg * b.unitCost, 0)
      const available = total - expiredKg
      const nextExpiry = batches.filter((b) => b.expiryDate >= today).sort((a, b) => a.expiryDate.localeCompare(b.expiryDate))[0]?.expiryDate
      return {
        product: p,
        total,
        available,
        expiredKg,
        nearKg,
        value,
        perWh,
        cartons: available / p.cartonKg,
        nextExpiry,
        daysToExpiry: nextExpiry ? daysBetween(today, nextExpiry) : undefined,
        status: (available <= 0 ? 'out' : available < p.reorderLevelKg ? 'low' : 'ok') as 'ok' | 'low' | 'out',
      }
    })
  }, [db.products, db.batches, db.warehouses])
}
