/** Promise-based confirmation dialog: `const confirm = useConfirm(); if (await confirm({...})) ...` */
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { cn } from '@/lib/utils'
import { buttonVariants } from '@/components/ui/button'
import { useT } from '@/i18n'

export interface ConfirmOptions {
  title: string
  description?: string
  confirmText?: string
  destructive?: boolean
}
const Ctx = createContext<(o: ConfirmOptions) => Promise<boolean>>(async () => false)

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const t = useT()
  const [opts, setOpts] = useState<ConfirmOptions | null>(null)
  const resolver = useRef<(v: boolean) => void>(undefined)
  const confirm = useCallback((o: ConfirmOptions) => {
    setOpts(o)
    return new Promise<boolean>((res) => (resolver.current = res))
  }, [])
  const close = (v: boolean) => {
    resolver.current?.(v)
    setOpts(null)
  }
  return (
    <Ctx.Provider value={confirm}>
      {children}
      <AlertDialog open={!!opts} onOpenChange={(o) => !o && close(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{opts?.title ?? t('Are you sure?')}</AlertDialogTitle>
            <AlertDialogDescription>{opts?.description ?? t('This action cannot be undone.')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => close(false)}>{t('Cancel')}</AlertDialogCancel>
            <AlertDialogAction className={cn(opts?.destructive && buttonVariants({ variant: 'destructive' }))} onClick={() => close(true)}>
              {opts?.confirmText ?? t('Confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Ctx.Provider>
  )
}
export const useConfirm = () => useContext(Ctx)
