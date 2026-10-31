/** Stable key of a record in any DB collection (most use `id`; roles use `key`; archive uses `month`). */
export function rowKey(coll: string, r: Record<string, unknown>): string {
  if (typeof r.id === 'string' && r.id) return r.id
  if (coll === 'roles') return `role:${String(r.key)}`
  if (coll === 'archive') return `archive:${String(r.month)}`
  return `${coll}:${JSON.stringify(r).slice(0, 80)}`
}
