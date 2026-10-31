/**
 * Generic data table: global search, faceted filters, sorting, pagination, row selection,
 * CSV / PDF export and row click. Columns are standard TanStack ColumnDefs.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  flexRender, getCoreRowModel, getFilteredRowModel, getPaginationRowModel, getSortedRowModel, useReactTable,
  type ColumnDef, type RowSelectionState, type SortingState, type ColumnFiltersState, type VisibilityState,
} from '@tanstack/react-table'
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Columns3, Download, Search, X } from 'lucide-react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { exportCSV } from '@/lib/export'
import { cn } from '@/lib/utils'
import { useT } from '@/i18n'
import { DropdownMenuCheckboxItem, DropdownMenuLabel, DropdownMenuSeparator } from '@/components/ui/dropdown-menu'

export interface FacetFilter<T> {
  id: string
  label: string
  value: (row: T) => string | undefined
  options?: { value: string; label: string }[]
}

// Stable defaults: a fresh [] / {} on every render would make the filtered rows a new array each time
// and could loop with table state updates.
const NO_FACETS: FacetFilter<any>[] = []
const NO_SORT: SortingState = []
const NO_INITIAL: Record<string, string> = {}

export interface DataTableProps<T> {
  data: T[]
  columns: ColumnDef<T, any>[]
  searchPlaceholder?: string
  /** text used for global search; defaults to JSON of the row */
  searchText?: (row: T) => string
  facets?: FacetFilter<T>[]
  onRowClick?: (row: T) => void
  toolbar?: ReactNode
  selectable?: boolean
  bulkActions?: (rows: T[], clear: () => void) => ReactNode
  exportName?: string
  pageSize?: number
  initialSort?: SortingState
  initialFacets?: Record<string, string>
  rowClassName?: (row: T) => string | undefined
  emptyText?: string
  compact?: boolean
  /** column ids hidden by default (user can re-enable via Columns menu) */
  initialHidden?: string[]
}

export function DataTable<T>({
  data, columns, searchPlaceholder = 'Search…', searchText, facets = NO_FACETS, onRowClick, toolbar, selectable, bulkActions,
  exportName, pageSize = 10, initialSort = NO_SORT, initialFacets = NO_INITIAL, rowClassName, emptyText = 'No records match your filters.', compact, initialHidden,
}: DataTableProps<T>) {
  const t = useT()
  const dense = !!compact
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(() => Object.fromEntries((initialHidden ?? []).map((k) => [k, false])))
  const [sorting, setSorting] = useState<SortingState>(initialSort)
  const [globalFilter, setGlobalFilter] = useState('')
  const [facetValues, setFacetValues] = useState<Record<string, string>>(initialFacets)
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])

  const filtered = useMemo(() => {
    const q = globalFilter.trim().toLowerCase()
    return data.filter((row) => {
      for (const f of facets) {
        const v = facetValues[f.id]
        if (v && v !== '__all' && f.value(row) !== v) return false
      }
      if (!q) return true
      const text = (searchText ? searchText(row) : JSON.stringify(row)).toLowerCase()
      return q.split(/\s+/).every((t) => text.includes(t))
    })
  }, [data, facets, facetValues, globalFilter, searchText])

  const allColumns = useMemo<ColumnDef<T, any>[]>(() => {
    if (!selectable) return columns
    return [
      {
        id: '__select',
        header: ({ table }) => (
          <Checkbox checked={table.getIsAllPageRowsSelected() || (table.getIsSomePageRowsSelected() && 'indeterminate')} onCheckedChange={(v) => table.toggleAllPageRowsSelected(!!v)} aria-label="Select all" />
        ),
        cell: ({ row }) => <Checkbox checked={row.getIsSelected()} onCheckedChange={(v) => row.toggleSelected(!!v)} onClick={(e) => e.stopPropagation()} aria-label="Select row" />,
        enableSorting: false,
        size: 32,
      },
      ...columns,
    ]
  }, [columns, selectable])

  const table = useReactTable({
    data: filtered,
    columns: allColumns,
    state: { sorting, rowSelection, columnFilters, columnVisibility },
    onColumnVisibilityChange: setColumnVisibility,
    onSortingChange: setSorting,
    onRowSelectionChange: setRowSelection,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize } },
    enableRowSelection: !!selectable,
    // page resets are handled explicitly below so new data arrays can never trigger a render loop
    autoResetPageIndex: false,
  })

  // keep preset facets (e.g. from the URL) in sync when they change after mount
  const initialKey = JSON.stringify(initialFacets)
  const lastInitial = useRef(initialKey)
  useEffect(() => {
    if (lastInitial.current !== initialKey) {
      lastInitial.current = initialKey
      setFacetValues(initialFacets)
    }
  }, [initialKey, initialFacets])

  // back to page 1 whenever the result set changes size; never leave the user on an empty page
  const resultCount = filtered.length
  useEffect(() => {
    table.setPageIndex(0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resultCount])

  const selected = table.getSelectedRowModel().rows.map((r) => r.original)
  const exportCols = columns
    .filter((c) => typeof c.header === 'string' && ('accessorFn' in c || 'accessorKey' in c))
    .map((c) => ({
      header: c.header as string,
      value: (row: T) => {
        const v = 'accessorFn' in c && c.accessorFn ? c.accessorFn(row, 0) : (row as Record<string, unknown>)[(c as { accessorKey: string }).accessorKey]
        return v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : (v as string | number)
      },
    }))
  const sortedRows = table.getSortedRowModel().rows.map((r) => r.original)

  const facetOptions = (f: FacetFilter<T>) =>
    f.options ?? Array.from(new Set(data.map(f.value).filter(Boolean) as string[])).sort().map((v) => ({ value: v, label: t(v) }))
  const activeFacets = Object.values(facetValues).filter((v) => v && v !== '__all').length

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-64">
          <Search className="absolute top-1/2 start-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={globalFilter} onChange={(e) => { setGlobalFilter(e.target.value); table.setPageIndex(0) }} placeholder={t(searchPlaceholder)} className="h-9 ps-8" />
        </div>
        {facets.map((f) => (
          <Select key={f.id} value={facetValues[f.id] ?? '__all'} onValueChange={(v) => { setFacetValues((s) => ({ ...s, [f.id]: v })); table.setPageIndex(0) }}>
            <SelectTrigger size="sm" className={cn('h-9 w-auto min-w-32', facetValues[f.id] && facetValues[f.id] !== '__all' && 'border-brand-strong')}>
              <SelectValue placeholder={t(f.label)} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">{t('All')} · {t(f.label)}</SelectItem>
              {facetOptions(f).map((o) => (
                <SelectItem key={o.value} value={o.value}>{t(o.label)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        ))}
        {(activeFacets > 0 || globalFilter) && (
          <Button variant="ghost" size="sm" onClick={() => { setFacetValues({}); setGlobalFilter('') }}>
            <X /> {t('Clear')}
          </Button>
        )}
        <div className="ms-auto flex flex-wrap items-center gap-2">
          {toolbar}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-9"><Columns3 /> {t('Columns')}</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="max-h-80 overflow-y-auto">
              <DropdownMenuLabel>{t('Columns')}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {table.getAllLeafColumns().filter((c) => c.id !== '__select' && typeof c.columnDef.header === 'string' && c.columnDef.header).map((c) => (
                <DropdownMenuCheckboxItem key={c.id} checked={c.getIsVisible()} onCheckedChange={(v) => c.toggleVisibility(!!v)} onSelect={(e) => e.preventDefault()}>
                  {t(c.columnDef.header as string)}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          {exportName && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-9"><Download /> {t('Export')}</Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => exportCSV(sortedRows, exportCols, exportName)}><Download /> CSV ({sortedRows.length})</DropdownMenuItem>
                <DropdownMenuItem onClick={() => window.print()}><Download /> {t('Print')}</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      {selectable && selected.length > 0 && bulkActions && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-brand/40 bg-brand-soft px-3 py-2 text-sm">
          <span className="font-medium">{selected.length} {t('selected')}</span>
          {bulkActions(selected, () => setRowSelection({}))}
        </div>
      )}

      {/* phones: each row as a card */}
      <div className="space-y-2 md:hidden">
        {table.getRowModel().rows.length ? (
          table.getRowModel().rows.map((row) => {
            const cells = row.getVisibleCells().filter((c) => c.column.id !== '__select')
            const [first, ...rest] = cells
            const hasLabel = (c: (typeof cells)[number]) => typeof c.column.columnDef.header === 'string' && !!c.column.columnDef.header
            const labeled = rest.filter(hasLabel).slice(0, 6)
            const actions = rest.filter((c) => !hasLabel(c))
            return (
              <div
                key={row.id}
                onClick={() => onRowClick?.(row.original)}
                className={cn('rounded-xl border bg-card p-3.5 shadow-xs transition-colors', onRowClick && 'cursor-pointer active:bg-muted/60', row.getIsSelected() && 'border-brand-strong', rowClassName?.(row.original))}
              >
                <div className="flex items-start gap-2.5">
                  {selectable && <Checkbox className="mt-0.5" checked={row.getIsSelected()} onCheckedChange={(v) => row.toggleSelected(!!v)} onClick={(e) => e.stopPropagation()} aria-label="Select row" />}
                  <div className="min-w-0 flex-1 text-sm font-medium">{first && flexRender(first.column.columnDef.cell, first.getContext())}</div>
                  {onRowClick && <ChevronRight className="mt-0.5 size-4 shrink-0 text-muted-foreground" />}
                </div>
                {labeled.length > 0 && (
                  <dl className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-2 border-t pt-2.5">
                    {labeled.map((c) => (
                      <div key={c.id} className="min-w-0">
                        <dt className="truncate text-[10.5px] font-medium tracking-wide text-muted-foreground uppercase">{t(c.column.columnDef.header as string)}</dt>
                        <dd className="mt-0.5 min-w-0 truncate text-[13px] [&_*]:max-w-full">{flexRender(c.column.columnDef.cell, c.getContext())}</dd>
                      </div>
                    ))}
                  </dl>
                )}
                {actions.length > 0 && (
                  <div className="mt-2.5 flex flex-wrap items-center justify-end gap-2 border-t pt-2.5" onClick={(e) => e.stopPropagation()}>
                    {actions.map((c) => <div key={c.id}>{flexRender(c.column.columnDef.cell, c.getContext())}</div>)}
                  </div>
                )}
              </div>
            )
          })
        ) : (
          <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">{t(emptyText)}</div>
        )}
      </div>

      <div className="hidden overflow-hidden rounded-xl border bg-card md:block">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((hg) => (
                <TableRow key={hg.id} className="bg-muted/40 hover:bg-muted/40">
                  {hg.headers.map((h) => (
                    <TableHead key={h.id} className={cn('whitespace-nowrap', dense ? 'h-8' : 'h-10')} style={{ width: h.column.columnDef.size !== 150 ? h.column.columnDef.size : undefined }}>
                      {h.isPlaceholder ? null : h.column.getCanSort() ? (
                        <button className="inline-flex items-center gap-1 hover:text-foreground" onClick={h.column.getToggleSortingHandler()}>
                          {typeof h.column.columnDef.header === 'string' ? t(h.column.columnDef.header) : flexRender(h.column.columnDef.header, h.getContext())}
                          {h.column.getIsSorted() === 'asc' ? <ArrowUp className="size-3" /> : h.column.getIsSorted() === 'desc' ? <ArrowDown className="size-3" /> : <ArrowUpDown className="size-3 opacity-40" />}
                        </button>
                      ) : (
                        flexRender(h.column.columnDef.header, h.getContext())
                      )}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows.length ? (
                table.getRowModel().rows.map((row) => (
                  <TableRow
                    key={row.id}
                    data-state={row.getIsSelected() && 'selected'}
                    onClick={() => onRowClick?.(row.original)}
                    className={cn(onRowClick && 'cursor-pointer', rowClassName?.(row.original))}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id} className={dense ? 'py-1.5' : 'py-2.5'}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={allColumns.length} className="h-24 text-center text-muted-foreground">{t(emptyText)}</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
        <span>
          {filtered.length.toLocaleString('en')} {t('records')}
          {filtered.length !== data.length && ` / ${data.length.toLocaleString('en')}`}
        </span>
        {table.getPageCount() > 1 && (
          <div className="flex items-center gap-2">
            <span>{t('Page {page} of {pages}', { page: table.getState().pagination.pageIndex + 1, pages: table.getPageCount() })}</span>
            <Button variant="outline" size="icon-sm" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()} aria-label="Previous page"><ChevronLeft  /></Button>
            <Button variant="outline" size="icon-sm" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()} aria-label="Next page"><ChevronRight  /></Button>
          </div>
        )}
      </div>
    </div>
  )
}
