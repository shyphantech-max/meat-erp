import { NavLink } from 'react-router-dom'
import { BRAND } from '@/lib/brand'
import { ChevronsLeft, ChevronsRight } from 'lucide-react'
import { BrandLogo } from '@/components/common'
import { NAV, type NavItem } from '@/data/nav'
import type { ModuleKey } from '@/lib/rbac'
import { useSession } from '@/store/session'
import { useT } from '@/i18n'
import { useUI } from '@/store/useUI'
import { useStore } from '@/store/useStore'
import { cn } from '@/lib/utils'
import { todayKey } from '@/lib/format'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

export function Logo({ collapsed, light = true }: { collapsed?: boolean; light?: boolean }) {
  const t = useT()
  return (
    <div className="flex items-center gap-2.5">
      <BrandLogo size={collapsed ? 34 : 36} tile={light} />
      {!collapsed && (
        <div className="min-w-0 leading-tight">
          <div className={cn('text-[15px] font-bold tracking-tight', light ? 'text-white' : 'text-brand-ink')}>
            {BRAND.name} <span className={light ? 'text-fresh' : 'text-brand'}>{BRAND.suffix}</span>
          </div>
          <div className={cn('truncate text-[10.5px]', light ? 'text-sidebar-muted' : 'text-muted-foreground')}>{t(BRAND.tagline)}</div>
        </div>
      )}
    </div>
  )
}

/** navigation filtered to the modules the signed-in role may open */
export function useRoleNav() {
  const allowed = useSession().modules
  return NAV.map((g) => ({ ...g, items: g.items.filter((i) => allowed.includes(i.key as ModuleKey)) })).filter((g) => g.items.length)
}

/** live counters shown as sidebar badges */
export function useNavBadges() {
  const db = useStore((s) => s.db)
  const today = todayKey()
  return {
    po: db.purchaseOrders.filter((p) => p.status === 'pending_approval').length,
    grn: db.grns.filter((g) => g.status === 'received' || g.status === 'qc_passed').length,
    deliveries: db.deliveries.filter((d) => d.date === today && (d.status === 'pending' || d.status === 'out_for_delivery')).length,
    settlements: db.settlements.filter((s) => ['submitted', 'under_review', 'verified'].includes(s.status)).length,
    payments: db.payments.filter((p) => p.verification === 'pending').length,
  }
}

export function SidebarNav({ collapsed, onNavigate }: { collapsed?: boolean; onNavigate?: () => void }) {
  const t = useT()
  const badges = useNavBadges()
  const nav = useRoleNav()
  const item = (it: NavItem) => {
    const count = it.badge ? badges[it.badge] : 0
    const link = (
      <NavLink
        key={it.key}
        to={it.path}
        end={it.path === '/'}
        onClick={onNavigate}
        className={({ isActive }) =>
          cn(
            'group relative flex h-9 items-center gap-3 rounded-lg px-2.5 text-[13px] font-medium transition-colors',
            isActive ? 'bg-brand text-white shadow-sm' : 'text-sidebar-muted hover:bg-sidebar-accent hover:text-white',
            collapsed && 'justify-center px-0',
          )
        }
      >
        <it.icon className="size-[18px] shrink-0" />
        {!collapsed && <span className="truncate">{t(it.label)}</span>}
        {count > 0 && (
          <span className={cn('rounded-full bg-red px-1.5 text-[10px] leading-4 font-bold text-white tabular', collapsed ? 'absolute -top-0.5 end-0.5' : 'ms-auto')}>{count}</span>
        )}
      </NavLink>
    )
    return collapsed ? (
      <Tooltip key={it.key}>
        <TooltipTrigger asChild>{link}</TooltipTrigger>
        <TooltipContent side="right">{t(it.label)}</TooltipContent>
      </Tooltip>
    ) : (
      link
    )
  }
  return (
    <nav className="flex-1 space-y-4 overflow-y-auto px-3 py-3 scrollbar-thin">
      {nav.map((g) => (
        <div key={g.label}>
          {!collapsed && <div className="mb-1.5 px-2.5 text-[10.5px] font-semibold tracking-wider text-sidebar-muted/70 uppercase">{t(g.label)}</div>}
          <div className="space-y-0.5">{g.items.map(item)}</div>
        </div>
      ))}
    </nav>
  )
}

export function Sidebar() {
  const t = useT()
  const collapsed = useUI((s) => s.sidebarCollapsed)
  const toggle = useUI((s) => s.toggleSidebar)
  return (
    <aside className={cn('sticky top-0 hidden h-dvh shrink-0 flex-col bg-sidebar text-sidebar-foreground transition-[width] duration-200 lg:flex', collapsed ? 'w-[68px]' : 'w-[248px]')}>
      <div className={cn('flex h-[68px] items-center border-b border-sidebar-border px-4', collapsed && 'justify-center px-0')}>
        <Logo collapsed={collapsed} />
      </div>
      <SidebarNav collapsed={collapsed} />
      <button
        onClick={toggle}
        className="flex h-11 items-center gap-2 border-t border-sidebar-border px-4 text-[12px] text-sidebar-muted hover:text-white"
        aria-label={collapsed ? t('Expand sidebar') : t('Collapse sidebar')}
      >
        {collapsed ? <ChevronsRight className="flip-rtl mx-auto size-4" /> : <><ChevronsLeft className="flip-rtl size-4" /> {t('Collapse sidebar')}</>}
      </button>
    </aside>
  )
}
