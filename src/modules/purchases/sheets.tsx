/** Detail sheets for purchase orders and suppliers. */
import { Link } from 'react-router-dom'
import { Ban, CheckCircle2, ClipboardCheck, CreditCard, Pencil, Send, Ship, XCircle } from 'lucide-react'
import type { ID, PurchaseOrder } from '@/types'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Alert, MeterBar, Money, Stat, StatusBadge, Stepper, useAction, useConfirm } from '@/components/common'
import { useStore } from '@/store/useStore'
import { useT, useName } from '@/i18n'
import * as L from '@/store/logic'
import { poPayable } from '@/store/derive'
import { fmtDate, fmtDateTime, fmtKg, fmtNum, fmtSAR } from '@/lib/format'
import { fmtFx } from './dialogs'

export const PO_STEPS = ['Draft', 'Pending approval', 'Approved', 'Goods received', 'Fully received']
export const poStep = (po: PurchaseOrder) =>
  po.status === 'draft' ? 0 : po.status === 'pending_approval' || po.status === 'rejected' ? 1 : po.status === 'approved' ? 2 : po.status === 'partially_received' ? 3 : po.status === 'received' ? 4 : 1

export function PODetailSheet({ poId, onOpenChange, onEdit, onPay, onReject }: { poId: ID | null; onOpenChange: (o: boolean) => void; onEdit: (po: PurchaseOrder) => void; onPay: (po: PurchaseOrder) => void; onReject: (po: PurchaseOrder) => void }) {
  const t = useT()
  const name = useName()
  const act = useAction()
  const confirm = useConfirm()
  const db = useStore((s) => s.db)
  const po = db.purchaseOrders.find((p) => p.id === poId)
  const sup = po && db.suppliers.find((s) => s.id === po.supplierId)
  const wh = po && db.warehouses.find((w) => w.id === po.warehouseId)
  const shipment = po && db.shipments.find((s) => s.poId === po.id)
  const grns = po ? db.grns.filter((g) => g.poId === po.id) : []
  const pays = po ? db.supplierPayments.filter((p) => p.poId === po.id) : []
  const orderedKg = po?.lines.reduce((s, l) => s + l.qtyKg, 0) ?? 0
  const receivedKg = po?.lines.reduce((s, l) => s + l.receivedKg, 0) ?? 0
  return (
    <Sheet open={!!po} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto sm:max-w-2xl">
        {po && sup && (
          <>
            <SheetHeader>
              <div className="flex flex-wrap items-center gap-2">
                <SheetTitle>{po.poNo}</SheetTitle>
                <StatusBadge status={po.status} />
                <StatusBadge status={po.paymentStatus} />
                <StatusBadge status={po.kind === 'import' ? 'international' : 'local'} label={t(po.kind === 'import' ? 'Import' : 'Local purchase')} />
              </div>
              <SheetDescription>{sup.name} · {sup.country} · {name(wh)}</SheetDescription>
            </SheetHeader>
            <div className="space-y-5 p-5">
              <Stepper steps={PO_STEPS} current={poStep(po)} failed={po.status === 'rejected'} />
              {po.status === 'rejected' && <Alert tone="danger">{t('Rejected')}: {po.rejectReason}</Alert>}
              {po.status === 'cancelled' && <Alert tone="neutral">{t('This purchase order was cancelled.')}</Alert>}
              <div className="flex flex-wrap gap-2">
                {po.status === 'pending_approval' && (
                  <>
                    <Button size="sm" onClick={() => act((d, c) => L.setPOStatus(d, c, po.id, 'approve'), 'Purchase order approved')}><CheckCircle2 /> {t('Approve')}</Button>
                    <Button size="sm" variant="outline" onClick={() => onReject(po)}><XCircle /> {t('Reject')}</Button>
                  </>
                )}
                {(po.status === 'draft' || po.status === 'rejected') && (
                  <Button size="sm" onClick={() => act((d, c) => L.setPOStatus(d, c, po.id, 'submit'), 'Submitted for approval')}><Send /> {t('Submit for approval')}</Button>
                )}
                {['draft', 'pending_approval', 'rejected'].includes(po.status) && <Button size="sm" variant="outline" onClick={() => onEdit(po)}><Pencil /> {t('Edit')}</Button>}
                {['approved', 'partially_received', 'received'].includes(po.status) && po.paymentStatus !== 'paid' && (
                  <Button size="sm" variant="outline" onClick={() => onPay(po)}><CreditCard /> {t('Record payment')}</Button>
                )}
                {['approved', 'partially_received'].includes(po.status) && (
                  <Button size="sm" variant="outline" asChild><Link to={`/grn?po=${po.id}`}><ClipboardCheck /> {t('Receive goods (GRN)')}</Link></Button>
                )}
                {po.kind === 'import' && shipment && <Button size="sm" variant="outline" asChild><Link to={`/imports?id=${shipment.id}`}><Ship /> {shipment.ref}</Link></Button>}
                {po.kind === 'import' && !shipment && ['approved'].includes(po.status) && <Button size="sm" variant="outline" asChild><Link to={`/imports?new=${po.id}`}><Ship /> {t('Create shipment')}</Link></Button>}
                {['draft', 'pending_approval', 'approved', 'rejected'].includes(po.status) && receivedKg === 0 && po.paidSAR === 0 && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-danger"
                    onClick={async () => {
                      if (await confirm({ title: t('Cancel purchase order?'), description: `${po.poNo} · ${sup.name}`, confirmText: t('Cancel PO'), destructive: true }))
                        act((d, c) => L.setPOStatus(d, c, po.id, 'cancel'), 'Purchase order cancelled')
                    }}
                  >
                    <Ban /> {t('Cancel PO')}
                  </Button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Stat label="PO date" value={fmtDate(po.date)} />
                <Stat label="Expected" value={fmtDate(po.expectedDate)} />
                <Stat label="Total" value={fmtSAR(po.totalSAR)} />
                <Stat label="Balance due" value={fmtSAR(poPayable(po))} tone={poPayable(po) > 0 ? 'danger' : 'success'} />
              </div>
              <div>
                <div className="mb-1 flex justify-between text-[12px] text-muted-foreground">
                  <span>{t('Received')} {fmtKg(receivedKg, 0)} / {fmtKg(orderedKg, 0)}</span>
                  <span>{fmtNum(orderedKg ? (receivedKg / orderedKg) * 100 : 0)}%</span>
                </div>
                <MeterBar value={receivedKg} max={orderedKg} tone="brand" />
              </div>
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full text-[12.5px]">
                  <thead className="bg-muted/50 text-[11px] text-muted-foreground uppercase">
                    <tr>
                      <th className="px-3 py-2 text-start">{t('Product')}</th>
                      <th className="px-3 py-2 text-end">{t('Ordered')}</th>
                      <th className="px-3 py-2 text-end">{t('Received')}</th>
                      <th className="px-3 py-2 text-end">{t('Rate')}</th>
                      <th className="px-3 py-2 text-end">{t('Amount')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {po.lines.map((l) => {
                      const p = db.products.find((x) => x.id === l.productId)
                      return (
                        <tr key={l.productId} className="border-t">
                          <td className="px-3 py-2">
                            <div className="font-medium">{name(p)}</div>
                            <div className="text-[11px] text-muted-foreground">{fmtNum(l.cartons)} {t('cartons')}</div>
                          </td>
                          <td className="px-3 py-2 text-end tabular">{fmtKg(l.qtyKg, 0)}</td>
                          <td className="px-3 py-2 text-end tabular">{fmtKg(l.receivedKg, 0)}</td>
                          <td className="px-3 py-2 text-end tabular">{fmtFx(l.rate, po.currency)}</td>
                          <td className="px-3 py-2 text-end font-medium tabular">{fmtFx(l.qtyKg * l.rate, po.currency)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot className="border-t bg-muted/30 font-semibold">
                    <tr>
                      <td className="px-3 py-2" colSpan={4}>{t('Total')} {po.currency !== 'SAR' && `· FX ${po.fxRate}`}</td>
                      <td className="px-3 py-2 text-end tabular">{fmtFx(po.totalFx, po.currency)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              {po.notes && <p className="text-[12.5px] text-muted-foreground">{t('Notes')}: {po.notes}</p>}
              <Section title="Goods received notes">
                {grns.length === 0 ? <Empty text="No GRN yet" /> : grns.map((g) => (
                  <Row key={g.id} left={<Link className="font-medium hover:text-brand" to={`/grn?id=${g.id}`}>{g.grnNo}</Link>} mid={fmtDate(g.receivedDate)} right={<><span className="tabular">{fmtKg(g.lines.reduce((s, l) => s + l.acceptedKg, 0), 0)}</span> <StatusBadge status={g.status} /></>} />
                ))}
              </Section>
              <Section title="Supplier payments">
                {pays.length === 0 ? <Empty text="No payments recorded" /> : pays.map((p) => (
                  <Row key={p.id} left={<span className="font-medium">{p.refNo}</span>} mid={`${fmtDate(p.date)} · ${t(p.method === 'lc' ? 'Letter of credit' : p.method === 'bank' ? 'Bank transfer' : 'Cash')}${p.reference ? ` · ${p.reference}` : ''}`} right={<Money value={p.amountSAR} className="font-medium" />} />
                ))}
              </Section>
              <p className="text-[11.5px] text-muted-foreground">
                {t('Created')} {fmtDateTime(po.createdAt)}
                {po.approvedBy && ` · ${t('Approved by')} ${po.approvedBy} ${fmtDateTime(po.approvedAt)}`}
              </p>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}

export function SupplierSheet({ supplierId, onOpenChange, onEdit, onNewPO, onOpenPO }: { supplierId: ID | null; onOpenChange: (o: boolean) => void; onEdit: () => void; onNewPO: () => void; onOpenPO: (id: ID) => void }) {
  const t = useT()
  const db = useStore((s) => s.db)
  const s = db.suppliers.find((x) => x.id === supplierId)
  const pos = s ? db.purchaseOrders.filter((p) => p.supplierId === s.id).sort((a, b) => b.date.localeCompare(a.date)) : []
  const purchased = pos.filter((p) => ['approved', 'partially_received', 'received'].includes(p.status))
  const payable = purchased.reduce((x, p) => x + poPayable(p), 0)
  const paid = purchased.reduce((x, p) => x + p.paidSAR, 0)
  const kg = purchased.reduce((x, p) => x + p.lines.reduce((y, l) => y + l.receivedKg, 0), 0)
  return (
    <Sheet open={!!s} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto sm:max-w-2xl">
        {s && (
          <>
            <SheetHeader>
              <div className="flex flex-wrap items-center gap-2">
                <SheetTitle>{s.name}</SheetTitle>
                <StatusBadge status={s.type} label={t(s.type === 'local' ? 'Local' : 'International')} />
                {!s.active && <StatusBadge status="inactive" />}
              </div>
              <SheetDescription>{s.code} · {s.city}, {s.country}</SheetDescription>
            </SheetHeader>
            <div className="space-y-5 p-5">
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={onNewPO}>{t('New purchase order')}</Button>
                <Button size="sm" variant="outline" onClick={onEdit}><Pencil /> {t('Edit')}</Button>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Stat label="Purchased" value={fmtSAR(paid + payable, { compact: true })} />
                <Stat label="Paid" value={fmtSAR(paid, { compact: true })} tone="success" />
                <Stat label="Payable" value={fmtSAR(payable, { compact: true })} tone={payable > 0 ? 'danger' : undefined} />
                <Stat label="Received KG" value={fmtNum(kg)} />
              </div>
              <div className="grid gap-x-6 gap-y-2 rounded-lg border p-3 text-[13px] sm:grid-cols-2">
                <Info label="Contact person" value={s.contactPerson} />
                <Info label="Phone" value={<span dir="ltr">{s.phone}</span>} />
                <Info label="Email" value={s.email} />
                <Info label="Currency" value={s.currency} />
                <Info label="Payment terms" value={`${s.paymentTermsDays} ${t('days')}`} />
                <Info label="Products" value={s.products.map((p) => t(p === 'chicken' ? 'Chicken' : 'Mutton')).join(', ')} />
                <Info label="Rating" value={`★ ${fmtNum(s.rating, 1)} / 5`} />
              </div>
              <Section title="Purchase history">
                {pos.length === 0 ? <Empty text="No purchase orders yet" /> : pos.map((p) => (
                  <Row
                    key={p.id}
                    onClick={() => onOpenPO(p.id)}
                    left={<span className="font-medium">{p.poNo}</span>}
                    mid={`${fmtDate(p.date)} · ${p.lines.length} ${t('lines')} · ${fmtKg(p.lines.reduce((x, l) => x + l.qtyKg, 0), 0)}`}
                    right={<><Money value={p.totalSAR} /> <StatusBadge status={p.status} /> <StatusBadge status={p.paymentStatus} /></>}
                  />
                ))}
              </Section>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const t = useT()
  return (
    <div>
      <h4 className="mb-2 text-[12px] font-semibold tracking-wide text-muted-foreground uppercase">{t(title)}</h4>
      <div className="divide-y rounded-lg border">{children}</div>
    </div>
  )
}
function Row({ left, mid, right, onClick }: { left: React.ReactNode; mid?: React.ReactNode; right?: React.ReactNode; onClick?: () => void }) {
  return (
    <div onClick={onClick} className={`flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-[12.5px] ${onClick ? 'cursor-pointer hover:bg-muted/50' : ''}`}>
      <div className="min-w-24">{left}</div>
      <div className="flex-1 text-muted-foreground">{mid}</div>
      <div className="flex items-center gap-1.5">{right}</div>
    </div>
  )
}
function Empty({ text }: { text: string }) {
  const t = useT()
  return <p className="px-3 py-4 text-center text-[12px] text-muted-foreground">{t(text)}</p>
}
function Info({ label, value }: { label: string; value: React.ReactNode }) {
  const t = useT()
  return (
    <div className="flex justify-between gap-3">
      <span className="text-muted-foreground">{t(label)}</span>
      <span className="truncate text-end font-medium">{value}</span>
    </div>
  )
}
