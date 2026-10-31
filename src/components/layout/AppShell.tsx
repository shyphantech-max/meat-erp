import { Suspense, useEffect, useState } from 'react'
import { Navigate, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Grid3x3, Languages, Lock } from 'lucide-react'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { EmptyState, ErrorBoundary, LoadingState } from '@/components/common'
import { useUI } from '@/store/useUI'
import { useSession } from '@/store/session'
import { useT } from '@/i18n'
import { NAV } from '@/data/nav'
import { moduleForPath } from '@/lib/rbac'
import { cn } from '@/lib/utils'
import { Header } from './Header'
import { QuickCreateFab } from './QuickCreate'
import { Sidebar, useNavBadges, useRoleNav } from './Sidebar'

const ALL_ITEMS = NAV.flatMap((g) => g.items)

/** phones & tablets: bottom tab bar with the role's four main modules + "More" */
function MobileTabBar({ onMore }: { onMore: () => void }) {
  const t = useT()
  const session = useSession()
  const badges = useNavBadges()
  const tabs = session.tabs.slice(0, 3).map((k) => ALL_ITEMS.find((i) => i.key === k)!).filter(Boolean)
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
      {tabs.map((x, i) => {
        const count = x.badge ? badges[x.badge] : 0
        const tab = (
          <NavLink key={x.key} to={x.path} end={x.path === '/'} className={({ isActive }) => cn('relative flex h-16 flex-col items-center justify-center gap-1 px-1 text-[10.5px] font-medium', isActive ? 'text-brand' : 'text-muted-foreground')}>
            {({ isActive }) => (
              <>
                {isActive && <span className="absolute top-0 h-0.5 w-10 rounded-full bg-brand" />}
                <x.icon className="size-[22px]" />
                <span className="max-w-full truncate">{t(SHORT[x.key] ?? x.label)}</span>
                {count > 0 && <span className="absolute top-2 start-[calc(50%+6px)] min-w-4 rounded-full bg-red px-1 text-center text-[10px] leading-4 font-bold text-white">{count}</span>}
              </>
            )}
          </NavLink>
        )
        // the raised "+" sits in the middle of the bar
        return i === 2 ? [<QuickCreateFab key="fab" />, tab] : tab
      })}
      {tabs.length < 3 && <QuickCreateFab />}
      <button onClick={onMore} className="flex h-16 flex-col items-center justify-center gap-1 text-[10.5px] font-medium text-muted-foreground">
        <Grid3x3 className="size-[22px]" />
        {t('More')}
      </button>
    </nav>
  )
}
/** short labels for the bottom bar */
const SHORT: Record<string, string> = {
  dashboard: 'Home', purchases: 'Purchases', imports: 'Imports', grn: 'GRN', inventory: 'Stock', customers: 'Customers', sales: 'Sales',
  fleet: 'Fleet', distribution: 'Dispatch', collections: 'Collect', settlement: 'Settle', accounts: 'Accounts', reports: 'Reports', settings: 'Settings',
}

/** "More" sheet: every module the role can open, as an app-style icon grid */
function MoreSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const t = useT()
  const nav = useNavigate()
  const groups = useRoleNav()
  const badges = useNavBadges()
  const { lang, setLang } = useUI()
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="px-4 pt-3">
        <SheetTitle className="sr-only">{t('More')}</SheetTitle>
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-muted" />
        <div className="max-h-[70dvh] space-y-4 overflow-y-auto pb-4">
          {groups.map((g) => (
            <div key={g.label}>
              <div className="mb-2 px-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">{t(g.label)}</div>
              <div className="grid grid-cols-4 gap-2">
                {g.items.map((i) => {
                  const count = i.badge ? badges[i.badge] : 0
                  return (
                    <button key={i.key} onClick={() => { onOpenChange(false); nav(i.path) }} className="relative flex flex-col items-center gap-1.5 rounded-xl p-2 text-center active:bg-muted">
                      <span className="flex size-12 items-center justify-center rounded-2xl bg-brand-soft text-brand"><i.icon className="size-[22px]" /></span>
                      <span className="line-clamp-2 text-[11px] leading-tight font-medium">{t(SHORT[i.key] ?? i.label)}</span>
                      {count > 0 && <span className="absolute top-1 end-2 min-w-4 rounded-full bg-red px-1 text-[10px] leading-4 font-bold text-white">{count}</span>}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
          <Button variant="outline" className="w-full" onClick={() => setLang(lang === 'en' ? 'ar' : 'en')}>
            <Languages /> {lang === 'en' ? 'العربية' : 'English'}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}

function AccessDenied() {
  const t = useT()
  const session = useSession()
  const nav = useNavigate()
  return (
    <EmptyState
      icon={Lock}
      className="mt-10"
      title="You don't have access to this module"
      description={t('Your role ({role}) cannot open this page. Ask the owner if you need access.', { role: t(session.role?.label ?? '') })}
      action={<Button onClick={() => nav('/')}>{t('Go to dashboard')}</Button>}
    />
  )
}

export function AppShell() {
  const { role, setRole, authed, signOut } = useUI()
  const session = useSession()
  const loc = useLocation()
  const [more, setMore] = useState(false)
  useEffect(() => { window.scrollTo(0, 0) }, [loc.pathname])
  // visiting an admin page puts the session back in staff view
  useEffect(() => {
    if (authed && role !== 'admin') setRole('admin')
  }, [authed, role, setRole])
  // signed out, or the user was deactivated / moved to a driver role → back to login
  useEffect(() => {
    if (authed && !session.valid) signOut()
  }, [authed, session.valid, signOut])
  if (!authed || !session.valid) return <Navigate to="/login" replace state={{ from: loc.pathname + loc.search }} />
  const allowed = session.can(moduleForPath(loc.pathname))
  return (
    <div className="flex min-h-dvh">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header />
        <main className="mx-auto w-full max-w-[1500px] flex-1 px-3 pt-4 pb-[calc(5rem+env(safe-area-inset-bottom))] sm:px-6 lg:py-6">
          <ErrorBoundary key={loc.pathname}>
            <Suspense fallback={<LoadingState />}>{allowed ? <Outlet /> : <AccessDenied />}</Suspense>
          </ErrorBoundary>
        </main>
      </div>
      <MobileTabBar onMore={() => setMore(true)} />
      <MoreSheet open={more} onOpenChange={setMore} />
    </div>
  )
}
