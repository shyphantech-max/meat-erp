/**
 * Which module a command belongs to - the backend uses this to enforce RBAC on every write
 * (a role may only run commands of modules it can open). Drivers get the DRIVER_COMMANDS set,
 * always scoped to their own driverId by the server.
 */
import type { ModuleKey } from './rbac'

export const COMMAND_MODULE: Record<string, ModuleKey> = {
  upsertMaster: 'inventory', // refined by collection below
  assignVehicle: 'fleet',
  createPO: 'purchases', setPOStatus: 'purchases', paySupplier: 'purchases',
  createShipment: 'imports', advanceShipment: 'imports',
  createGRN: 'grn', qcGRN: 'grn', approveGRN: 'grn', rejectGRN: 'grn',
  transferStock: 'inventory', adjustStock: 'inventory',
  loadVan: 'distribution', returnToWarehouse: 'distribution', recordVanLoss: 'distribution',
  createSalesOrder: 'sales', assignOrders: 'distribution', cancelSalesOrder: 'sales', reorderRoute: 'distribution', setOutForDelivery: 'distribution',
  completeDelivery: 'distribution', vanSale: 'distribution', directInvoice: 'sales', voidInvoice: 'sales', salesReturn: 'sales',
  recordPayment: 'collections', verifyPayment: 'collections',
  submitSettlement: 'settlement', advanceSettlement: 'settlement',
  saveUser: 'access', setUserActive: 'access', setRoleModule: 'access', saveRole: 'access', deleteRole: 'access',
  updateSettings: 'settings',
}
/** upsertMaster(db, ctx, collection, …) - module depends on the collection */
export const MASTER_MODULE: Record<string, ModuleKey> = { products: 'inventory', suppliers: 'purchases', customers: 'customers', drivers: 'fleet', vehicles: 'fleet', warehouses: 'settings' }
/** the counter (POS) posts a direct invoice + payment */
export const POS_COMMANDS = new Set(['directInvoice', 'recordPayment'])
/** what a signed-in driver may run (server checks driverId === the driver's own id) */
export const DRIVER_COMMANDS = new Set(['setOutForDelivery', 'completeDelivery', 'vanSale', 'salesReturn', 'recordPayment', 'returnToWarehouse', 'recordVanLoss', 'submitSettlement'])

export function moduleOfCommand(name: string, args: unknown[]): ModuleKey | undefined {
  if (name === 'upsertMaster') return MASTER_MODULE[String(args[0])]
  return COMMAND_MODULE[name]
}
