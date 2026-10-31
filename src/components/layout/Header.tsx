import { useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Bell, CalendarDays, Check, Languages, LogIn, LogOut, Menu, RotateCcw, Search, Settings, Smartphone, UserCog } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { useT, useName } from '@/i18n'
import { useUI } from '@/store/useUI'
import { useSession } from '@/store/session'
import { moduleForPath } from '@/lib/rbac'
import { NAV } from '@/data/nav'
import { BrandLogo } from '@/components/common'
import { useStore } from '@/store/useStore'
import { useConfirm } from '@/components/common'
import { fmtAgo, fmtDate, fmtSAR, initials, todayKey } from '@/lib/format'
import { cn } from '@/lib/utils'

function GlobalSearch({ className, autoFocus, onDone }: { className?: string; autoFocus?: boolean; onDone?: () => void }) {
  const t = useT()
  const name = useName()
  const nav = useNavigate()
  const db = useStore((s) => s.db)
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const session = useSession()
  const results = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (s.length < 2) return []
    const hit = (...xs: (string | undefined)[]) => xs.some((x) => x?.toLowerCase().includes(s))
    return [
      ...db.customers.filter((c) => hit(c.name, c.nameAr, c.code, c.phone)).slice(0, 4).map((c) => ({ k: c.id, group: 'Customers', label: name(c), sub: `${c.code} · ${c.city}`, to: `/customers/${c.id}` })),
      ...db.invoices.filter((i) => hit(i.invNo)).slice(0, 4).map((i) => ({ k: i.id, group: 'Invoices', label: i.invNo, sub: `${db.customers.find((c) => c.id === i.customerId)?.name} · ${fmtSAR(i.total)}`, to: `/sales?tab=invoices&q=${i.invNo}` })),
      ...db.products.filter((p) => hit(p.name, p.nameAr, p.code)).slice(0, 4).map((p) => ({ k: p.id, group: 'Products', label: name(p), sub: p.code, to: `/inventory?product=${p.id}` })),
      ...db.suppliers.filter((x) => hit(x.name, x.code, x.country)).slice(0, 3).map((x) => ({ k: x.id, group: 'Suppliers', label: x.name, sub: x.country, to: `/purchases?tab=suppliers&q=${encodeURIComponent(x.name)}` })),
      ...db.drivers.filter((d) => hit(d.name, d.nameAr, d.mobile)).slice(0, 3).map((d) => ({ k: d.id, group: 'Drivers', label: name(d), sub: d.mobile, to: `/fleet/drivers/${d.id}` })),
      ...db.purchaseOrders.filter((p) => hit(p.poNo)).slice(0, 3).map((p) => ({ k: p.id, group: 'Purchase orders', label: p.poNo, sub: fmtSAR(p.totalSAR), to: `/purchases?tab=orders&q=${p.poNo}` })),
    ].filter((r) => session.can(moduleForPath(r.to.split('?')[0])))
  }, [q, db, name, session])
  return (
    <Popover open={open && results.length > 0} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <div className={cn('relative w-full max-w-md', className)}>
          <Search className="absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => { setQ(e.target.value); setOpen(true) }}
            onFocus={() => setOpen(true)}
            autoFocus={autoFocus}
            placeholder={t('Search customers, invoices, products…')}
            className="h-9 bg-muted/60 ps-9"
          />
        </div>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] p-1" onOpenAutoFocus={(e) => e.preventDefault()}>
        {results.map((r, i) => (
          <div key={r.k}>
            {(i === 0 || results[i - 1].group !== r.group) && <div className="px-2 pt-2 pb-1 text-[10.5px] font-semibold tracking-wide text-muted-foreground uppercase">{t(r.group)}</div>}
            <button
              className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-start text-[13px] hover:bg-muted"
              onClick={() => { nav(r.to); setOpen(false); setQ(''); onDone?.() }}
            >
              <span className="truncate font-medium">{r.label}</span>
              <span className="truncate text-[11.5px] text-muted-foreground">{r.sub}</span>
            </button>
          </div>
        ))}
      </PopoverContent>
    </Popover>
  )
}

export function NotificationsBell({ audience, driverId, dark }: { audience: 'admin' | 'driver'; driverId?: string; dark?: boolean }) {
  const t = useT()
  const nav = useNavigate()
  const items = useStore((s) => s.db.notifications).filter((n) => n.audience === audience && (audience === 'admin' || n.driverId === driverId)).slice(0, 25)
  const markRead = useStore((s) => s.markNotificationsRead)
  const unread = items.filter((n) => !n.read).length
  const dot = { info: 'bg-info', success: 'bg-success', warning: 'bg-warning', danger: 'bg-danger' }
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className={cn('relative', dark && 'text-white hover:bg-white/10')} aria-label={t('Notifications')}>
          <Bell className="size-[18px]" />
          {unread > 0 && <span className="absolute top-1 end-1 flex size-4 items-center justify-center rounded-full bg-danger text-[9.5px] font-bold text-white">{unread > 9 ? '9+' : unread}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[340px] p-0">
        <div className="flex items-center justify-between border-b px-3 py-2.5">
          <span className="text-sm font-semibold">{t('Notifications')}</span>
          {unread > 0 && (
            <button className="text-[12px] font-medium text-brand hover:underline" onClick={() => markRead(audience, driverId)}>
              {t('Mark all read')}
            </button>
          )}
        </div>
        <div className="max-h-96 overflow-y-auto">
          {items.length === 0 && <p className="p-6 text-center text-xs text-muted-foreground">{t('No notifications')}</p>}
          {items.map((n) => (
            <button key={n.id} onClick={() => n.link && nav(n.link)} className={cn('flex w-full gap-2.5 border-b px-3 py-2.5 text-start last:border-0 hover:bg-muted/60', !n.read && 'bg-brand-soft/40')}>
              <span className={cn('mt-1.5 size-2 shrink-0 rounded-full', dot[n.kind])} />
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-medium">{t(n.title)}</span>
                <span className="block truncate text-[12px] text-muted-foreground">{n.body}</span>
                <span className="text-[11px] text-muted-foreground">{fmtAgo(n.at)}</span>
              </span>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}

export function LanguageToggle({ dark }: { dark?: boolean }) {
  const lang = useUI((s) => s.lang)
  const setLang = useUI((s) => s.setLang)
  return (
    <Button variant="ghost" size="sm" className={cn('gap-1.5 font-semibold', dark && 'text-white hover:bg-white/10')} onClick={() => setLang(lang === 'en' ? 'ar' : 'en')} aria-label="Language">
      <Languages className="size-4" />
      {lang === 'en' ? 'العربية' : 'English'}
    </Button>
  )
}

export function useResetDemo() {
  const confirm = useConfirm()
  const reset = useStore((s) => s.reset)
  const t = useT()
  return async () => {
    if (await confirm({ title: t('Reset all data?'), description: t('All transactions will be discarded and the opening data reloaded for today.'), confirmText: t('Reset data'), destructive: true })) {
      reset()
      toast.success(t('Data reset'))
    }
  }
}

export function Header() {
  const t = useT()
  const nav = useNavigate()
  const loc = useLocation()
  const signOut = useUI((s) => s.signOut)
  const session = useSession()
  const me = { name: session.user?.name ?? '', email: session.user?.email ?? '', label: session.role?.label ?? '' }
  const [searchOpen, setSearchOpen] = useState(false)
  const key = moduleForPath(loc.pathname)
  const title = NAV.flatMap((g) => g.items).find((i) => i.key === key)?.label ?? 'Dashboard'
  const leave = (toastMsg?: string) => {
    signOut()
    if (toastMsg) toast.success(t(toastMsg))
    nav('/login', { replace: true })
  }
  const profile = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="ms-0.5 flex items-center gap-2 rounded-lg p-1 hover:bg-muted" aria-label={t('Profile')}>
          <span className="flex size-8 items-center justify-center rounded-full bg-navy text-[12px] font-semibold text-white">{initials(me.name)}</span>
          <span className="hidden text-start leading-tight 2xl:block">
            <span className="block text-[12.5px] font-semibold">{me.name}</span>
            <span className="block text-[11px] text-muted-foreground">{t(me.label)}</span>
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="flex items-center gap-2.5 py-2">
          <span className="flex size-9 items-center justify-center rounded-full bg-navy text-[12px] font-semibold text-white">{initials(me.name)}</span>
          <span className="min-w-0">
            <span className="block truncate">{me.name}</span>
            <span className="block truncate text-[11px] font-normal text-muted-foreground">{me.email}</span>
          </span>
        </DropdownMenuLabel>
        <div className="px-2 pb-1.5">
          <span className="rounded-full bg-brand-soft px-2 py-0.5 text-[11px] font-semibold text-brand">{t(me.label)}</span>
        </div>
        <DropdownMenuSeparator />
        {session.can('settings') && <DropdownMenuItem onClick={() => nav('/settings')}><Settings /> {t('Settings')}</DropdownMenuItem>}
        <DropdownMenuItem onClick={() => leave()}><LogIn /> {t('Switch account')}</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => leave('Signed out')} className="text-danger focus:text-danger"><LogOut /> {t('Sign out')}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
  return (
    <header className="sticky top-0 z-40 border-b bg-card/95 pt-[env(safe-area-inset-top)] backdrop-blur">
      {/* desktop */}
      <div className="hidden h-16 items-center gap-2 px-5 lg:flex">
        <GlobalSearch />
        <div className="ms-auto flex items-center gap-1.5">
          <div className="hidden items-center gap-1.5 rounded-lg border bg-muted/50 px-2.5 py-1.5 text-[12px] text-muted-foreground xl:flex">
            <CalendarDays className="size-3.5" />
            {t('Business day')}: <span className="font-semibold text-foreground">{fmtDate(todayKey())}</span>
          </div>
          <LanguageToggle />
          <NotificationsBell audience="admin" />
          {profile}
        </div>
      </div>
      {/* phones & tablets: app bar */}
      <div className="flex h-14 items-center gap-2 px-3 lg:hidden">
        <BrandLogo size={30} />
        <div className="min-w-0 flex-1 leading-tight">
          <div className="truncate text-[15px] font-bold text-brand-ink">{t(title)}</div>
          <div className="truncate text-[11px] text-muted-foreground">{me.name} · {t(me.label)}</div>
        </div>
        <Button variant="ghost" size="icon" onClick={() => setSearchOpen((o) => !o)} aria-label={t('Search')}>
          <Search className="size-[18px]" />
        </Button>
        <NotificationsBell audience="admin" />
        {profile}
      </div>
      {searchOpen && (
        <div className="border-t px-3 py-2 lg:hidden">
          <GlobalSearch className="max-w-none" autoFocus onDone={() => setSearchOpen(false)} />
        </div>
      )}
    </header>
  )
}
