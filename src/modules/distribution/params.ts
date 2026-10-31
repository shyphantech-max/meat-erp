import { useSearchParams } from 'react-router-dom'
import { todayKey } from '@/lib/format'

export type Tab = 'board' | 'loading' | 'routes' | 'vanstock'
/** shared URL state: ?tab=&driver=&date= */
export function useDistParams() {
  const [sp, setSp] = useSearchParams()
  const tab = (['board', 'loading', 'routes', 'vanstock'].includes(sp.get('tab') ?? '') ? sp.get('tab') : 'board') as Tab
  const date = sp.get('date') || todayKey()
  const driver = sp.get('driver') || ''
  const set = (p: Partial<{ tab: Tab; date: string; driver: string }>) => {
    const n = new URLSearchParams(sp)
    for (const [k, v] of Object.entries(p)) v ? n.set(k, v) : n.delete(k)
    setSp(n, { replace: true })
  }
  return { tab, date, driver, set }
}

