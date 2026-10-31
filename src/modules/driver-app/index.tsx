/**
 * Driver app (/driver/*), signed in through the shared login page with the driver's PIN.
 * Responsive: on desktop it uses the platform layout (sidebar + header, driver menu only);
 * on phones it is a full-screen mobile app with a top bar and bottom tabs.
 */
import { useEffect, type ReactNode } from 'react'
import { NavLink, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { CalendarDays, HandCoins, Home as HomeIcon, LogOut, Package, Route as RouteIcon, Scale, Truck } from 'lucide-react'
import { toast } from 'sonner'
import { BrandLogo, ErrorBoundary } from '@/components/common'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { LanguageToggle, NotificationsBell } from '@/components/layout/Header'
import { Logo } from '@/components/layout/Sidebar'
import { useUI } from '@/store/useUI'
import { useStore } from '@/store/useStore'
import { useT, useName } from '@/i18n'
import { cn } from '@/lib/utils'
import { fmtDate, initials, todayKey } from '@/lib/format'
import { isSignedIn, signOut, useDriverDay } from './useDriverDay'

import Home from './screens/Home'
import RouteList from './screens/RouteList'
import StopScreen from './screens/StopScreen'
import Collect from './screens/Collect'
import Stock from './screens/Stock'
import Settle from './screens/Settle'
import VanSale from './screens/VanSale'

function useDriverTabs() {
  const { pending, unpaidToday } = useDriverDay()
  return [
    { to: '/driver', label: 'Home', icon: HomeIcon, end: true, badge: 0 },
    { to: '/driver/route', label: 'Route', icon: RouteIcon, badge: pending.length },
    { to: '/driver/collect', label: 'Collect', icon: HandCoins, badge: unpaidToday.length },
    { to: '/driver/stock', label: 'Stock', icon: Package, badge: 0 },
    { to: '/driver/settle', label: 'Settle', icon: Scale, badge: 0 },
  ]
}
const TITLES: [RegExp, string][] = [
  [/^\/driver\/?$/, 'Home'], [/^\/driver\/route/, 'My route'], [/^\/driver\/stop/, 'Delivery stop'], [/^\/driver\/collect/, 'Collect payment'],
  [/^\/driver\/sale/, 'Van sale'], [/^\/driver\/stock/, 'Van stock'], [/^\/driver\/settle/, 'Daily settlement'],
]

function useSignOutDriver() {
  const nav = useNavigate()
  const t = useT()
  const { driverId } = useDriverDay()
  return () => {
    signOut(driverId)
    toast.success(t('Signed out'))
    nav('/login', { replace: true })
  }
}

function DriverAccountMenu({ dark }: { dark?: boolean }) {
  const t = useT()
  const name = useName()
  const { driver, vehicle } = useDriverDay()
  const out = useSignOutDriver()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className={cn('flex items-center gap-2 rounded-lg p-1', dark ? 'hover:bg-white/10' : 'hover:bg-muted')} aria-label={t('Profile')}>
          <span className="flex size-8 items-center justify-center rounded-full bg-maroon text-[12px] font-semibold text-white">{initials(driver?.name ?? 'D')}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel>
          {name(driver)}
          <div className="text-[11px] font-normal text-muted-foreground">{t('Driver')} · {vehicle?.plateNo ?? '-'}</div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={out} className="text-danger focus:text-danger"><LogOut /> {t('Sign out')}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** desktop: platform sidebar with the driver menu */
function DriverSidebar() {
  const t = useT()
  const name = useName()
  const tabs = useDriverTabs()
  const { driver, vehicle } = useDriverDay()
  const out = useSignOutDriver()
  return (
    <aside className="sticky top-0 hidden h-dvh w-[248px] shrink-0 flex-col bg-sidebar text-sidebar-foreground lg:flex">
      <div className="flex h-[68px] items-center border-b border-sidebar-border px-4"><Logo /></div>
      <div className="mx-3 mt-3 rounded-xl bg-sidebar-accent p-3">
        <div className="flex items-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded-full bg-maroon text-[12px] font-semibold">{initials(driver?.name ?? 'D')}</span>
          <div className="min-w-0 leading-tight">
            <div className="truncate text-[13px] font-semibold">{name(driver)}</div>
            <div className="truncate text-[11.5px] text-sidebar-muted">{t('Driver')} · {driver?.code}</div>
          </div>
        </div>
        <div className="mt-2.5 flex items-center gap-1.5 text-[11.5px] text-sidebar-muted"><Truck className="size-3.5" /> {vehicle ? `${vehicle.plateNo} · ${vehicle.type}` : '-'}</div>
      </div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-3">
        <div className="mb-1.5 px-2.5 text-[10.5px] font-semibold tracking-wider text-sidebar-muted/70 uppercase">{t('My day')}</div>
        {tabs.map((x) => (
          <NavLink
            key={x.to}
            to={x.to}
            end={x.end}
            className={({ isActive }) => cn('flex h-10 items-center gap-3 rounded-lg px-2.5 text-[13.5px] font-medium transition-colors', isActive ? 'bg-brand text-white shadow-sm' : 'text-sidebar-muted hover:bg-sidebar-accent hover:text-white')}
          >
            <x.icon className="size-[18px]" />
            {t(x.label)}
            {!!x.badge && <span className="ms-auto rounded-full bg-red px-1.5 text-[10px] leading-4 font-bold text-white">{x.badge}</span>}
          </NavLink>
        ))}
      </nav>
      <button onClick={out} className="flex h-11 items-center gap-2 border-t border-sidebar-border px-4 text-[12.5px] text-sidebar-muted hover:text-white">
        <LogOut className="flip-rtl size-4" /> {t('Sign out')}
      </button>
    </aside>
  )
}

function DesktopHeader() {
  const t = useT()
  const loc = useLocation()
  const { driverId } = useDriverDay()
  const title = TITLES.find(([re]) => re.test(loc.pathname))?.[1] ?? 'Home'
  return (
    <header className="sticky top-0 z-40 hidden h-16 items-center gap-2 border-b bg-card/95 px-6 backdrop-blur lg:flex">
      <h1 className="text-[17px] font-bold text-brand-ink">{t(title)}</h1>
      <div className="ms-auto flex items-center gap-1.5">
        <div className="flex items-center gap-1.5 rounded-lg border bg-muted/50 px-2.5 py-1.5 text-[12px] text-muted-foreground">
          <CalendarDays className="size-3.5" />
          {t('Business day')}: <span className="font-semibold text-foreground">{fmtDate(todayKey())}</span>
        </div>
        <LanguageToggle />
        <NotificationsBell audience="driver" driverId={driverId} />
        <DriverAccountMenu />
      </div>
    </header>
  )
}

/** phones: app-style top bar */
function MobileTopBar() {
  const name = useName()
  const { driver, vehicle, driverId } = useDriverDay()
  return (
    <div className="sticky top-0 z-40 shrink-0 bg-navy px-3 pt-[max(0.6rem,env(safe-area-inset-top))] pb-2.5 text-white lg:hidden">
      <div className="flex items-center gap-2">
        <BrandLogo size={30} tile />
        <div className="min-w-0 flex-1 leading-tight">
          <div className="truncate text-[15px] font-semibold">{name(driver)}</div>
          <div className="truncate text-[11.5px] text-sidebar-muted">{vehicle ? `${vehicle.plateNo} · ${vehicle.type}` : '-'}</div>
        </div>
        <NotificationsBell audience="driver" driverId={driverId} dark />
        <LanguageToggle dark />
        <DriverAccountMenu dark />
      </div>
    </div>
  )
}

/** phones: bottom tab bar */
function TabBar() {
  const t = useT()
  const tabs = useDriverTabs()
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
      {tabs.map((x) => (
        <NavLink
          key={x.to}
          to={x.to}
          end={x.end}
          className={({ isActive }) => cn('relative flex h-16 flex-col items-center justify-center gap-1 text-[11.5px] font-medium', isActive ? 'text-brand' : 'text-muted-foreground')}
        >
          {({ isActive }) => (
            <>
              {isActive && <span className="absolute top-0 h-0.5 w-10 rounded-full bg-brand" />}
              <x.icon className="size-[22px]" />
              {t(x.label)}
              {!!x.badge && <span className="absolute top-2 start-[calc(50%+6px)] min-w-4 rounded-full bg-red px-1 text-[10px] leading-4 font-bold text-white">{x.badge}</span>}
            </>
          )}
        </NavLink>
      ))}
    </nav>
  )
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh bg-background">
      <DriverSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <DesktopHeader />
        <MobileTopBar />
        <main id="driver-scroll" className="flex-1 pb-[calc(4.5rem+env(safe-area-inset-bottom))] lg:pb-8">
          <div className="mx-auto w-full max-w-3xl lg:py-4">{children}</div>
        </main>
        <TabBar />
      </div>
    </div>
  )
}

function NoVehicle() {
  const t = useT()
  return (
    <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
      <p className="text-[16px] font-semibold">{t('No vehicle assigned')}</p>
      <p className="mt-1 text-[13px] text-muted-foreground">{t('Ask your supervisor to assign a vehicle before starting the route.')}</p>
    </div>
  )
}

export default function DriverApp() {
  const role = useUI((s) => s.role)
  const setRole = useUI((s) => s.setRole)
  const driverId = useUI((s) => s.driverId)
  const driver = useStore((s) => s.db.drivers.find((d) => d.id === driverId))
  const loc = useLocation()
  const nav = useNavigate()
  useEffect(() => {
    if (role !== 'driver') setRole('driver')
  }, [role, setRole])
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [loc.pathname])

  // drivers sign in through the shared login page with their PIN
  if (!driver || !isSignedIn(driverId)) return <Navigate to="/login" replace state={{ from: '/driver', mode: 'driver', driverId }} />
  return (
    <Shell>
      <ErrorBoundary>
        {!driver.vehicleId ? (
          <NoVehicle />
        ) : (
          <Routes>
            <Route index element={<Home onSignOut={() => nav('/login', { replace: true })} />} />
            <Route path="route" element={<RouteList />} />
            <Route path="stop/:id" element={<StopScreen />} />
            <Route path="collect" element={<Collect />} />
            <Route path="sale" element={<VanSale />} />
            <Route path="stock" element={<Stock />} />
            <Route path="settle" element={<Settle />} />
            <Route path="*" element={<Navigate to="/driver" replace />} />
          </Routes>
        )}
      </ErrorBoundary>
    </Shell>
  )
}
