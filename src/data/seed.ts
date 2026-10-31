/**
 * Demo data generator. Instead of hand-writing balances, it builds master data and then
 * *replays* the business: purchase orders → shipments → GRNs → van loading → deliveries →
 * payments → returns → settlements, all through the same transaction functions the UI uses.
 * That keeps stock, van stock, invoices, outstanding balances and settlements consistent.
 * Dates are relative to the day the demo is first opened (or reset).
 */
import type { DayKey, DB, ID, SalesLine, Settings } from '@/types'
import { round2, shiftDay, todayKey } from '@/lib/format'
import { mulberry32 } from '@/lib/random'
import { defaultRoles, defaultUsers } from '@/lib/rbac'
import { CUSTOMERS, DRIVERS, FX, PREFS, QTY, VEHICLES, masterProducts, masterSuppliers, masterWarehouses } from './master'
import * as L from '@/store/logic'
import { customerPrice, invoiceBalance, sellableStock, vanStockByProduct } from '@/store/derive'

export const DB_VERSION = 5

const at = (d: DayKey, hhmm: string) => new Date(`${d}T${hhmm}:00`).toISOString()

export function emptyDB(today: DayKey): DB {
  const settings: Settings = {
    companyName: 'Al Waha Meat Trading Co.',
    companyNameAr: 'شركة الواحة لتجارة اللحوم',
    crNo: '1010458231',
    vatNo: '310245678900003',
    address: 'Al Sulay Industrial Area, Riyadh 14322, Kingdom of Saudi Arabia',
    phone: '+966 11 498 2200',
    email: 'accounts@alwahameat.sa',
    vatRate: 15,
    invoicePrefix: 'INV',
    nearExpiryFrozenDays: 30,
    nearExpiryChilledDays: 5,
    nearExpiryFreshDays: 2,
    cashVarianceToleranceSAR: 50,
    goLiveDate: shiftDay(today, -30),
    seededAt: today,
  }
  return {
    version: DB_VERSION, settings, products: [], warehouses: [], suppliers: [], purchaseOrders: [], supplierPayments: [], shipments: [], grns: [], batches: [],
    stockMovements: [], customers: [], drivers: [], vehicles: [], salesOrders: [], deliveries: [], invoices: [], salesReturns: [], payments: [], vanLoads: [],
    vanMovements: [], stockLosses: [], settlements: [], notifications: [], activity: [], archive: [], roles: [], users: [], counters: {},
  }
}

export function buildSeed(today: DayKey = todayKey()): DB {
  const rnd = mulberry32(20261031)
  const pickR = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)]
  const between = (a: number, b: number) => a + rnd() * (b - a)
  const D = (n: number) => shiftDay(today, n)
  const db = emptyDB(today)

  // ───── masters ─────
  db.products = masterProducts()
  db.warehouses = masterWarehouses()
  db.suppliers = masterSuppliers()
  db.drivers = DRIVERS.map(([name, nameAr, mobile, warehouseId, status], i) => ({
    id: `drv_${i + 1}`, code: `DRV-${String(i + 1).padStart(2, '0')}`, name, nameAr, mobile, iqamaNo: `2${String(Math.floor(between(100000000, 999999999)))}`,
    licenseExpiry: D(Math.floor(between(120, 900))), vehicleId: `veh_${i + 1}`, warehouseId, status, pin: String(1000 + i * 1111).slice(0, 4),
  }))
  db.vehicles = VEHICLES.map(([plateNo, plateAr, type, make, capacityKg], i) => ({
    id: `veh_${i + 1}`, plateNo, plateAr, type, make, capacityKg, driverId: `drv_${i + 1}`, status: i === 7 ? 'maintenance' : 'active', reefer: true,
    lastServiceDate: D(-Math.floor(between(10, 80))), insuranceExpiry: D(Math.floor(between(60, 300))),
  }))
  db.customers = CUSTOMERS.map(([name, nameAr, businessType, city, district, contactPerson, creditLimit, paymentTermsDays, defaultPayment, drv], i) => {
    const prefs = PREFS[businessType]
    const prices: Record<ID, number> = {}
    for (const pi of prefs.slice(0, 5)) {
      const p = db.products[pi]
      prices[p.id] = round2(p.sellPrice * (1 - between(0.015, businessType === 'wholesale' ? 0.08 : 0.05)) * 4) / 4
    }
    return {
      id: `cus_${i + 1}`, code: `CUS-${String(i + 1).padStart(3, '0')}`, name, nameAr, businessType, contactPerson,
      phone: `+966 5${Math.floor(between(0, 9))} ${Math.floor(between(100, 999))} ${Math.floor(between(1000, 9999))}`,
      email: `${name.toLowerCase().replace(/[^a-z]+/g, '.').replace(/^\.|\.$/g, '').split('.').slice(0, 3).join('.')}@example.sa`,
      city, district, address: `${district} District, ${city}`, vatNo: `3${String(Math.floor(between(10000000000000, 99999999999999)))}`,
      driverId: `drv_${drv}`, creditLimit, paymentTermsDays, defaultPayment, prices, active: true,
    }
  })
  // walk-in (retail) customer used by the counter / POS
  db.customers.push({
    id: 'cus_walkin', code: 'CUS-WALKIN', name: 'Walk-in Customer', nameAr: 'عميل نقدي (زائر)', businessType: 'walk_in', contactPerson: '-', phone: '-', email: '-',
    city: 'Riyadh', district: 'Al Sulay', address: 'Counter sales - Riyadh Central Cold Store', vatNo: '-', creditLimit: 0, paymentTermsDays: 0, defaultPayment: 'cash', prices: {}, active: true,
  })
  db.roles = defaultRoles()
  db.users = defaultUsers(db.drivers)
  db.counters = { po: 1080, grn: 1040, inv: 4100, so: 6200, dlv: 7300, rcpt: 2600, load: 900, stl: 300, shp: 210, spay: 440, vret: 300, ret: 60, trf: 40, adj: 30, loss: 10 }

  // ───── register archive: monthly totals migrated from the paper books (before go-live) ─────
  const goLiveMonth = db.settings.goLiveDate.slice(0, 7)
  for (let m = 12; m >= 1; m--) {
    const d = new Date(`${goLiveMonth}-01T00:00:00`)
    d.setMonth(d.getMonth() - m)
    const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const season = 1 + 0.12 * Math.sin((d.getMonth() + 1) / 12 * Math.PI * 2) + (m < 5 ? 0.06 : 0)
    const sales = Math.round(between(690000, 780000) * season / 100) * 100
    const chicken = Math.round(sales * between(0.58, 0.64) / 100) * 100
    db.archive.push({ month, sales, collections: Math.round(sales * between(0.9, 1.0) / 100) * 100, chickenSales: chicken, muttonSales: sales - chicken })
  }

  // ───── timeline of events, replayed in chronological order ─────
  type Ev = { at: string; seq: number; label: string; run: (ctx: L.Ctx) => unknown }
  const events: Ev[] = []
  let seq = 0
  const ev = (date: DayKey, time: string, label: string, run: (ctx: L.Ctx) => unknown, user = 'Tariq Al Mutairi') =>
    events.push({ at: `${date} ${time}`, seq: seq++, label, run: (ctx) => run({ ...ctx, user, today: date, now: at(date, time) }) })
  const must = (r: any, label: string) => {
    if (!r?.ok) console.warn(`[seed] ${label}: ${r?.error}`)
    return r?.ok ? r : undefined
  }
  const pid = (i: number) => db.products[i].id
  const ids: Record<string, ID> = {}

  // purchase orders: [supplierIdx, kind, daysAgo, wh, lines [productIdx, kg, rate], fate, grnDaysAgo, extra]
  type Fate = 'received' | 'partial' | 'split' | 'grn_rejected' | 'grn_received' | 'grn_qc' | 'approved' | 'in_transit' | 'customs' | 'pending' | 'rejected' | 'draft'
  type POSpec = { s: number; kind: 'local' | 'import'; ago: number; wh: string; lines: [number, number, number][]; fate: Fate; grnAgo?: number; expiry?: Record<number, number> }
  const POS: POSpec[] = [
    { s: 0, kind: 'import', ago: 88, wh: 'wh_1', lines: [[0, 24000, 2.28], [6, 12000, 1.85]], fate: 'received', grnAgo: 60, expiry: { 0: 24 } },
    { s: 1, kind: 'import', ago: 80, wh: 'wh_1', lines: [[3, 10000, 4.1], [5, 8000, 2.95]], fate: 'received', grnAgo: 52 },
    { s: 3, kind: 'import', ago: 75, wh: 'wh_1', lines: [[9, 9000, 9.4]], fate: 'received', grnAgo: 48 },
    { s: 4, kind: 'import', ago: 70, wh: 'wh_1', lines: [[11, 6000, 13.2]], fate: 'received', grnAgo: 40 },
    { s: 5, kind: 'import', ago: 66, wh: 'wh_2', lines: [[13, 8000, 5.6]], fate: 'received', grnAgo: 41, expiry: { 13: 40 } },
    { s: 2, kind: 'import', ago: 60, wh: 'wh_2', lines: [[1, 14000, 2.35], [8, 6000, 2.6]], fate: 'received', grnAgo: 30 },
    { s: 0, kind: 'import', ago: 55, wh: 'wh_3', lines: [[7, 8000, 3.6], [0, 12000, 2.3]], fate: 'received', grnAgo: 25 },
    { s: 3, kind: 'import', ago: 45, wh: 'wh_1', lines: [[9, 8000, 9.6], [12, 2500, 15.8]], fate: 'split', grnAgo: 12 },
    { s: 1, kind: 'import', ago: 40, wh: 'wh_1', lines: [[6, 14000, 1.9], [5, 6000, 3.0]], fate: 'partial', grnAgo: 9 },
    { s: 4, kind: 'import', ago: 28, wh: 'wh_1', lines: [[11, 5000, 13.4]], fate: 'in_transit' },
    { s: 0, kind: 'import', ago: 24, wh: 'wh_1', lines: [[0, 24000, 2.32], [3, 8000, 4.2]], fate: 'customs' },
    { s: 5, kind: 'import', ago: 2, wh: 'wh_2', lines: [[13, 10000, 5.5]], fate: 'pending' },
    { s: 9, kind: 'local', ago: 50, wh: 'wh_3', lines: [[3, 3000, 16.6], [7, 2000, 14.0]], fate: 'received', grnAgo: 48 },
    { s: 6, kind: 'local', ago: 9, wh: 'wh_1', lines: [[2, 1400, 10.2]], fate: 'received', grnAgo: 8 },
    { s: 7, kind: 'local', ago: 5, wh: 'wh_1', lines: [[2, 1800, 10.4], [4, 600, 18.8]], fate: 'received', grnAgo: 4 },
    { s: 8, kind: 'local', ago: 5, wh: 'wh_1', lines: [[10, 1000, 37.5], [14, 400, 33.0]], fate: 'received', grnAgo: 4 },
    { s: 6, kind: 'local', ago: 3, wh: 'wh_1', lines: [[2, 2000, 10.2]], fate: 'received', grnAgo: 2 },
    { s: 8, kind: 'local', ago: 3, wh: 'wh_1', lines: [[10, 900, 37.0]], fate: 'received', grnAgo: 2 },
    { s: 7, kind: 'local', ago: 1, wh: 'wh_1', lines: [[2, 2200, 10.3], [4, 500, 18.9]], fate: 'received', grnAgo: 0 },
    { s: 9, kind: 'local', ago: 35, wh: 'wh_3', lines: [[5, 3000, 12.0], [8, 2500, 10.9]], fate: 'received', grnAgo: 33 },
    { s: 6, kind: 'local', ago: 2, wh: 'wh_2', lines: [[2, 1500, 10.25]], fate: 'received', grnAgo: 1 },
    { s: 9, kind: 'local', ago: 20, wh: 'wh_1', lines: [[1, 6000, 9.1]], fate: 'received', grnAgo: 18 },
    { s: 8, kind: 'local', ago: 1, wh: 'wh_1', lines: [[10, 800, 37.5]], fate: 'grn_rejected', grnAgo: 0 },
    { s: 7, kind: 'local', ago: 1, wh: 'wh_2', lines: [[2, 1200, 10.4]], fate: 'grn_received', grnAgo: 0 },
    { s: 9, kind: 'local', ago: 4, wh: 'wh_1', lines: [[3, 2500, 16.9], [7, 1500, 14.1]], fate: 'grn_qc', grnAgo: 0 },
    { s: 6, kind: 'local', ago: 0, wh: 'wh_1', lines: [[2, 2000, 10.2]], fate: 'approved' },
    { s: 8, kind: 'local', ago: 0, wh: 'wh_1', lines: [[10, 1000, 37.5], [14, 300, 33.5]], fate: 'pending' },
    { s: 9, kind: 'local', ago: 12, wh: 'wh_1', lines: [[4, 800, 21.4]], fate: 'rejected' },
    { s: 7, kind: 'local', ago: 0, wh: 'wh_3', lines: [[2, 1600, 10.4]], fate: 'draft' },
    { s: 9, kind: 'local', ago: 7, wh: 'wh_2', lines: [[6, 5000, 7.9]], fate: 'received', grnAgo: 6 },
  ]
  const ports: Record<string, [string, string]> = { Brazil: ['Paranaguá', 'MSC Gülsün'], Turkey: ['Mersin', 'Maersk Kyrenia'], Australia: ['Melbourne', 'ANL Wangaratta'], 'New Zealand': ['Lyttelton', 'CMA CGM Tage'], India: ['Mundra', 'ONE Commitment'] }
  POS.forEach((spec, n) => {
    const sup = db.suppliers[spec.s]
    const date = D(-spec.ago)
    const key = `po${n}`
    const fx = FX[sup.currency]
    ev(date, '10:00', `PO ${n}`, (ctx) => {
      const r = must(L.createPO(db, ctx, {
        supplierId: sup.id, kind: spec.kind, date, expectedDate: spec.grnAgo !== undefined ? D(-spec.grnAgo) : D(spec.kind === 'import' ? 9 : 1), warehouseId: spec.wh,
        currency: sup.currency, fxRate: fx, submit: spec.fate !== 'draft',
        lines: spec.lines.map(([pi, kg, rate]) => ({ productId: pid(pi), qtyKg: kg, cartons: Math.round(kg / db.products[pi].cartonKg), rate })),
        notes: spec.kind === 'import' ? 'CFR Saudi port, 40ft reefer, halal certificate & health certificate required' : undefined,
      }), `PO ${n}`)
      if (r) ids[key] = r.id
    }, 'Purchasing Officer')
    if (['draft', 'pending'].includes(spec.fate)) return
    ev(date, '15:30', `PO ${n} decision`, (ctx) =>
      must(spec.fate === 'rejected' ? L.setPOStatus(db, ctx, ids[key], 'reject', 'Rate above contract price - renegotiate') : L.setPOStatus(db, ctx, ids[key], 'approve'), `approve ${n}`), 'Owner · Abdulrahman Al Saleh')
    if (spec.fate === 'rejected') return
    // import shipment
    if (spec.kind === 'import') {
      const [port, vessel] = ports[sup.country] ?? ['Origin port', 'Vessel']
      const ship = D(-spec.ago + 3)
      const eta = spec.grnAgo !== undefined ? D(-spec.grnAgo - 2) : spec.fate === 'customs' ? D(-2) : D(9)
      const kg = spec.lines.reduce((s, l) => s + l[1], 0)
      const containers = Math.max(1, Math.round(kg / 25000))
      ev(ship, '09:00', `ship ${n}`, (ctx) => {
        const r = must(L.createShipment(db, ctx, {
          poId: ids[key], supplierId: sup.id, originCountry: sup.country, originPort: port, destinationPort: spec.wh === 'wh_1' ? 'Dammam King Abdulaziz Port → Riyadh Dry Port' : spec.wh === 'wh_2' ? 'Jeddah Islamic Port' : 'Dammam King Abdulaziz Port',
          containerNo: `${pickR(['MSCU', 'MRKU', 'CMAU', 'ONEU', 'TGHU'])}${Math.floor(between(1000000, 9999999))}`, vessel, shipDate: ship, eta,
          freightSAR: Math.round(containers * between(14500, 19500)), customsSAR: Math.round(spec.lines.reduce((s, l) => s + l[1] * l[2] * fx, 0) * 0.05), clearanceSAR: Math.round(containers * between(2800, 4200)),
        }), `ship ${n}`)
        if (r) ids[`sh${n}`] = r.id
      }, 'Import Coordinator')
      ev(D(-spec.ago + 5), '08:00', `sail ${n}`, (ctx) => must(L.advanceShipment(db, ctx, ids[`sh${n}`], 'in_transit', D(-spec.ago + 5), `Sailed from ${port}`), `sail ${n}`))
      if (spec.fate !== 'in_transit') {
        const arr = spec.grnAgo !== undefined ? -spec.grnAgo - 2 : -2
        ev(D(arr), '07:00', `arrive ${n}`, (ctx) => must(L.advanceShipment(db, ctx, ids[`sh${n}`], 'arrived_port', D(arr), 'Discharged at port'), `arr ${n}`))
        ev(D(arr), '13:00', `customs ${n}`, (ctx) => must(L.advanceShipment(db, ctx, ids[`sh${n}`], 'customs_clearance', D(arr), 'SFDA inspection & customs declaration filed'), `cus ${n}`))
        if (spec.fate !== 'customs') ev(D(arr + 1), '12:00', `cleared ${n}`, (ctx) => must(L.advanceShipment(db, ctx, ids[`sh${n}`], 'cleared', D(arr + 1), 'Released by ZATCA customs'), `clr ${n}`))
      }
    }
    if (spec.grnAgo === undefined) return
    const gd = D(-spec.grnAgo)
    const grnLines = (subset: [number, number, number][], frac = 1) =>
      subset.map(([pi, kg], li) => {
        const p = db.products[pi]
        const recv = Math.round(kg * frac * between(0.985, 1.005))
        const exp = spec.expiry?.[pi] !== undefined ? D(spec.expiry[pi]) : p.category === 'frozen' ? shiftDay(gd, Math.floor(between(300, 345))) : shiftDay(gd, p.shelfLifeDays)
        return { productId: p.id, receivedKg: recv, cartons: Math.round(recv / p.cartonKg), batchNo: `${p.code.split('-')[1]}${gd.replace(/-/g, '').slice(2)}${String.fromCharCode(65 + li + n % 5)}`, productionDate: p.category === 'frozen' ? shiftDay(gd, -40) : shiftDay(gd, -1), expiryDate: exp }
      })
    const doGrn = (time: string, lines: ReturnType<typeof grnLines>, stage: 'approved' | 'received' | 'qc' | 'rejected', tag: string) => {
      ev(gd, time, `grn ${tag}`, (ctx) => {
        const r = must(L.createGRN(db, ctx, { poId: ids[key], warehouseId: spec.wh, receivedDate: gd, receivedBy: 'Store Keeper · Ramesh Pillai', vehicleTempC: stage === 'rejected' ? 9.4 : spec.kind === 'import' ? -19.5 : 2.8, lines }), `grn ${tag}`)
        if (!r) return
        ids[`grn${tag}`] = r.id
        if (stage === 'received') return
        if (stage === 'rejected') return must(L.rejectGRN(db, ctx, r.id, 'Truck temperature 9.4°C on arrival (limit 4°C) - product refused'), 'rej grn')
        const g = db.grns.find((x) => x.id === r.id)!
        const qc = g.lines.map((l) => {
          const rej = rnd() < 0.25 ? Math.round(l.receivedKg * between(0.002, 0.012)) : 0
          return { productId: l.productId, acceptedKg: l.receivedKg - rej, rejectReason: rej ? pickR(['Torn cartons', 'Thawed / refrozen packs', 'Short weight packs', 'Packaging damage']) : undefined }
        })
        must(L.qcGRN(db, { ...ctx, user: 'QC Inspector · Dr. Hana Yousef' }, r.id, qc, 'Core temperature, packaging, labelling and halal certificate checked'), 'qc')
        if (stage === 'approved') must(L.approveGRN(db, { ...ctx, user: 'Warehouse Manager · Tariq Al Mutairi' }, r.id), 'approve grn')
      })
    }
    if (spec.fate === 'split') {
      doGrn('06:00', grnLines([spec.lines[0]]), 'approved', `${n}a`)
      doGrn('06:40', grnLines([spec.lines[1]]), 'approved', `${n}b`)
    } else if (spec.fate === 'partial') {
      doGrn('06:00', grnLines([spec.lines[0]]), 'approved', `${n}a`)
      doGrn('07:10', grnLines([spec.lines[1]], 0.5), 'approved', `${n}b`)
    } else doGrn(spec.grnAgo === 0 ? '05:20' : '06:30', grnLines(spec.lines), spec.fate === 'grn_rejected' ? 'rejected' : spec.fate === 'grn_received' ? 'received' : spec.fate === 'grn_qc' ? 'qc' : 'approved', `${n}`)
    // supplier payments
    const total = spec.lines.reduce((s, l) => s + l[1] * l[2] * fx, 0)
    if (spec.grnAgo !== undefined && spec.ago > 30) {
      const full = spec.ago > 60 || rnd() < 0.5
      ev(D(-Math.max(1, spec.grnAgo - 10)), '11:00', `pay ${n}`, (ctx) => {
        const po = db.purchaseOrders.find((p) => p.id === ids[key])
        if (!po) return
        must(L.paySupplier(db, ctx, { poId: po.id, amountSAR: round2(full ? po.totalSAR : po.totalSAR * 0.5), method: spec.kind === 'import' ? 'lc' : 'bank', date: D(-Math.max(1, spec.grnAgo! - 10)), reference: `TT${Math.floor(between(100000, 999999))}` }), `pay ${n}`)
      }, 'Accountant · Sara Al Mutlaq')
    } else if (spec.kind === 'local' && spec.grnAgo !== undefined && rnd() < 0.4) {
      ev(D(-spec.grnAgo), '16:00', `pay ${n}`, (ctx) => {
        const po = db.purchaseOrders.find((p) => p.id === ids[key])
        if (po) must(L.paySupplier(db, ctx, { poId: po.id, amountSAR: round2(total * 0.4), method: 'bank', date: D(-spec.grnAgo!), reference: `TT${Math.floor(between(100000, 999999))}` }), `pay ${n}`)
      }, 'Accountant · Sara Al Mutlaq')
    }
  })

  // ───── migrated outstanding invoices (from paper register) + office collections ─────
  const OPENING: [cust: number, ago: number, lines: [number, number][], paidFrac: number][] = [
    [10, 112, [[6, 1800], [9, 400]], 0.45], [3, 98, [[6, 2200], [0, 1200]], 0.6], [1, 84, [[12, 120], [4, 200], [3, 180]], 0.3],
    [16, 72, [[0, 900], [6, 1100]], 0.5], [9, 66, [[2, 600], [0, 500]], 0.2], [19, 50, [[0, 800], [6, 1200], [13, 300]], 0.4],
    [12, 41, [[9, 300], [13, 250], [3, 150]], 0], [17, 35, [[6, 2400], [1, 1200]], 0.35], [4, 22, [[0, 500], [9, 260], [7, 140]], 0.25],
  ]
  OPENING.forEach(([ci, ago, lines, paidFrac], k) => {
    const c = db.customers[ci]
    const date = D(-ago)
    ev(date, '12:00', `opening ${k}`, (ctx) => {
      const sl: SalesLine[] = lines.map(([pi, kg]) => ({ productId: pid(pi), qtyKg: kg, price: customerPrice(c, db.products[pi]) }))
      const t = sl.reduce((s, l) => s + l.qtyKg * l.price, 0)
      const vat = round2(t * 0.15)
      db.counters.inv++
      const inv = {
        id: L.uid(db, 'inv'), invNo: `INV-${date.slice(0, 4)}-${String(db.counters.inv).padStart(5, '0')}`, customerId: c.id, date, dueDate: shiftDay(date, c.paymentTermsDays),
        source: 'opening' as const, lines: sl, subtotal: round2(t), vatRate: 15, vat, total: round2(t + vat), paid: 0, returned: 0, paymentType: 'credit' as const, status: 'unpaid' as const,
        createdAt: ctx.now, notes: 'Migrated from paper sales register (opening balance)',
      }
      db.invoices.push(inv)
      ids[`open${k}`] = inv.id
    }, 'Data Migration')
    if (paidFrac > 0) {
      const pd = D(-Math.max(3, Math.round(ago * 0.4)))
      ev(pd, '11:30', `open pay ${k}`, (ctx) => {
        const inv = db.invoices.find((i) => i.id === ids[`open${k}`])!
        const amt = Math.round((inv.total * paidFrac) / 50) * 50
        const r = must(L.recordPayment(db, ctx, { customerId: c.id, date: pd, method: 'bank', amount: amt, bankRef: `SNB${Math.floor(between(1000000, 9999999))}`, allocations: [{ invoiceId: inv.id, amount: amt }], notes: 'Bank transfer received at head office' }), 'open pay')
        if (r && k !== 7) must(L.verifyPayment(db, { ...ctx, user: 'Accountant · Sara Al Mutlaq' }, r.id, 'verified'), 'verify')
      }, 'Accountant · Sara Al Mutlaq')
    }
  })

  // ───── direct warehouse invoices (bulk pick-ups by wholesalers / supermarkets) ─────
  const DIRECT: [cust: number, ago: number, wh: string, lines: [number, number][], pay: 'cash' | 'credit', paidFrac: number][] = [
    [3, 28, 'wh_1', [[6, 1500], [0, 1000]], 'credit', 1], [10, 24, 'wh_1', [[9, 360], [13, 0], [6, 900]], 'credit', 0.5],
    [17, 19, 'wh_2', [[1, 1200], [8, 600]], 'credit', 0], [19, 15, 'wh_3', [[0, 900], [7, 300], [5, 400]], 'credit', 1],
    [2, 9, 'wh_1', [[1, 800], [5, 300], [3, 200]], 'credit', 0], [3, 5, 'wh_1', [[6, 1200], [9, 180]], 'cash', 1],
  ]
  DIRECT.forEach(([ci, ago, wh, lines, pay, paidFrac], k) => {
    const c = db.customers[ci]
    const date = D(-ago)
    ev(date, '09:30', `direct ${k}`, (ctx) => {
      const r = must(L.directInvoice(db, ctx, { customerId: c.id, warehouseId: wh, date, paymentType: pay, allowOverLimit: true, notes: 'Collected by customer from warehouse', lines: lines.filter(([, kg]) => kg > 0).map(([pi, kg]) => ({ productId: pid(pi), qtyKg: kg, price: customerPrice(c, db.products[pi]) })) }), `direct ${k}`)
      if (r) ids[`dir${k}`] = r.id
    }, 'Sales Desk · Lina Al Harbi')
    if (paidFrac > 0) {
      const pd = pay === 'cash' ? date : D(-Math.max(1, ago - 12))
      ev(pd, pay === 'cash' ? '09:45' : '14:00', `direct pay ${k}`, (ctx) => {
        const inv = db.invoices.find((i) => i.id === ids[`dir${k}`])
        if (!inv) return
        const amt = round2(inv.total * paidFrac)
        const r = must(L.recordPayment(db, ctx, { customerId: c.id, date: pd, method: pay === 'cash' ? 'cash' : 'bank', amount: amt, bankRef: pay === 'cash' ? undefined : `RJH${Math.floor(between(1000000, 9999999))}`, allocations: [{ invoiceId: inv.id, amount: amt }] }), 'direct pay')
        if (r && pay !== 'cash') must(L.verifyPayment(db, ctx, r.id, 'verified'), 'verify')
      }, 'Accountant · Sara Al Mutlaq')
    }
  })

  // ───── distribution & van sales: D-3 … today ─────
  type Stop = { outcome: 'delivered' | 'partial' | 'failed' | 'pending' | 'out'; collect?: 'full' | 'bank' | 'none' | 'part'; oldDues?: number }
  type Day = { ago: number; driver: number; stops: Stop[]; vanSale?: boolean; settle?: 'closed' | 'approved' | 'under_review' | 'submitted'; keep?: number[]; shortage?: number; noReturn?: boolean }
  const PLAN: Day[] = [
    { ago: 3, driver: 1, settle: 'closed', stops: [{ outcome: 'delivered', collect: 'none' }, { outcome: 'delivered', collect: 'none', oldDues: 5000 }, { outcome: 'delivered', collect: 'full' }, { outcome: 'delivered', collect: 'none' }, { outcome: 'delivered', collect: 'bank' }] },
    { ago: 3, driver: 2, settle: 'closed', stops: [{ outcome: 'delivered', collect: 'none' }, { outcome: 'delivered', collect: 'full' }, { outcome: 'failed' }, { outcome: 'delivered', collect: 'part' }] },
    { ago: 2, driver: 1, settle: 'closed', stops: [{ outcome: 'delivered', collect: 'none' }, { outcome: 'delivered', collect: 'none' }, { outcome: 'delivered', collect: 'full' }, { outcome: 'delivered', collect: 'bank' }, { outcome: 'delivered', collect: 'none' }] },
    { ago: 2, driver: 3, settle: 'approved', stops: [{ outcome: 'delivered', collect: 'none', oldDues: 12000 }, { outcome: 'delivered', collect: 'full' }, { outcome: 'delivered', collect: 'none' }, { outcome: 'delivered', collect: 'full' }] },
    { ago: 1, driver: 2, settle: 'approved', vanSale: true, keep: [6], stops: [{ outcome: 'delivered', collect: 'none' }, { outcome: 'delivered', collect: 'full' }, { outcome: 'delivered', collect: 'none' }, { outcome: 'delivered', collect: 'bank' }] },
    { ago: 1, driver: 4, settle: 'under_review', shortage: 150, stops: [{ outcome: 'delivered', collect: 'none', oldDues: 3000 }, { outcome: 'failed' }, { outcome: 'delivered', collect: 'full' }] },
    { ago: 1, driver: 6, settle: 'approved', vanSale: true, stops: [{ outcome: 'partial', collect: 'none' }, { outcome: 'delivered', collect: 'bank' }, { outcome: 'delivered', collect: 'none' }] },
    { ago: 0, driver: 1, stops: [{ outcome: 'delivered', collect: 'none', oldDues: 4000 }, { outcome: 'delivered', collect: 'full' }, { outcome: 'pending' }], noReturn: true },
    { ago: 0, driver: 2, stops: [{ outcome: 'partial', collect: 'part' }, { outcome: 'pending' }], noReturn: true },
    { ago: 0, driver: 3, settle: 'submitted', vanSale: true, stops: [{ outcome: 'delivered', collect: 'full' }, { outcome: 'delivered', collect: 'bank' }] },
    { ago: 0, driver: 5, stops: [{ outcome: 'delivered', collect: 'full' }, { outcome: 'out' }], noReturn: true },
    { ago: 0, driver: 6, stops: [{ outcome: 'failed' }, { outcome: 'pending' }], noReturn: true },
    { ago: 0, driver: 7, stops: [{ outcome: 'pending' }], noReturn: true },
  ]
  const usedToday: Record<string, Set<number>> = {}
  PLAN.forEach((day, k) => {
    const date = D(-day.ago)
    const drv = db.drivers[day.driver - 1]
    const city = db.warehouses.find((w) => w.id === drv.warehouseId)!.city
    const own = db.customers.map((c, i) => [c, i] as const).filter(([c]) => c.driverId === drv.id)
    const sameCity = db.customers.map((c, i) => [c, i] as const).filter(([c]) => c.city === city && c.driverId !== drv.id)
    const used = (usedToday[date] ??= new Set())
    const pool = [...own, ...sameCity].filter(([, i]) => !used.has(i))
    const custs = pool.slice(0, day.stops.length)
    custs.forEach(([, i]) => used.add(i))
    const soKeys: string[] = []
    // orders are booked the afternoon before
    custs.forEach(([c], s) => {
      const sk = `so${k}_${s}`
      soKeys.push(sk)
      const r1 = rnd(), r2 = rnd(), r3 = rnd(), r4 = rnd()
      ev(D(-day.ago - 1), `16:${String(10 + s * 5).padStart(2, '0')}`, sk, (ctx) => {
        // only offer what the driver's warehouse can actually supply on the delivery day
        const prefs = PREFS[c.businessType].filter((pi) => sellableStock(db, pid(pi), drv.warehouseId, date) >= 300 || (db.products[pi].category === 'fresh' && db.products[pi].species === 'chicken' && day.ago === 0))
        if (!prefs.length) prefs.push(...db.products.map((_, i) => i).filter((pi) => sellableStock(db, pid(pi), drv.warehouseId, date) >= 300))
        const n = 1 + Math.floor(r1 * (c.businessType === 'wholesale' ? 2 : 3))
        const chosen = [...new Set([r2, r3, r4].slice(0, n).map((x) => prefs[Math.floor(x * Math.min(prefs.length, 6))]))].filter((x) => x !== undefined)
        const [a, b] = QTY[c.businessType]
        const lines = chosen.map((pi, j) => {
          const p = db.products[pi]
          const kg = Math.max(p.cartonKg, Math.round((a + [r2, r3, r4][j] * (b - a)) / p.cartonKg) * p.cartonKg)
          return { productId: p.id, qtyKg: kg, price: customerPrice(c, p) }
        })
        const r = must(L.createSalesOrder(db, ctx, { customerId: c.id, date: D(-day.ago - 1), deliveryDate: date, paymentType: c.defaultPayment, lines }), sk)
        if (r) ids[sk] = r.id
      }, 'Sales Desk · Lina Al Harbi')
    })
    ev(date, '05:30', `assign ${k}`, (ctx) => must(L.assignOrders(db, ctx, soKeys.map((x) => ids[x]).filter(Boolean), drv.id, date), `assign ${k}`), 'Dispatch Supervisor · Omar Saeed')
    // load the van: ordered quantities (capped to sellable stock) + a buffer for van sales
    ev(date, `06:${String(5 + (day.driver % 6) * 7).padStart(2, '0')}`, `load ${k}`, (ctx) => {
      const need: Record<ID, number> = {}
      for (const sk of soKeys) for (const l of db.salesOrders.find((s) => s.id === ids[sk])?.lines ?? []) need[l.productId] = (need[l.productId] ?? 0) + l.qtyKg
      const lines = Object.entries(need).map(([productId, q]) => {
        const p = db.products.find((x) => x.id === productId)!
        const want = Math.ceil((q * (day.vanSale || day.keep ? 1.25 : 1.06)) / p.cartonKg) * p.cartonKg
        return { productId, qtyKg: Math.min(want, Math.floor(sellableStock(db, productId, drv.warehouseId, date))) }
      })
      must(L.loadVan(db, ctx, { driverId: drv.id, vehicleId: drv.vehicleId!, warehouseId: drv.warehouseId, date, lines }), `load ${k}`)
    }, 'Store Keeper · Ramesh Pillai')
    // stops
    day.stops.forEach((st, s) => {
      const sk = soKeys[s]
      if (!sk) return
      const c = custs[s][0]
      const t = `${String(7 + s + (day.ago === 0 ? 0 : 1)).padStart(2, '0')}:${String(10 + ((s * 17) % 45)).padStart(2, '0')}`
      ev(date, t, `stop ${k}.${s}`, (ctx) => {
        const dl = db.deliveries.find((d) => d.soId === ids[sk])
        if (!dl) return
        if (st.outcome === 'pending') return
        if (st.outcome === 'out') return must(L.setOutForDelivery(db, ctx, dl.id), 'out')
        if (st.outcome === 'failed') return must(L.completeDelivery(db, ctx, { deliveryId: dl.id, lines: [], failed: true, failReason: pickR(['Customer premises closed', 'Receiver not available', 'Customer refused - asked to deliver tomorrow']) }), 'fail')
        const van = vanStockByProduct(db, drv.id)
        const lines = dl.lines.map((l) => ({ productId: l.productId, deliveredKg: Math.min(van[l.productId] ?? 0, st.outcome === 'partial' ? Math.round(l.orderedKg * 0.7) : l.orderedKg) }))
        const r = must(L.completeDelivery(db, ctx, { deliveryId: dl.id, lines, allowOverLimit: true, notes: st.outcome === 'partial' ? 'Customer accepted part quantity - cold-room space full' : undefined }), `deliver ${k}.${s}`)
        if (!r) return
        const inv = db.invoices.find((i) => i.id === r.invoiceId)!
        if (st.collect && st.collect !== 'none') {
          const amt = st.collect === 'part' ? Math.round(inv.total * 0.5) : inv.total
          must(L.recordPayment(db, { ...ctx, user: drv.name }, {
            customerId: c.id, driverId: drv.id, date, method: st.collect === 'bank' ? 'bank' : 'cash', amount: amt,
            bankRef: st.collect === 'bank' ? `STC${Math.floor(between(1000000, 9999999))}` : undefined, allocations: [{ invoiceId: inv.id, amount: amt }],
          }), `collect ${k}.${s}`)
        }
        if (st.oldDues) {
          const due = db.invoices.filter((i) => i.customerId === c.id && i.date < date && invoiceBalance(i) > 0).reduce((s2, i) => s2 + invoiceBalance(i), 0)
          const amt = Math.min(st.oldDues, Math.floor(due))
          if (amt > 0)
            must(L.recordPayment(db, { ...ctx, user: drv.name, now: at(date, t.replace(/:(\d\d)$/, (_, m) => `:${String(Math.min(59, +m + 4)).padStart(2, '0')}`)) }, {
              customerId: c.id, driverId: drv.id, date, method: st.oldDues >= 10000 ? 'bank' : 'cash', amount: amt, scope: 'old',
              bankRef: st.oldDues >= 10000 ? `ANB${Math.floor(between(1000000, 9999999))}` : undefined, notes: 'Old outstanding collected on route',
            }), `old dues ${k}.${s}`)
        }
      }, drv.name)
    })
    // van sale from spare stock
    if (day.vanSale) {
      ev(date, day.ago === 0 ? '09:40' : '13:20', `vansale ${k}`, (ctx) => {
        const van = vanStockByProduct(db, drv.id)
        const spare = Object.entries(van).filter(([, q]) => q >= 20).slice(0, 2)
        if (!spare.length) return
        const buyer = db.customers.find((c) => c.city === city && c.defaultPayment === 'cash' && !used.has(db.customers.indexOf(c))) ?? db.customers.find((c) => c.city === city)!
        const lines = spare.map(([productId, q]) => ({ productId, qtyKg: Math.min(q, Math.round(q * 0.6)), price: customerPrice(buyer, db.products.find((p) => p.id === productId)) }))
        const r = must(L.vanSale(db, ctx, { driverId: drv.id, customerId: buyer.id, date, lines, paymentType: 'cash', allowOverLimit: true }), `vansale ${k}`)
        if (r) {
          const inv = db.invoices.find((i) => i.id === r.id)!
          must(L.recordPayment(db, { ...ctx, now: at(date, day.ago === 0 ? '09:42' : '13:22') }, { customerId: buyer.id, driverId: drv.id, date, method: 'cash', amount: inv.total, allocations: [{ invoiceId: inv.id, amount: inv.total }], notes: 'Van sale - cash' }), 'vansale pay')
        }
      }, drv.name)
    }
    if (day.noReturn) return
    // a customer return for one driver
    if (k === 4) {
      ev(date, '15:30', `return ${k}`, (ctx) => {
        const inv = db.invoices.find((i) => i.driverId === drv.id && i.date === date && i.source === 'delivery')
        if (!inv) return
        const l = inv.lines[0]
        must(L.salesReturn(db, ctx, { invoiceId: inv.id, date, lines: [{ productId: l.productId, qtyKg: Math.min(l.qtyKg, 10) }], reason: 'Packaging torn - customer refused 10 kg', destination: 'van', condition: 'resaleable', driverId: drv.id }), 'return')
      }, drv.name)
    }
    // end of day: return remaining van stock (some frozen stock may stay on the reefer overnight)
    ev(date, day.ago === 0 ? '10:05' : '18:20', `back ${k}`, (ctx) => {
      const van = vanStockByProduct(db, drv.id)
      const keepIds = (day.keep ?? []).map(pid)
      const lines = Object.entries(van).filter(([p, q]) => q > 0 && !keepIds.includes(p)).map(([productId, qtyKg]) => ({ productId, qtyKg }))
      if (lines.length) must(L.returnToWarehouse(db, ctx, { driverId: drv.id, warehouseId: drv.warehouseId, date, lines }), `return wh ${k}`)
    }, 'Store Keeper · Ramesh Pillai')
    if (!day.settle) return
    ev(date, day.ago === 0 ? '10:15' : '18:45', `settle ${k}`, (ctx) => {
      const s = db.payments.filter((p) => p.driverId === drv.id && p.date === date && p.method === 'cash').reduce((t2, p) => t2 + p.amount, 0)
      must(L.submitSettlement(db, { ...ctx, user: drv.name }, { driverId: drv.id, date, cashHandedOver: round2(s - (day.shortage ?? 0)), notes: day.shortage ? 'Short SAR 150 - customer paid less, will collect tomorrow' : 'All stops complete' }), `settle ${k}`)
    }, drv.name)
    const sid = () => db.settlements.find((x) => x.driverId === drv.id && x.date === date)?.id ?? ''
    const steps: ('under_review' | 'verified' | 'approved' | 'closed')[] =
      day.settle === 'closed' ? ['under_review', 'verified', 'approved', 'closed'] : day.settle === 'approved' ? ['under_review', 'verified', 'approved'] : day.settle === 'under_review' ? ['under_review'] : []
    steps.forEach((to, i) =>
      ev(D(-day.ago + 1), `07:${String(30 + i * 6 + day.driver).padStart(2, '0')}`, `stl ${k} ${to}`, (ctx) =>
        must(L.advanceSettlement(db, ctx, sid(), to, { cashVerified: true, stockVerified: true, remarks: to === 'verified' ? 'Cash counted and van stock checked against loading slip' : undefined }), `stl ${to}`), 'Supervisor · Omar Saeed'),
    )
  })

  // open orders for tomorrow, not yet assigned
  ;[[0, 'wh_1'], [6, 'wh_1'], [13, 'wh_1'], [15, 'wh_2']].forEach(([ci], s) => {
    const c = db.customers[ci as number]
    const prefs = PREFS[c.businessType]
    ev(today, `08:${String(5 + s * 7).padStart(2, '0')}`, `tomorrow ${s}`, (ctx) =>
      must(L.createSalesOrder(db, ctx, {
        customerId: c.id, date: today, deliveryDate: D(1), paymentType: c.defaultPayment,
        lines: prefs.slice(s % 2, (s % 2) + 2).map((pi) => ({ productId: pid(pi), qtyKg: Math.round(between(4, 14)) * db.products[pi].cartonKg, price: customerPrice(c, db.products[pi]) })),
      }), 'tomorrow'), 'Sales Desk · Lina Al Harbi')
  })

  // walk-in counter sales (cash / card)
  ;([[-1, '10:20', [[2, 4.5], [10, 3.2]], 'cash'], [-1, '17:45', [[0, 10], [14, 1.5]], 'card'], [0, '09:05', [[2, 6], [3, 2]], 'cash']] as [number, string, [number, number][], 'cash' | 'card'][]).forEach(([ago, time, lines, method], k) => {
    const date = D(ago)
    ev(date, time, `counter ${k}`, (ctx) => {
      const r = must(L.directInvoice(db, ctx, { customerId: 'cus_walkin', warehouseId: 'wh_1', date, paymentType: 'cash', notes: 'Walk-in counter sale', lines: lines.map(([pi, kg]) => ({ productId: pid(pi), qtyKg: kg, price: db.products[pi].sellPrice })) }), 'counter')
      if (!r) return
      const inv = db.invoices.find((i) => i.id === r.id)!
      must(L.recordPayment(db, ctx, { customerId: 'cus_walkin', date, method: method === 'cash' ? 'cash' : 'bank', bankRef: method === 'card' ? `MADA-${inv.invNo}` : undefined, amount: inv.total, allocations: [{ invoiceId: inv.id, amount: inv.total }], allowRepeat: true, notes: method === 'card' ? 'Card (Mada) at counter' : 'Cash at counter' }), 'counter pay')
    }, 'Nouf Al Harbi')
  })

  // a damaged stock write-off and a transfer for the inventory history
  ev(D(-6), '14:00', 'damage', (ctx) => {
    const b = db.batches.find((x) => x.productId === pid(5) && x.warehouseId === 'wh_1')
    if (b) must(L.adjustStock(db, ctx, { batchId: b.id, qtyKg: 40, type: 'damage', reason: 'Forklift damage - 4 cartons crushed', date: D(-6) }), 'damage')
  })
  ev(D(-10), '10:00', 'transfer', (ctx) => must(L.transferStock(db, ctx, { fromWh: 'wh_1', toWh: 'wh_3', productId: pid(9), qtyKg: 900, date: D(-10), note: 'Rebalance mutton stock for Eastern Province' }), 'transfer'))

  // replay
  events.sort((a, b) => a.at.localeCompare(b.at) || a.seq - b.seq)
  const base: L.Ctx = { user: 'System', today, now: new Date().toISOString() }
  for (const e of events) e.run(base)

  // welcome notifications
  db.notifications = db.notifications.filter((n) => n.audience === 'driver' || n.at.slice(0, 10) >= D(-1).slice(0, 10)).slice(0, 40)
  for (const n of db.notifications) n.read = n.at < at(D(-1), '12:00')
  return db
}
