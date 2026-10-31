import { useNavigate } from 'react-router-dom'
import { ChevronRight, MapPin, Phone, ShoppingBag } from 'lucide-react'
import { useT, useName } from '@/i18n'
import { fmtKg, fmtSAR } from '@/lib/format'
import { cn } from '@/lib/utils'
import { StatusBadge } from '@/components/common'
import { DONE, useDriverDay } from '../useDriverDay'
import { BigButton, Screen, SectionTitle } from '../ui'

export default function RouteList() {
  const t = useT()
  const name = useName()
  const nav = useNavigate()
  const d = useDriverDay()
  return (
    <Screen title="My route" back="/driver">
      <p className="-mt-2 text-[13px] text-muted-foreground">
        {t('{done} of {total} stops completed', { done: d.done.length, total: d.stops.length })}
      </p>
      {d.stops.length === 0 && <p className="rounded-xl border border-dashed p-6 text-center text-[14px] text-muted-foreground">{t('No deliveries assigned today')}</p>}
      <ol className="space-y-2.5">
        {d.stops.map((s, i) => {
          const c = d.db.customers.find((x) => x.id === s.customerId)!
          const kg = s.lines.reduce((t2, l) => t2 + l.orderedKg, 0)
          const finished = DONE.includes(s.status)
          return (
            <li key={s.id} className="relative">
              {i < d.stops.length - 1 && <span className="absolute start-[22px] top-12 bottom-[-12px] w-0.5 bg-border" />}
              <button onClick={() => nav(`/driver/stop/${s.id}`)} className={cn('relative flex w-full items-start gap-3 rounded-2xl border bg-card p-3.5 text-start active:bg-muted', !finished && i === d.done.length && 'border-brand ring-2 ring-brand/15')}>
                <span className={cn('flex size-11 shrink-0 items-center justify-center rounded-full text-[16px] font-bold', finished ? (s.status === 'failed' ? 'bg-danger-soft text-danger' : 'bg-brand text-white') : 'bg-muted text-brand-ink')}>{s.routeSeq}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-semibold">{name(c)}</span>
                  <span className="mt-0.5 block truncate text-[12.5px] text-muted-foreground"><MapPin className="me-1 inline size-3" />{c.district}, {c.city}</span>
                  <span className="mt-1.5 flex flex-wrap items-center gap-2 text-[12.5px]">
                    <StatusBadge status={s.status} />
                    <span className="tabular">{fmtKg(kg, 0)}</span>
                    <span className="text-muted-foreground">· {t(s.lines.length === 1 ? '1 product' : '{n} products', { n: s.lines.length })}</span>
                  </span>
                  {(d.outstanding[c.id] ?? 0) > 0 && <span className="mt-1 block text-[12px] text-warning">{t('Outstanding')}: {fmtSAR(d.outstanding[c.id])}</span>}
                </span>
                <span className="flex flex-col items-center gap-2">
                  <a href={`tel:${c.phone.replace(/\s/g, '')}`} onClick={(e) => e.stopPropagation()} className="flex size-10 items-center justify-center rounded-full bg-brand-soft text-brand" aria-label={t('Call')}>
                    <Phone className="size-4" />
                  </a>
                  <ChevronRight className="flip-rtl size-5 text-muted-foreground" />
                </span>
              </button>
            </li>
          )
        })}
      </ol>
      <SectionTitle>{t('Extra sales')}</SectionTitle>
      <BigButton variant="outline" icon={ShoppingBag} onClick={() => nav('/driver/sale')} disabled={d.dayClosed || d.vanKg <= 0}>
        {t('Direct van sale')}
      </BigButton>
    </Screen>
  )
}
