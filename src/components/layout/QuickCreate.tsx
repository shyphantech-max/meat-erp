/**
 * Quick create: the centre "+" of the mobile tab bar and the "New" button in the desktop header.
 * Only actions for modules the signed-in role can open are offered. Dialogs are lazy-loaded.
 */
import { lazy, Suspense, useState, type ComponentType } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRightLeft, Boxes, ClipboardCheck, FilePlus2, FileText, HandCoins, PackageMinus, Plus, ShoppingCart, Store, Truck, UserPlus, type LucideIcon } from 'lucide-react'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { useT } from '@/i18n'
import { useSession } from '@/store/session'
import type { ModuleKey } from '@/lib/rbac'
import { cn } from '@/lib/utils'

type DialogProps = { open: boolean; onOpenChange: (o: boolean) => void }
const named = <K extends string>(p: Promise<Record<K, ComponentType<any>>>, k: K) => p.then((m) => ({ default: m[k] as ComponentType<DialogProps> }))
const SalesOrderDialog = lazy(() => named(import('@/modules/sales/dialogs'), 'SalesOrderDialog'))
const DirectInvoiceDialog = lazy(() => named(import('@/modules/sales/dialogs'), 'DirectInvoiceDialog'))
const RecordPaymentDialog = lazy(() => named(import('@/modules/collections/RecordPaymentDialog'), 'RecordPaymentDialog'))
const CustomerDialog = lazy(() => named(import('@/modules/customers/CustomerDialog'), 'CustomerDialog'))
const PODialog = lazy(() => named(import('@/modules/purchases/dialogs'), 'PODialog'))
const TransferDialog = lazy(() => named(import('@/modules/inventory/dialogs'), 'TransferDialog'))
const AdjustDialog = lazy(() => named(import('@/modules/inventory/dialogs'), 'AdjustDialog'))

interface Action {
  key: string
  label: string
  hint: string
  icon: LucideIcon
  module: ModuleKey
  dialog?: ComponentType<DialogProps>
  to?: string
  tone: string
}
const ACTIONS: Action[] = [
  { key: 'so', label: 'Sales order', hint: 'Book an order for delivery', icon: FilePlus2, module: 'sales', dialog: SalesOrderDialog, tone: 'bg-brand-soft text-brand' },
  { key: 'inv', label: 'Direct invoice', hint: 'Warehouse counter sale', icon: FileText, module: 'sales', dialog: DirectInvoiceDialog, tone: 'bg-brand-soft text-brand' },
  { key: 'pay', label: 'Record payment', hint: 'Cash or bank collection', icon: HandCoins, module: 'collections', dialog: RecordPaymentDialog, tone: 'bg-success-soft text-success' },
  { key: 'load', label: 'Load van', hint: 'Issue stock to a driver', icon: Truck, module: 'distribution', to: '/distribution?tab=loading', tone: 'bg-maroon-soft text-maroon' },
  { key: 'grn', label: 'Receive goods', hint: 'Create a GRN', icon: ClipboardCheck, module: 'grn', to: '/grn', tone: 'bg-info-soft text-info' },
  { key: 'po', label: 'Purchase order', hint: 'Order from a supplier', icon: ShoppingCart, module: 'purchases', dialog: PODialog, tone: 'bg-info-soft text-info' },
  { key: 'cus', label: 'New customer', hint: 'Add a B2B customer', icon: Store, module: 'customers', dialog: CustomerDialog, tone: 'bg-warning-soft text-warning' },
  { key: 'trf', label: 'Stock transfer', hint: 'Move stock between warehouses', icon: ArrowRightLeft, module: 'inventory', dialog: TransferDialog, tone: 'bg-muted text-foreground' },
  { key: 'adj', label: 'Write-off', hint: 'Damaged or expired stock', icon: PackageMinus, module: 'inventory', dialog: AdjustDialog, tone: 'bg-danger-soft text-danger' },
  { key: 'stock', label: 'Stock check', hint: 'Live stock by product', icon: Boxes, module: 'inventory', to: '/inventory', tone: 'bg-muted text-foreground' },
  { key: 'user', label: 'Add user', hint: 'Give someone access', icon: UserPlus, module: 'access', to: '/access', tone: 'bg-muted text-foreground' },
]

function useActions() {
  const session = useSession()
  return ACTIONS.filter((a) => session.can(a.module))
}

/** renders the chosen dialog; shared by the mobile sheet and the desktop menu */
function useRunner() {
  const nav = useNavigate()
  const [active, setActive] = useState<Action | null>(null)
  const run = (a: Action) => (a.dialog ? setActive(a) : a.to && nav(a.to))
  const D = active?.dialog
  const node = D ? (
    <Suspense fallback={null}>
      <D open onOpenChange={(o) => !o && setActive(null)} />
    </Suspense>
  ) : null
  return { run, node }
}

export function QuickCreateButton() {
  const t = useT()
  const actions = useActions()
  const { run, node } = useRunner()
  if (!actions.length) return null
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" className="h-9"><Plus /> {t('New')}</Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuLabel>{t('Create')}</DropdownMenuLabel>
          {actions.map((a) => (
            <DropdownMenuItem key={a.key} onClick={() => run(a)} className="gap-2.5 py-2">
              <span className={cn('flex size-7 items-center justify-center rounded-lg', a.tone)}><a.icon className="size-4" /></span>
              <span className="min-w-0">
                <span className="block text-[13px] font-medium">{t(a.label)}</span>
                <span className="block text-[11px] text-muted-foreground">{t(a.hint)}</span>
              </span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      {node}
    </>
  )
}

/** the raised centre "+" of the mobile tab bar */
export function QuickCreateFab() {
  const t = useT()
  const actions = useActions()
  const { run, node } = useRunner()
  const [open, setOpen] = useState(false)
  return (
    <>
      <div className="relative flex items-start justify-center">
        <button
          onClick={() => setOpen(true)}
          aria-label={t('Create')}
          className="absolute -top-8 flex size-[68px] items-center justify-center rounded-full bg-brand text-white shadow-[0_8px_20px_-6px_rgba(4,122,63,0.65)] ring-[6px] ring-background transition-transform active:scale-95"
        >
          <Plus className="size-8" strokeWidth={2.5} />
        </button>
        <span className="absolute bottom-2 text-[10.5px] font-medium text-brand">{t('Create')}</span>
      </div>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="px-4 pt-3">
          <SheetTitle className="sr-only">{t('Create')}</SheetTitle>
          <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-muted" />
          <div className="mb-3 px-1 text-[15px] font-semibold">{t('Create new')}</div>
          <div className="grid max-h-[65dvh] grid-cols-3 gap-2 overflow-y-auto pb-4">
            {actions.map((a) => (
              <button key={a.key} onClick={() => { setOpen(false); run(a) }} className="flex flex-col items-center gap-1.5 rounded-xl border bg-card p-3 text-center active:bg-muted">
                <span className={cn('flex size-11 items-center justify-center rounded-2xl', a.tone)}><a.icon className="size-5" /></span>
                <span className="text-[12px] leading-tight font-semibold">{t(a.label)}</span>
              </button>
            ))}
          </div>
        </SheetContent>
      </Sheet>
      {node}
    </>
  )
}
