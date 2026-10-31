import { useNavigate } from 'react-router-dom'
import { CheckCircle2, ChevronRight, HandCoins, LogOut, MapPin, Package, PackageOpen, Receipt, Route as RouteIcon, Scale, ShoppingBag, Truck, Wallet } from 'lucide-react'
import { useT, useName } from '@/i18n'
import { fmtDate, fmtKg, fmtSAR, todayKey } from '@/lib/format'
import { cn } from '@/lib/utils'
import { StatusBadge } from '@/components/common'
import { Progress } from '@/components/ui/progress'
import { signOut, useDriverDay } from '../useDriverDay'
import { BigButton, SectionTitle, Tile } from '../ui'

export default function Home({ onSignOut }: { onSignOut: () => void }) {
  const t = useT()
  const name = useName()
  const nav = useNavigate()
  const d = useDriverDay()
  const next = d.pending[0]
  const nextCustomer = next && d.db.customers.find((c) => c.id === next.customerId)
  const pct = d.stops.length ? (d.done.length / d.stops.length) * 100 : 0
  const hour = new Date().getHours()
  const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  return (
    <div className="space-y-4 px-4 pt-4 pb-6">
      <div>
        <p className="text-[13px] text-muted-foreground">{fmtDate(todayKey())}</p>
        <h1 className="text-[22px] font-bold text-brand-ink">{t(greet)}, {name(d.driver).split(' ')[0]}</h1>
      </div>

      {d.settlement && (
        <button onClick={() => nav('/driver/settle')} className="flex w-full items-center gap-3 rounded-2xl border border-brand/30 bg-brand-soft p-3.5 text-start">
          <Scale className="size-6 text-brand" />
          <div className="min-w-0 flex-1">
            <div className="text-[14px] font-semibold">{t('Settlement')} {d.settlement.settlementNo}</div>
            <div className="text-[12px] text-muted-foreground">{t('Status')}: {t(d.settlement.status)}</div>
          </div>
          <StatusBadge status={d.settlement.status} />
        </button>
      )}

      <div className="rounded-2xl bg-navy p-4 text-white">
        <div className="flex items-center justify-between text-[13px]">
          <span className="text-sidebar-muted">{t('Deliveries completed')}</span>
          <span className="font-semibold tabular">{d.done.length} / {d.stops.length}</span>
        </div>
        <Progress value={pct} className="mt-2 h-2 bg-white/15" />
        {next && nextCustomer ? (
          <button onClick={() => nav(`/driver/stop/${next.id}`)} className="mt-4 flex w-full items-center gap-3 rounded-xl bg-white/10 p-3 text-start active:bg-white/20">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand text-[15px] font-bold">{next.routeSeq}</span>
            <span className="min-w-0 flex-1">
              <span className="block text-[11.5px] text-sidebar-muted">{t('Next stop')}</span>
              <span className="block truncate text-[15px] font-semibold">{name(nextCustomer)}</span>
              <span className="block truncate text-[12px] text-sidebar-muted"><MapPin className="me-1 inline size-3" />{nextCustomer.district}, {nextCustomer.city}</span>
            </span>
            <ChevronRight className="flip-rtl size-5" />
          </button>
        ) : (
          <div className="mt-4 flex items-center gap-2 rounded-xl bg-white/10 p-3 text-[14px]">
            <CheckCircle2 className="size-5 text-brand-muted" />
            {d.stops.length ? t('All stops completed - collect payments and settle your day') : t('No deliveries assigned today')}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Tile label="Stock loaded" value={fmtKg(d.loadedKg, 0)} sub={`${t('On van now')}: ${fmtKg(d.vanKg, 0)}`} icon={Package} tone="navy" onClick={() => nav('/driver/stock')} />
        <Tile label="Total sales" value={fmtSAR(d.sales, { decimals: false })} sub={`${d.invoices.length} ${t('invoices')}`} icon={Receipt} />
        <Tile label="Payments collected" value={fmtSAR(d.collected, { decimals: false })} sub={`${t('Cash')} ${fmtSAR(d.cash, { decimals: false })} · ${t('Bank')} ${fmtSAR(d.bank, { decimals: false })}`} icon={Wallet} tone="info" onClick={() => nav('/driver/collect')} />
        <Tile label="Pending customer payments" value={fmtSAR(d.pendingPayments, { decimals: false })} sub={`${d.routeCustomers.filter((c) => d.outstanding[c.id] > 0).length} ${t('customers')}`} icon={HandCoins} tone="warning" onClick={() => nav('/driver/collect?view=outstanding')} />
      </div>

      <SectionTitle>{t('Quick actions')}</SectionTitle>
      <div className="grid grid-cols-2 gap-3">
        {[
          { label: 'My route', icon: RouteIcon, to: '/driver/route' },
          { label: 'Collect payment', icon: HandCoins, to: '/driver/collect' },
          { label: 'Van sale', icon: ShoppingBag, to: '/driver/sale', disabled: d.dayClosed },
          { label: 'Return stock', icon: PackageOpen, to: '/driver/stock?action=return' },
        ].map((a) => (
          <button
            key={a.label}
            disabled={a.disabled}
            onClick={() => nav(a.to)}
            className="flex h-20 flex-col items-center justify-center gap-1.5 rounded-2xl border bg-card text-[14px] font-semibold active:bg-muted disabled:opacity-40"
          >
            <a.icon className="size-6 text-brand" />
            {t(a.label)}
          </button>
        ))}
      </div>
      <BigButton icon={Scale} variant={d.pending.length ? 'outline' : 'default'} onClick={() => nav('/driver/settle')}>
        {t('Submit daily settlement')}
      </BigButton>

      <SectionTitle>{t("Today's customers")}</SectionTitle>
      <div className="space-y-2">
        {d.stops.length === 0 && <p className="rounded-xl border border-dashed p-5 text-center text-[13px] text-muted-foreground">{t('No deliveries assigned today')}</p>}
        {d.stops.map((s) => {
          const c = d.db.customers.find((x) => x.id === s.customerId)
          return (
            <button key={s.id} onClick={() => nav(`/driver/stop/${s.id}`)} className="flex w-full items-center gap-3 rounded-xl border bg-card p-3 text-start active:bg-muted">
              <span className={cn('flex size-8 shrink-0 items-center justify-center rounded-full text-[13px] font-bold', s.status === 'pending' || s.status === 'out_for_delivery' ? 'bg-muted' : s.status === 'failed' ? 'bg-danger-soft text-danger' : 'bg-brand-soft text-brand')}>
                {s.routeSeq}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] font-medium">{name(c)}</span>
                <span className="block text-[12px] text-muted-foreground">{t('Outstanding')}: {fmtSAR(d.outstanding[s.customerId] ?? 0)}</span>
              </span>
              <StatusBadge status={s.status} />
            </button>
          )
        })}
      </div>

      <button
        onClick={() => { signOut(d.driverId); onSignOut() }}
        className="mx-auto flex h-11 items-center gap-2 px-4 text-[13px] text-muted-foreground"
      >
        <LogOut className="flip-rtl size-4" /> {t('Sign out')}
      </button>
      <p className="text-center text-[11px] text-muted-foreground"><Truck className="me-1 inline size-3" />{d.warehouse ? name(d.warehouse) : ''}</p>
    </div>
  )
}
