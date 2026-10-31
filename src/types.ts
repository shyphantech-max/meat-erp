/**
 * Zad ERP domain model.
 * All money is SAR unless a field says otherwise; all quantities are KG.
 * Dates are local calendar days ('YYYY-MM-DD'); `createdAt` fields are ISO timestamps.
 */
export type ID = string
export type DayKey = string // 'YYYY-MM-DD'

export type Species = 'chicken' | 'mutton'
export type StorageCategory = 'fresh' | 'chilled' | 'frozen'
export type Currency = 'SAR' | 'USD' | 'AUD' | 'NZD'

export interface Product {
  id: ID
  code: string
  name: string
  nameAr: string
  species: Species
  category: StorageCategory
  cartonKg: number // KG per carton / crate / carcass piece
  packLabel: string // "Carton", "Crate", "Carcass"
  costPrice: number // standard cost SAR/kg (updated from GRNs)
  sellPrice: number // list price SAR/kg
  reorderLevelKg: number
  shelfLifeDays: number
  origin: string
  active: boolean
}

export interface Warehouse {
  id: ID
  code: string
  name: string
  nameAr: string
  city: string
  address: string
  capacityKg: number
  manager: string
}

export type SupplierType = 'local' | 'international'
export interface Supplier {
  id: ID
  code: string
  name: string
  type: SupplierType
  country: string
  city: string
  contactPerson: string
  phone: string
  email: string
  currency: Currency
  paymentTermsDays: number
  products: Species[]
  rating: number
  active: boolean
}

export interface POLine {
  productId: ID
  qtyKg: number
  cartons: number
  rate: number // per kg in PO currency
  receivedKg: number
}
export type POStatus = 'draft' | 'pending_approval' | 'approved' | 'partially_received' | 'received' | 'rejected' | 'cancelled'
export type PayStatus = 'unpaid' | 'partial' | 'paid'
export interface PurchaseOrder {
  id: ID
  poNo: string
  supplierId: ID
  kind: 'local' | 'import'
  date: DayKey
  expectedDate: DayKey
  warehouseId: ID
  currency: Currency
  fxRate: number // to SAR
  lines: POLine[]
  totalFx: number
  totalSAR: number
  paidSAR: number
  paymentStatus: PayStatus
  status: POStatus
  notes?: string
  approvedBy?: string
  approvedAt?: string
  rejectReason?: string
  createdAt: string
}

export interface SupplierPayment {
  id: ID
  refNo: string
  supplierId: ID
  poId: ID
  date: DayKey
  amountSAR: number
  method: 'bank' | 'cash' | 'lc'
  reference?: string
}

export type ShipmentStatus = 'booked' | 'in_transit' | 'arrived_port' | 'customs_clearance' | 'cleared' | 'delivered'
export const SHIPMENT_FLOW: ShipmentStatus[] = ['booked', 'in_transit', 'arrived_port', 'customs_clearance', 'cleared', 'delivered']
export interface ShipmentEvent {
  status: ShipmentStatus
  at: DayKey
  note?: string
}
export interface Shipment {
  id: ID
  ref: string
  poId: ID
  supplierId: ID
  originCountry: string
  originPort: string
  destinationPort: string
  containerNo: string
  vessel: string
  shipDate: DayKey
  eta: DayKey
  lines: { productId: ID; qtyKg: number; cartons: number }[]
  goodsValueSAR: number
  freightSAR: number
  customsSAR: number
  clearanceSAR: number
  status: ShipmentStatus
  events: ShipmentEvent[]
}

export type GRNStatus = 'received' | 'qc_passed' | 'approved' | 'rejected'
export interface GRNLine {
  productId: ID
  receivedKg: number
  acceptedKg: number
  rejectedKg: number
  cartons: number
  batchNo: string
  productionDate?: DayKey
  expiryDate: DayKey
  unitCostSAR: number
  rejectReason?: string
}
export interface GRN {
  id: ID
  grnNo: string
  poId: ID
  shipmentId?: ID
  supplierId: ID
  warehouseId: ID
  receivedDate: DayKey
  receivedBy: string
  vehicleTempC?: number
  lines: GRNLine[]
  status: GRNStatus
  qcBy?: string
  qcNotes?: string
  approvedBy?: string
  approvedAt?: string
  rejectReason?: string
  createdAt: string
}

export interface Batch {
  id: ID
  batchNo: string
  productId: ID
  warehouseId: ID
  qtyKg: number // current
  initialKg: number
  unitCost: number
  receivedDate: DayKey
  expiryDate: DayKey
  grnId?: ID
}

export type StockMoveType = 'grn_in' | 'van_load' | 'van_return' | 'transfer_out' | 'transfer_in' | 'damage' | 'expired' | 'direct_sale' | 'customer_return' | 'adjust_plus'
export interface StockMovement {
  id: ID
  date: DayKey
  createdAt: string
  type: StockMoveType
  productId: ID
  warehouseId: ID
  batchId: ID
  qtyKg: number // signed (+ in, - out)
  ref: string
  note?: string
}

export type BusinessType = 'restaurant' | 'hotel' | 'supermarket' | 'wholesale' | 'catering' | 'walk_in'
export interface Customer {
  id: ID
  code: string
  name: string
  nameAr: string
  businessType: BusinessType
  contactPerson: string
  phone: string
  email: string
  city: string
  district: string
  address: string
  vatNo: string
  driverId?: ID
  creditLimit: number
  paymentTermsDays: number
  defaultPayment: 'cash' | 'credit'
  prices: Record<ID, number> // customer-specific SAR/kg
  active: boolean
}

export type DriverStatus = 'on_duty' | 'off_duty' | 'on_leave'
export interface Driver {
  id: ID
  code: string
  name: string
  nameAr: string
  mobile: string
  iqamaNo: string
  licenseExpiry: DayKey
  vehicleId?: ID
  warehouseId: ID
  status: DriverStatus
  pin: string
}

export type VehicleStatus = 'active' | 'maintenance' | 'inactive'
export interface Vehicle {
  id: ID
  plateNo: string
  plateAr: string
  type: string
  make: string
  capacityKg: number
  driverId?: ID
  status: VehicleStatus
  reefer: boolean
  lastServiceDate: DayKey
  insuranceExpiry: DayKey
}

export interface SalesLine {
  productId: ID
  qtyKg: number
  price: number // SAR/kg excl. VAT
}

export type SOStatus = 'open' | 'assigned' | 'partially_delivered' | 'delivered' | 'cancelled'
export interface SalesOrder {
  id: ID
  soNo: string
  customerId: ID
  date: DayKey
  deliveryDate: DayKey
  lines: SalesLine[]
  paymentType: 'cash' | 'credit'
  status: SOStatus
  driverId?: ID
  notes?: string
  createdAt: string
}

export type DeliveryStatus = 'pending' | 'out_for_delivery' | 'delivered' | 'partial' | 'failed'
export interface DeliveryLine {
  productId: ID
  orderedKg: number
  deliveredKg: number
  price: number
}
export interface Delivery {
  id: ID
  deliveryNo: string
  soId: ID
  customerId: ID
  driverId: ID
  vehicleId: ID
  date: DayKey
  routeSeq: number
  lines: DeliveryLine[]
  status: DeliveryStatus
  invoiceId?: ID
  failReason?: string
  completedAt?: string
  notes?: string
}

export type InvoiceSource = 'direct' | 'delivery' | 'van_sale' | 'opening'
export type InvoiceStatus = 'unpaid' | 'partial' | 'paid' | 'void'
export interface Invoice {
  id: ID
  invNo: string
  customerId: ID
  date: DayKey
  dueDate: DayKey
  source: InvoiceSource
  soId?: ID
  deliveryId?: ID
  driverId?: ID
  warehouseId?: ID
  lines: SalesLine[]
  subtotal: number
  vatRate: number
  vat: number
  total: number
  paid: number
  returned: number // credit notes against this invoice (incl. VAT)
  paymentType: 'cash' | 'credit'
  status: InvoiceStatus
  createdAt: string
  notes?: string
}

export interface SalesReturn {
  id: ID
  returnNo: string
  invoiceId: ID
  customerId: ID
  date: DayKey
  lines: SalesLine[]
  amount: number // incl. VAT
  reason: string
  destination: 'van' | 'warehouse'
  driverId?: ID
  vehicleId?: ID
  warehouseId?: ID
  condition: 'resaleable' | 'damaged'
  createdAt: string
}

export type PaymentMethod = 'cash' | 'bank'
export type VerifyStatus = 'pending' | 'verified' | 'rejected'
export interface PaymentAllocation {
  invoiceId: ID
  amount: number
}
export interface Payment {
  id: ID
  receiptNo: string
  customerId: ID
  driverId?: ID
  date: DayKey
  createdAt: string
  method: PaymentMethod
  bankRef?: string
  amount: number
  allocations: PaymentAllocation[]
  collectionType: 'current' | 'old_dues' | 'mixed'
  notes?: string
  verification: VerifyStatus
  verifiedBy?: string
  settlementId?: ID
  idempotencyKey?: string
}

export type VanMoveType = 'load' | 'delivery' | 'van_sale' | 'customer_return' | 'return_wh' | 'loss'
export interface VanMovement {
  id: ID
  date: DayKey
  createdAt: string
  driverId: ID
  vehicleId: ID
  productId: ID
  qtyKg: number // signed (+ into van, - out of van)
  type: VanMoveType
  ref: string
  note?: string
}

export interface VanLoad {
  id: ID
  slipNo: string
  driverId: ID
  vehicleId: ID
  warehouseId: ID
  date: DayKey
  createdAt: string
  lines: { productId: ID; qtyKg: number; batches: { batchId: ID; batchNo: string; qtyKg: number }[] }[]
  loadedBy: string
}

export type SettlementStatus = 'submitted' | 'under_review' | 'verified' | 'approved' | 'closed' | 'rejected'
export const SETTLEMENT_FLOW: SettlementStatus[] = ['submitted', 'under_review', 'verified', 'approved', 'closed']
export interface SettlementProductRow {
  productId: ID
  opening: number
  loaded: number
  delivered: number
  customerReturns: number
  returnedToWH: number
  loss: number
  closing: number
  physical: number
}
export interface Settlement {
  id: ID
  settlementNo: string
  driverId: ID
  vehicleId: ID
  date: DayKey
  rows: SettlementProductRow[]
  openingKg: number
  loadedKg: number
  deliveredKg: number
  customerReturnsKg: number
  returnedKg: number
  lossKg: number
  closingKg: number
  physicalKg: number
  stockDiscrepancyKg: number
  totalSales: number
  cashSales: number
  creditSales: number
  cashCollected: number
  bankTransfers: number
  currentCollected: number
  oldDuesCollected: number
  expectedCash: number
  cashHandedOver: number
  cashVariance: number // + excess / - shortage
  deliveriesDone: number
  deliveriesTotal: number
  driverNotes?: string
  supervisorRemarks?: string
  cashVerified?: boolean
  stockVerified?: boolean
  status: SettlementStatus
  history: { status: SettlementStatus; at: string; by: string; note?: string }[]
  submittedAt: string
}

export interface StockLoss {
  id: ID
  ref: string
  date: DayKey
  driverId: ID
  vehicleId: ID
  productId: ID
  qtyKg: number
  reason: string
}

export interface AppNotification {
  id: ID
  at: string
  title: string
  body: string
  link?: string
  kind: 'info' | 'success' | 'warning' | 'danger'
  audience: 'admin' | 'driver'
  driverId?: ID
  read: boolean
}

export interface ActivityLog {
  id: ID
  at: string
  user: string
  action: string
  ref: string
}

export interface Settings {
  companyName: string
  companyNameAr: string
  crNo: string
  vatNo: string
  address: string
  phone: string
  email: string
  vatRate: number // %
  invoicePrefix: string
  nearExpiryFrozenDays: number
  nearExpiryChilledDays: number
  nearExpiryFreshDays: number
  cashVarianceToleranceSAR: number
  goLiveDate: DayKey
  seededAt: DayKey
}

export interface ArchiveMonth {
  month: string // 'YYYY-MM'
  sales: number
  collections: number
  chickenSales: number
  muttonSales: number
}

/** access control: roles define which modules a user may open; drivers only get the driver app */
export interface AccessRole {
  key: string
  label: string
  description: string
  kind: 'staff' | 'driver'
  modules: string[] // ModuleKey[] (see src/lib/rbac.ts)
  system: boolean // built-in roles cannot be deleted
}
export interface AppUser {
  id: ID
  name: string
  email: string
  password: string
  roleKey: string
  driverId?: ID
  active: boolean
  lastLoginAt?: string
}

export interface DB {
  version: number
  settings: Settings
  products: Product[]
  warehouses: Warehouse[]
  suppliers: Supplier[]
  purchaseOrders: PurchaseOrder[]
  supplierPayments: SupplierPayment[]
  shipments: Shipment[]
  grns: GRN[]
  batches: Batch[]
  stockMovements: StockMovement[]
  customers: Customer[]
  drivers: Driver[]
  vehicles: Vehicle[]
  salesOrders: SalesOrder[]
  deliveries: Delivery[]
  invoices: Invoice[]
  salesReturns: SalesReturn[]
  payments: Payment[]
  vanLoads: VanLoad[]
  vanMovements: VanMovement[]
  stockLosses: StockLoss[]
  settlements: Settlement[]
  notifications: AppNotification[]
  activity: ActivityLog[]
  archive: ArchiveMonth[]
  roles: AccessRole[]
  users: AppUser[]
  counters: Record<string, number>
}

export type Result<T = { id?: ID }> = ({ ok: true } & T) | { ok: false; error: string; code?: string }
