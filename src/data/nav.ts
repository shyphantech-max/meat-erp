import {
  BarChart3, Boxes, ClipboardCheck, FileText, HandCoins, LayoutDashboard, Scale, Settings, Ship, ShoppingCart, Store, Truck, Users, Wallet, type LucideIcon,
} from 'lucide-react'

export interface NavItem {
  key: string
  label: string
  path: string
  icon: LucideIcon
  badge?: 'grn' | 'po' | 'deliveries' | 'settlements' | 'payments'
}
export interface NavGroup {
  label: string
  items: NavItem[]
}

export const NAV: NavGroup[] = [
  { label: 'Overview', items: [{ key: 'dashboard', label: 'Dashboard', path: '/', icon: LayoutDashboard }] },
  {
    label: 'Procurement',
    items: [
      { key: 'purchases', label: 'Suppliers & Purchases', path: '/purchases', icon: ShoppingCart, badge: 'po' },
      { key: 'imports', label: 'Imports & Shipments', path: '/imports', icon: Ship },
      { key: 'grn', label: 'GRN', path: '/grn', icon: ClipboardCheck, badge: 'grn' },
      { key: 'inventory', label: 'Inventory', path: '/inventory', icon: Boxes },
    ],
  },
  {
    label: 'Sales',
    items: [
      { key: 'customers', label: 'Customers', path: '/customers', icon: Store },
      { key: 'sales', label: 'Sales & Invoices', path: '/sales', icon: FileText },
    ],
  },
  {
    label: 'Operations',
    items: [
      { key: 'fleet', label: 'Drivers & Vehicles', path: '/fleet', icon: Users },
      { key: 'distribution', label: 'Distribution & Deliveries', path: '/distribution', icon: Truck, badge: 'deliveries' },
    ],
  },
  {
    label: 'Finance',
    items: [
      { key: 'collections', label: 'Payment Collections', path: '/collections', icon: HandCoins, badge: 'payments' },
      { key: 'settlement', label: 'Daily Driver Settlement', path: '/settlement', icon: Scale, badge: 'settlements' },
      { key: 'accounts', label: 'Accounts & Outstanding', path: '/accounts', icon: Wallet },
      { key: 'reports', label: 'Reports', path: '/reports', icon: BarChart3 },
    ],
  },
  { label: 'System', items: [{ key: 'settings', label: 'Settings', path: '/settings', icon: Settings }] },
]
