/** Client-side CSV export. Files are generated in the browser; nothing is uploaded. */
export interface ExportColumn<T> {
  header: string
  value: (row: T) => string | number | undefined | null
}

export function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function exportCSV<T>(rows: T[], columns: ExportColumn<T>[], filename: string) {
  const esc = (v: unknown) => {
    const s = v == null ? '' : String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const lines = [columns.map((c) => esc(c.header)).join(','), ...rows.map((r) => columns.map((c) => esc(c.value(r))).join(','))]
  download(new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' }), filename.endsWith('.csv') ? filename : `${filename}.csv`)
}

/** quick CSV from plain objects (analytics tables) */
export function exportObjectsCSV(rows: Record<string, unknown>[], filename: string) {
  if (!rows.length) return
  const keys = Object.keys(rows[0])
  exportCSV(rows, keys.map((k) => ({ header: k, value: (r: Record<string, unknown>) => r[k] as string })), filename)
}
