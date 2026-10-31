import { useEffect, useState } from 'react'
import type { BusinessType, Customer, ID } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Switch } from '@/components/ui/switch'
import { Field, NumInput, Picker, useAction } from '@/components/common'
import { useStore } from '@/store/useStore'
import { useT, useName } from '@/i18n'
import * as L from '@/store/logic'

export const BUSINESS_TYPES: { value: BusinessType; label: string }[] = [
  { value: 'restaurant', label: 'Restaurant' },
  { value: 'hotel', label: 'Hotel' },
  { value: 'supermarket', label: 'Supermarket' },
  { value: 'wholesale', label: 'Wholesale' },
  { value: 'catering', label: 'Catering' },
]
export const CITIES = ['Riyadh', 'Jeddah', 'Dammam', 'Al Khobar', 'Makkah', 'Madinah', 'Buraydah']

type Form = Omit<Customer, 'id'> & { id?: ID }
const empty = (code: string): Form => ({
  code, name: '', nameAr: '', businessType: 'restaurant', contactPerson: '', phone: '+966 5', email: '', city: 'Riyadh', district: '', address: '', vatNo: '',
  driverId: undefined, creditLimit: 30000, paymentTermsDays: 15, defaultPayment: 'credit', prices: {}, active: true,
})

export function CustomerDialog({ open, onOpenChange, customer, onSaved }: { open: boolean; onOpenChange: (o: boolean) => void; customer?: Customer | null; onSaved?: (id: ID) => void }) {
  const t = useT()
  const name = useName()
  const act = useAction()
  const db = useStore((s) => s.db)
  const [f, setF] = useState<Form>(empty(''))
  const [err, setErr] = useState<Record<string, string>>({})
  useEffect(() => {
    if (!open) return
    setF(customer ? { ...customer } : empty(`CUS-${String(db.customers.length + 1).padStart(3, '0')}`))
    setErr({})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, customer])
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((x) => ({ ...x, [k]: v }))
  const submit = () => {
    const e: Record<string, string> = {}
    if (!f.name.trim()) e.name = 'Customer name is required'
    else if (db.customers.some((c) => c.name.trim().toLowerCase() === f.name.trim().toLowerCase() && c.id !== f.id)) e.name = 'A customer with this name already exists'
    if (!f.contactPerson.trim()) e.contactPerson = 'Contact person is required'
    if (!/^\+?[0-9\s]{9,16}$/.test(f.phone.trim())) e.phone = 'Enter a valid phone number, e.g. +966 55 123 4567'
    if (f.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email)) e.email = 'Enter a valid email'
    if (f.vatNo && !/^3\d{14}$/.test(f.vatNo.replace(/\s/g, ''))) e.vatNo = 'Saudi VAT number is 15 digits starting with 3'
    if (f.creditLimit < 0) e.creditLimit = 'Cannot be negative'
    if (f.paymentTermsDays < 0) e.paymentTermsDays = 'Cannot be negative'
    setErr(e)
    if (Object.keys(e).length) return
    const r = act((d, ctx) => L.upsertMaster<Customer>(d, ctx, 'customers', { ...f, address: f.address || `${f.district} District, ${f.city}` }, 'cus'), customer ? 'Customer updated' : 'Customer created')
    if (r.ok) {
      onOpenChange(false)
      if (r.id) onSaved?.(r.id)
    }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t(customer ? 'Edit customer' : 'New B2B customer')}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Customer name" required error={err.name}>
            <Input value={f.name} onChange={(e) => set('name', e.target.value)} placeholder="Al Diwan Grill Restaurant" />
          </Field>
          <Field label="Name (Arabic)">
            <Input dir="rtl" value={f.nameAr} onChange={(e) => set('nameAr', e.target.value)} />
          </Field>
          <Field label="Business type" required>
            <Picker<BusinessType> value={f.businessType} onChange={(v) => set('businessType', v)} options={BUSINESS_TYPES} />
          </Field>
          <Field label="Customer code">
            <Input value={f.code} onChange={(e) => set('code', e.target.value)} />
          </Field>
          <Field label="Contact person" required error={err.contactPerson}>
            <Input value={f.contactPerson} onChange={(e) => set('contactPerson', e.target.value)} />
          </Field>
          <Field label="Phone" required error={err.phone}>
            <Input value={f.phone} onChange={(e) => set('phone', e.target.value)} inputMode="tel" />
          </Field>
          <Field label="Email" error={err.email}>
            <Input value={f.email} onChange={(e) => set('email', e.target.value)} type="email" />
          </Field>
          <Field label="VAT number" error={err.vatNo}>
            <Input value={f.vatNo} onChange={(e) => set('vatNo', e.target.value)} placeholder="3XXXXXXXXXXXXX3" />
          </Field>
          <Field label="City" required>
            <Picker value={f.city} onChange={(v) => set('city', v)} options={CITIES.map((c) => ({ value: c, label: c }))} />
          </Field>
          <Field label="District">
            <Input value={f.district} onChange={(e) => set('district', e.target.value)} placeholder="Al Olaya" />
          </Field>
          <Field label="Address" className="sm:col-span-2">
            <Input value={f.address} onChange={(e) => set('address', e.target.value)} />
          </Field>
          <Field label="Assigned driver">
            <Picker value={f.driverId ?? 'none'} onChange={(v) => set('driverId', v === 'none' ? undefined : v)} options={[{ value: 'none', label: t('Unassigned') }, ...db.drivers.map((d) => ({ value: d.id, label: name(d) }))]} />
          </Field>
          <Field label="Default payment">
            <Picker value={f.defaultPayment} onChange={(v) => set('defaultPayment', v)} options={[{ value: 'credit', label: 'Credit' }, { value: 'cash', label: 'Cash' }]} />
          </Field>
          <Field label="Credit limit (SAR)" error={err.creditLimit}>
            <NumInput value={f.creditLimit} onChange={(v) => set('creditLimit', v)} />
          </Field>
          <Field label="Payment terms (days)" error={err.paymentTermsDays}>
            <NumInput value={f.paymentTermsDays} onChange={(v) => set('paymentTermsDays', v)} />
          </Field>
          <label className="flex items-center gap-2 text-[13px] sm:col-span-2">
            <Switch checked={f.active} onCheckedChange={(v) => set('active', v)} /> {t('Active customer')}
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t('Cancel')}</Button>
          <Button onClick={submit}>{t('Save')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
