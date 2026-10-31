/**
 * Sign-in for every user (owner, supervisor, accountant, store keeper, custom roles and drivers).
 * Users and roles come from the database and are managed in Users & Access.
 * Staff land in the web console with only their role's modules; drivers land in the driver app.
 */
import { useState, type FormEvent } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { produce } from 'immer'
import { Boxes, Check, ChevronDown, Eye, EyeOff, HandCoins, Lock, Mail, Scale, ShieldCheck, Smartphone, Truck, UserRound } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { BrandLogo, Field } from '@/components/common'
import { LanguageToggle } from '@/components/layout/Header'
import { useT } from '@/i18n'
import { useUI } from '@/store/useUI'
import { useStore } from '@/store/useStore'
import { signIn as driverSignIn } from '@/modules/driver-app/useDriverDay'
import { BRAND } from '@/lib/brand'
import { initials } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { AppUser } from '@/types'
import { BrandVideo } from './BrandVideo'
import { isRemote } from '@/data/remote/config'
import { remoteLogin } from '@/data/remote/sync'

export default function Login() {
  const t = useT()
  const nav = useNavigate()
  const loc = useLocation()
  const { authed, signIn, signOut, setRole } = useUI()
  const company = useStore((s) => s.db.settings)
  const users = useStore((s) => s.db.users)
  const roles = useStore((s) => s.db.roles)
  const vehicles = useStore((s) => s.db.vehicles)
  const drivers = useStore((s) => s.db.drivers)
  const navState = (loc.state ?? {}) as { from?: string; mode?: 'driver'; driverId?: string }
  const preset = navState.mode === 'driver' ? users.find((u) => u.driverId === navState.driverId) : users.find((u) => u.roleKey === 'owner' && u.active)
  const [email, setEmail] = useState(preset?.email ?? '')
  const [password, setPassword] = useState(preset?.password ?? '')
  const [show, setShow] = useState(false)
  const [remember, setRemember] = useState(true)
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState<{ email?: string; password?: string; form?: string }>({})
  const from = navState.from && !navState.from.startsWith('/driver') && navState.from !== '/login' ? navState.from : '/'

  // a staff session goes straight in; switching to a driver always asks to sign in
  if (authed && navState.mode !== 'driver') return <Navigate to={from} replace />

  const roleOf = (u?: AppUser) => roles.find((r) => r.key === u?.roleKey)
  const match = users.find((u) => u.email.toLowerCase() === email.trim().toLowerCase())
  const matchRole = roleOf(match)
  const staffUsers = users.filter((u) => roleOf(u)?.kind === 'staff')
  const driverUsers = users.filter((u) => roleOf(u)?.kind === 'driver')

  const pick = (u: AppUser) => {
    setEmail(u.email)
    setPassword(u.password)
    setErrors({})
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const errs: typeof errors = {}
    if (!email.trim()) errs.email = 'Enter your email'
    else if (!/^\S+@\S+\.\S+$/.test(email.trim())) errs.email = 'Enter a valid email address'
    if (!password) errs.password = 'Enter your password'
    setErrors(errs)
    if (Object.keys(errs).length) return
    setBusy(true)
    if (isRemote()) {
      // Catalyst backend: the server checks the password and returns the session + data
      remoteLogin(email.trim(), password)
        .then((u) => finish(u))
        .catch((e: Error) => {
          setBusy(false)
          setErrors({ form: e.message || 'Incorrect email or password.' })
        })
      return
    }
    setTimeout(() => {
      const u = match
      const role = roleOf(u)
      if (!u || u.password !== password || !role) {
        setBusy(false)
        setErrors({ form: 'Incorrect email or password.' })
        return
      }
      if (!u.active) {
        setBusy(false)
        setErrors({ form: 'This account is deactivated. Contact the owner.' })
        return
      }
      useStore.setState((st) => ({ db: produce(st.db, (d) => { const x = d.users.find((y) => y.id === u.id); if (x) x.lastLoginAt = new Date().toISOString() }) }))
      finish(u)
    }, 550)
  }

  /** route the signed-in user: drivers to the driver app, staff to the console */
  const finish = (u: AppUser) => {
    const role = useStore.getState().db.roles.find((r) => r.key === u.roleKey)
    const drivers = useStore.getState().db.drivers
    if (role?.kind === 'driver') {
        const d = drivers.find((x) => x.id === u.driverId)
        if (!d) {
          setBusy(false)
          setErrors({ form: 'This driver account is not linked to a driver profile.' })
          return
        }
        signOut() // a driver never keeps a staff session
        driverSignIn(d.id)
        setRole('driver', d.id)
        toast.success(t('Welcome back, {name}', { name: u.name.split(' ')[0] }))
        nav('/driver', { replace: true })
        return
    }
    signIn(u.id)
    toast.success(t('Welcome back, {name}', { name: u.name.split(' ')[0] }))
    nav(from, { replace: true })
  }

  const features = [
    { icon: Boxes, text: 'Imports, GRN and batch-wise cold-store inventory' },
    { icon: Truck, text: 'Van loading, B2B deliveries and van sales' },
    { icon: HandCoins, text: 'Driver collections against today’s sales and old dues' },
    { icon: Scale, text: 'Daily driver settlement with cash & stock reconciliation' },
  ]
  const isDriver = matchRole?.kind === 'driver'
  const plate = (u: AppUser) => vehicles.find((v) => v.id === drivers.find((d) => d.id === u.driverId)?.vehicleId)?.plateNo

  const userItem = (u: AppUser) => {
    const r = roleOf(u)
    const drv = r?.kind === 'driver'
    return (
      <DropdownMenuItem key={u.id} disabled={!u.active} onClick={() => pick(u)} className="items-start gap-3 rounded-lg px-2 py-2">
        <span className={cn('mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold', drv ? 'bg-maroon-soft text-maroon' : 'bg-brand-soft text-brand')}>{initials(u.name)}</span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate text-[13px] font-semibold">{u.name}</span>
            <span className={cn('shrink-0 rounded-full px-1.5 text-[10.5px] font-semibold', drv ? 'bg-maroon-soft text-maroon' : 'bg-brand-soft text-brand')}>{t(r?.label ?? '')}</span>
          </span>
          <span className="block truncate text-[11.5px] text-muted-foreground">{!u.active ? t('Deactivated') : drv ? `${u.email} · ${plate(u) ?? '-'}` : u.email}</span>
        </span>
        {email === u.email && <Check className="mt-1 size-4 text-brand" />}
      </DropdownMenuItem>
    )
  }

  return (
    <div className="flex min-h-dvh bg-background">
      {/* brand panel */}
      <div className="relative hidden w-[46%] max-w-[640px] flex-col justify-between overflow-hidden bg-navy p-10 text-white lg:flex">
        <BrandVideo />
        <div className="pointer-events-none absolute -end-40 -top-40 size-[520px] rounded-full border-[40px] border-brand/25" />
        <div className="pointer-events-none absolute -bottom-48 -start-24 size-[460px] rounded-full bg-brand/15 blur-2xl" />
        <div className="relative flex items-center gap-3">
          <BrandLogo size={40} tile />
          <div className="leading-tight">
            <div className="text-[17px] font-bold">{BRAND.name} <span className="text-fresh">{BRAND.suffix}</span></div>
            <div className="text-[12px] text-sidebar-muted">{t(BRAND.tagline)}</div>
          </div>
        </div>
        <div className="relative">
          <div className="mb-8 flex size-44 items-center justify-center rounded-full bg-white shadow-2xl ring-8 ring-white/10">
            <BrandLogo size={150} />
          </div>
          <h2 className="max-w-md text-[32px] leading-tight font-bold tracking-tight">{t('From cold store to customer, every kilo accounted for.')}</h2>
          <p className="mt-3 max-w-md text-[14px] text-sidebar-muted">{t('One system for purchasing, imports, inventory, distribution, collections and daily settlement - replacing the paper registers.')}</p>
          <ul className="mt-7 space-y-3">
            {features.map((f) => (
              <li key={f.text} className="flex items-center gap-3 text-[13.5px]">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-white/10 text-fresh"><f.icon className="size-4" /></span>
                {t(f.text)}
              </li>
            ))}
          </ul>
        </div>
        <div className="relative flex items-center justify-between text-[11.5px] text-sidebar-muted">
          <span>{company.companyName} · <span dir="rtl">{company.companyNameAr}</span></span>
          <span>{t('Kingdom of Saudi Arabia')}</span>
        </div>
      </div>

      {/* form */}
      <div className="flex flex-1 flex-col">
        <div className="flex items-center justify-between p-4 sm:p-6">
          <div className="flex items-center gap-2.5 lg:invisible">
            <BrandLogo size={36} />
            <div className="text-[16px] font-bold text-brand-ink">{BRAND.name} <span className="text-brand">{BRAND.suffix}</span></div>
          </div>
          <LanguageToggle />
        </div>
        <div className="flex flex-1 items-start justify-center px-4 pb-10 sm:items-center sm:px-6">
          <div className="w-full max-w-[420px]">
            <div className="mb-5 flex justify-center lg:hidden">
              <div className="flex size-24 items-center justify-center rounded-full bg-white shadow-lg ring-1 ring-border">
                <BrandLogo size={80} />
              </div>
            </div>
            <h1 className="text-[26px] font-bold tracking-tight text-brand-ink">{t('Welcome back')}</h1>
            <p className="mt-1 text-[13.5px] text-muted-foreground">{t('Sign in to the {brand} console.', { brand: BRAND.full })}</p>

            {!isRemote() && <div className="mt-6">
              <div className="mb-1.5 text-[12.5px] font-medium">{t('Sign in as')}</div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="flex w-full items-center gap-3 rounded-xl border bg-card px-3 py-2.5 text-start shadow-xs transition-colors hover:border-brand/50 focus-visible:border-brand data-[state=open]:border-brand data-[state=open]:ring-[3px] data-[state=open]:ring-brand/15">
                    <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold text-white', isDriver ? 'bg-maroon' : 'bg-brand')}>{initials(match?.name ?? 'U')}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] font-semibold">{match?.name ?? t('Select an account')}</span>
                      <span className="block truncate text-[12px] text-muted-foreground">{matchRole ? t(matchRole.label) : email || '-'}</span>
                    </span>
                    <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="max-h-[60vh] w-[var(--radix-dropdown-menu-trigger-width)] overflow-y-auto p-1.5">
                  <DropdownMenuLabel className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                    <UserRound className="size-3.5" /> {t('Office staff')}
                  </DropdownMenuLabel>
                  {staffUsers.map(userItem)}
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                    <Smartphone className="size-3.5" /> {t('Drivers')}
                  </DropdownMenuLabel>
                  {driverUsers.map(userItem)}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>}

            {errors.form && <div className="mt-4 rounded-lg border border-danger/25 bg-danger-soft px-3 py-2.5 text-[13px] text-danger">{t(errors.form)}</div>}

            <form onSubmit={submit} className="mt-4 space-y-4" noValidate>
              <Field label="Email" error={errors.email}>
                <div className="relative">
                  <Mail className="absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} className={cn('h-11 ps-9', errors.email && 'border-danger')} placeholder="name@company.sa" />
                </div>
              </Field>
              <Field label="Password" error={errors.password}>
                <div className="relative">
                  <Lock className="absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input type={show ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className={cn('h-11 ps-9 pe-10', errors.password && 'border-danger')} />
                  <button type="button" onClick={() => setShow((s) => !s)} className="absolute end-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground" aria-label={show ? t('Hide password') : t('Show password')}>
                    {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              </Field>
              <div className="flex items-center justify-between text-[13px]">
                <label className="flex cursor-pointer items-center gap-2">
                  <Checkbox checked={remember} onCheckedChange={(v) => setRemember(!!v)} /> {t('Remember me')}
                </label>
                <button type="button" className="font-medium text-brand hover:underline" onClick={() => toast.info(t('Please contact your system administrator to reset your password.'))}>
                  {t('Forgot password?')}
                </button>
              </div>
              {matchRole && (
                <div className="flex items-start gap-2 rounded-lg bg-brand-soft/60 px-3 py-2 text-[12px] text-brand-ink">
                  {isDriver ? <Smartphone className="mt-0.5 size-4 shrink-0 text-maroon" /> : <ShieldCheck className="mt-0.5 size-4 shrink-0 text-brand" />}
                  <span><span className="font-semibold">{t(matchRole.label)}:</span> {t(matchRole.description)}</span>
                </div>
              )}
              <Button type="submit" className="h-11 w-full text-[14px]" disabled={busy}>
                {busy ? <span className="size-4 animate-spin rounded-full border-2 border-white/40 border-t-white" /> : <ShieldCheck />}
                {busy ? t('Signing in…') : t('Sign in')}
              </Button>
            </form>

            <p className="mt-6 text-center text-[11.5px] text-muted-foreground">© {new Date().getFullYear()} {company.companyName}</p>
          </div>
        </div>
      </div>
    </div>
  )
}
