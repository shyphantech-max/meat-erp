import * as React from 'react'
import * as SheetPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

export const Sheet = SheetPrimitive.Root
export const SheetTrigger = SheetPrimitive.Trigger
export const SheetClose = SheetPrimitive.Close

export function SheetContent({ className, children, side = 'right', ...props }: React.ComponentProps<typeof SheetPrimitive.Content> & { side?: 'right' | 'left' | 'bottom' }) {
  return (
    <SheetPrimitive.Portal>
      <SheetPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
      <SheetPrimitive.Content
        aria-describedby={undefined}
        className={cn(
          'fixed z-50 flex flex-col gap-0 bg-card shadow-2xl transition ease-in-out data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:duration-200 data-[state=open]:duration-300',
          side === 'right' && 'top-[env(safe-area-inset-top)] bottom-0 right-0 w-full border-l data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right sm:max-w-xl',
          side === 'left' && 'top-[env(safe-area-inset-top)] bottom-0 start-0 w-72 border-e data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left',
          side === 'bottom' && 'inset-x-0 bottom-0 max-h-[88dvh] rounded-t-3xl border-t pb-[env(safe-area-inset-bottom)] data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom',
          className,
        )}
        {...props}
      >
        {children}
        {side !== 'bottom' && (
        <SheetPrimitive.Close className="absolute top-4 end-4 rounded-sm opacity-60 transition-opacity hover:opacity-100 cursor-pointer">
          <X className="size-4" />
          <span className="sr-only">Close</span>
        </SheetPrimitive.Close>
        )}
      </SheetPrimitive.Content>
    </SheetPrimitive.Portal>
  )
}
export function SheetHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('flex flex-col gap-1 border-b px-5 py-4 pe-12', className)} {...props} />
}
export function SheetTitle({ className, ...props }: React.ComponentProps<typeof SheetPrimitive.Title>) {
  return <SheetPrimitive.Title className={cn('font-heading text-base font-semibold', className)} {...props} />
}
export function SheetDescription({ className, ...props }: React.ComponentProps<typeof SheetPrimitive.Description>) {
  return <SheetPrimitive.Description className={cn('text-xs text-muted-foreground', className)} {...props} />
}
