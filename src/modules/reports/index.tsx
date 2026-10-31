/**
 * Report hub: pick a report (?r=key), set filters, read totals, export CSV or print.
 */
import { useMemo, useState } from 'react'
import { BRAND } from '@/lib/brand'
import { useSearchParams } from 'react-router-dom'
import type { ColumnDef } from '@tanstack/react-table'
import { BarChart3, Printer, RotateCcw } from 'lucide-react'
import { useStore } from '@/store/useStore'
import { useT, useName } from '@/i18n'
import { DocFooterNote, DocHeader, EmptyState, PageHeader, Picker, PrintDialog, Stat } from '@/components/common'
import { DataTable } from '@/components/tables/DataTable'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { fmtDate, shiftDay, todayKey } from '@/lib/format'
import { REPORTS, fmtValue, isNumeric, type Col, type FilterKey, type Filters } from './defs'

const ALL = '__all'

export default function Reports() {
  const t = useT()
  const name = useName()
  const db = useStore((s) => s.db)
  const [params, setParams] = useSearchParams()
  const key = params.get('r') ?? REPORTS[0].key
  const def = REPORTS.find((r) => r.key === key) ?? REPORTS[0]
  const today = todayKey()
  const defaults = (): Filters => ({ from: shiftDay(today, -29), to: today })
  const [f, setF] = useState<Filters>(defaults)
  const [printOpen, setPrintOpen] = useState(false)

  const out = useMemo(() => {
    const filters: Filters = def.dated ? f : { ...f, from: '0000-01-01', to: '9999-12-31' }
    // drop filters the report does not use so switching reports never hides data
    const clean: Filters = { from: filters.from, to: filters.to }
    for (const k of def.filters) (clean as any)[k] = (filters as any)[k]
    return def.build(db, clean, { name, t })
  }, [db, def, f, name, t])

  const columns = useMemo<ColumnDef<any, any>[]>(
    () =>
      out.cols.map((c: Col<any>) => ({
        id: c.id,
        header: c.header,
        accessorFn: (r: any) => c.value(r),
        cell: ({ row }) => {
          const r = row.original
          const node = c.cell ? c.cell(r) : fmtValue(c.fmt, c.value(r), t)
          return <div className={cn(isNumeric(c.fmt) && 'text-end tabular', c.id === out.cols[0].id && 'font-medium')}>{node}</div>
        },
      })),
    [out, t],
  )

  const select = (k: string) => {
    setParams({ r: k }, { replace: true })
  }
  const opts = (k: FilterKey): { value: string; label: string }[] => {
    const all = { value: ALL, label: `${t('All')}` }
    if (k === 'driver') return [all, ...db.drivers.map((d) => ({ value: d.id, label: name(d) }))]
    if (k === 'customer') return [all, ...db.customers.map((c) => ({ value: c.id, label: name(c) }))]
    if (k === 'warehouse') return [all, ...db.warehouses.map((w) => ({ value: w.id, label: name(w) }))]
    if (k === 'product') return [all, ...db.products.map((p) => ({ value: p.id, label: name(p) }))]
    if (k === 'supplier') return [all, ...db.suppliers.map((s) => ({ value: s.id, label: s.name }))]
    return [all, { value: 'cash', label: t('Cash') }, { value: 'bank', label: t('Bank transfer') }]
  }
  const filterLabel: Record<FilterKey, string> = { driver: 'Driver', customer: 'Customer', warehouse: 'Warehouse', product: 'Product', supplier: 'Supplier', method: 'Method' }
  const period = def.dated ? `${fmtDate(f.from)} - ${fmtDate(f.to)}` : `${t('As of')} ${fmtDate(today)}`
  const activeFilters = def.filters.filter((k) => (f as any)[k]).map((k) => `${t(filterLabel[k])}: ${opts(k).find((o) => o.value === (f as any)[k])?.label}`)

  return (
    <div>
      <PageHeader
        title="Reports"
        icon={BarChart3}
        description="Filterable operational and financial reports with CSV export and print-friendly views."
        actions={
          <Button variant="outline" onClick={() => setPrintOpen(true)} disabled={!out.rows.length}>
            <Printer /> {t('Print preview')}
          </Button>
        }
      />
      <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
        {/* report list */}
        <div className="lg:hidden">
          <Picker value={def.key} onChange={select} options={REPORTS.map((r) => ({ value: r.key, label: t(r.title) }))} />
        </div>
        <Card className="hidden h-fit gap-0 p-1.5 lg:sticky lg:top-20 lg:block">
          {REPORTS.map((r, i) => (
            <button
              key={r.key}
              onClick={() => select(r.key)}
              className={cn('flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-start text-[13px] transition-colors', r.key === def.key ? 'bg-brand-soft font-semibold text-brand' : 'text-foreground hover:bg-muted')}
            >
              <span className={cn('flex size-7 shrink-0 items-center justify-center rounded-md', r.key === def.key ? 'bg-brand text-white' : 'bg-muted text-muted-foreground')}>
                <r.icon className="size-3.5" />
              </span>
              <span className="min-w-0 leading-tight">
                <span className="block truncate">{i + 1}. {t(r.title)}</span>
              </span>
            </button>
          ))}
        </Card>

        <div className="min-w-0 space-y-4">
          <Card className="gap-0 p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="flex items-start gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand">
                  <def.icon className="size-4" />
                </span>
                <div>
                  <h2 className="text-[16px] font-semibold text-brand-ink">{t(def.title)}</h2>
                  <p className="text-[12.5px] text-muted-foreground">{t(def.description)}</p>
                </div>
              </div>
              <span className="rounded-md bg-muted px-2 py-1 text-[11.5px] text-muted-foreground">{period}</span>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
              {def.dated && (
                <>
                  <div className="space-y-1.5">
                    <Label className="text-[12px]">{t('From')}</Label>
                    <Input type="date" value={f.from} max={f.to} onChange={(e) => e.target.value && setF({ ...f, from: e.target.value })} className="h-9" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[12px]">{t('To')}</Label>
                    <Input type="date" value={f.to} min={f.from} onChange={(e) => e.target.value && setF({ ...f, to: e.target.value })} className="h-9" />
                  </div>
                </>
              )}
              {def.filters.map((k) => (
                <div key={k} className="space-y-1.5">
                  <Label className="text-[12px]">{t(filterLabel[k])}</Label>
                  <Picker value={(f as any)[k] ?? ALL} onChange={(v) => setF({ ...f, [k]: v === ALL ? undefined : v })} options={opts(k)} />
                </div>
              ))}
              <div className="flex items-end">
                <Button variant="ghost" size="sm" className="h-9" onClick={() => setF(defaults())}>
                  <RotateCcw /> {t('Reset filters')}
                </Button>
              </div>
            </div>
            {def.dated && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {[
                  ['Today', 0],
                  ['Last 7 days', 6],
                  ['Last 30 days', 29],
                  ['Last 90 days', 89],
                ].map(([l, n]) => (
                  <button
                    key={l}
                    className={cn('rounded-full border px-2.5 py-0.5 text-[11.5px] hover:bg-muted', f.from === shiftDay(today, -(n as number)) && f.to === today && 'border-brand bg-brand-soft text-brand')}
                    onClick={() => setF({ ...f, from: shiftDay(today, -(n as number)), to: today })}
                  >
                    {t(l as string)}
                  </button>
                ))}
              </div>
            )}
          </Card>

          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            {out.summary.map((s) => (
              <Stat key={s.label} label={s.label} value={s.value} />
            ))}
          </div>

          {out.rows.length ? (
            <DataTable key={def.key} data={out.rows} columns={columns} exportName={`${def.key}-${f.from}-${f.to}`} searchPlaceholder="Search…" pageSize={15} />
          ) : (
            <EmptyState icon={def.icon} title="No data for the selected filters" description="Widen the date range or clear filters." />
          )}
        </div>
      </div>

      <PrintDialog open={printOpen} onOpenChange={setPrintOpen} title={def.title} wide>
        <DocHeader title={def.title} number={period} date={`${t('Printed')} ${fmtDate(today)}`} />
        {activeFilters.length > 0 && <p className="mb-3 text-[11.5px] text-[#5f6b7a]">{activeFilters.join(' · ')}</p>}
        <div className="mb-4 grid grid-cols-4 gap-2">
          {out.summary.map((s) => (
            <div key={s.label} className="rounded border border-[#e3e8ef] px-2.5 py-2">
              <div className="text-[10px] tracking-wide text-[#5f6b7a] uppercase">{t(s.label)}</div>
              <div className="text-[13px] font-semibold">{s.value}</div>
            </div>
          ))}
        </div>
        <table className="w-full border-collapse text-[10.5px]">
          <thead>
            <tr>
              {out.cols.map((c) => (
                <th key={c.id} className={cn('border-b border-[#d5dce6] bg-[#f1f4f8] px-1.5 py-1 font-semibold text-[#5f6b7a]', isNumeric(c.fmt) ? 'text-end' : 'text-start')}>{t(c.header)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {out.rows.map((r, i) => (
              <tr key={i}>
                {out.cols.map((c) => (
                  <td key={c.id} className={cn('border-b border-[#edf1f5] px-1.5 py-1', isNumeric(c.fmt) && 'text-end tabular')}>{fmtValue(c.fmt, c.value(r), t)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <DocFooterNote>{t('{n} rows', { n: out.rows.length })} · {BRAND.full}</DocFooterNote>
      </PrintDialog>
    </div>
  )
}
