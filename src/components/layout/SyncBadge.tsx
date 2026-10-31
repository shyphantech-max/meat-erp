/** Cloud sync status (only shown when the app runs against the Catalyst backend). */
import { Cloud, CloudOff, Loader2, RefreshCw, TriangleAlert } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { useT } from '@/i18n'
import { isRemote } from '@/data/remote/config'
import { drain, resync, useSync } from '@/data/remote/sync'
import { fmtAgo } from '@/lib/format'
import { cn } from '@/lib/utils'

export function SyncBadge({ compact }: { compact?: boolean }) {
  const t = useT()
  const { status, queue, lastSyncAt, lastError } = useSync()
  if (!isRemote()) return null
  const pending = queue.length
  const meta = {
    idle: { icon: Cloud, label: 'Synced', cls: 'text-success' },
    syncing: { icon: Loader2, label: 'Syncing…', cls: 'text-info' },
    offline: { icon: CloudOff, label: 'Offline', cls: 'text-warning' },
    error: { icon: TriangleAlert, label: 'Sync problem', cls: 'text-danger' },
  }[status]
  const Icon = meta.icon
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className={cn('relative flex h-9 items-center gap-1.5 rounded-lg px-2 text-[12px] font-medium hover:bg-muted', meta.cls)} aria-label={t(meta.label)}>
          <Icon className={cn('size-[18px]', status === 'syncing' && 'animate-spin')} />
          {!compact && <span className="hidden xl:inline">{t(meta.label)}</span>}
          {pending > 0 && <span className="absolute -top-0.5 -end-0.5 rounded-full bg-warning px-1 text-[9.5px] leading-4 font-bold text-white">{pending}</span>}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 space-y-2 text-[12.5px]">
        <div className="font-semibold">{t('Cloud sync')}</div>
        <div className="text-muted-foreground">{t('Status')}: <span className={meta.cls}>{t(meta.label)}</span></div>
        <div className="text-muted-foreground">{t('Pending changes')}: <span className="font-semibold text-foreground">{pending}</span></div>
        <div className="text-muted-foreground">{t('Last sync')}: {lastSyncAt ? fmtAgo(lastSyncAt) : '-'}</div>
        {lastError && <div className="rounded-md bg-danger-soft px-2 py-1.5 text-danger">{lastError}</div>}
        <div className="flex gap-2 pt-1">
          <Button size="sm" variant="outline" className="flex-1" onClick={() => void drain()}><RefreshCw /> {t('Retry')}</Button>
          <Button size="sm" variant="outline" className="flex-1" disabled={pending > 0} onClick={() => void resync()}><Cloud /> {t('Reload data')}</Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
