/**
 * Printable documents shared across modules. Render inside <PrintDialog>.
 * They read from the store so they always show the current state of the record.
 */
import type { ID } from '@/types'
import { useStore } from '@/store/useStore'
import { useT, useName } from '@/i18n'
import { DocFooterNote, DocHeader } from '@/components/common'
import { fmtDate, fmtDateTime, fmtKg, fmtNum, fmtSAR } from '@/lib/format'
import { invoiceBalance } from '@/store/derive'
import { landedCost } from '@/store/logic'

const th = 'border-b border-[#d5dce6] bg-[#f1f4f8] px-2 py-1.5 text-start text-[11px] font-semibold uppercase tracking-wide text-[#5f6b7a]'
const td = 'border-b border-[#edf1f5] px-2 py-1.5'

function Parties({ left, right }: { left: { label: string; lines: (string | undefined)[] }; right?: { label: string; lines: (string | undefined)[] } }) {
  const t = useT()
  return (
    <div className="mb-5 grid grid-cols-2 gap-6 text-[12px]">
      {[left, right].filter(Boolean).map((b) => (
        <div key={b!.label}>
          <div className="mb-1 text-[10.5px] font-semibold tracking-wide text-[#5f6b7a] uppercase">{t(b!.label)}</div>
          {b!.lines.filter(Boolean).map((l, i) => (
            <div key={i} className={i === 0 ? 'font-semibold' : 'text-[#3d4856]'}>{l}</div>
          ))}
        </div>
      ))}
    </div>
  )
}

/** Simplified B2B tax invoice (demo - not a ZATCA e-invoice) */
export function InvoiceDoc({ invoiceId }: { invoiceId: ID }) {
  const t = useT()
  const name = useName()
  const db = useStore((s) => s.db)
  const inv = db.invoices.find((i) => i.id === invoiceId)
  if (!inv) return <p>{t('Invoice not found')}</p>
  const c = db.customers.find((x) => x.id === inv.customerId)!
  const driver = inv.driverId ? db.drivers.find((d) => d.id === inv.driverId) : undefined
  const dl = inv.deliveryId ? db.deliveries.find((d) => d.id === inv.deliveryId) : undefined
  return (
    <div>
      <DocHeader title="Tax Invoice" number={inv.invNo} date={fmtDate(inv.date)} extra={<div className="mt-1 text-[11px]">{t('فاتورة ضريبية')}</div>} />
      <Parties
        left={{ label: 'Bill to', lines: [name(c), c.address, `${t('VAT')} ${c.vatNo}`, c.phone] }}
        right={{ label: 'Invoice details', lines: [`${t('Payment')}: ${t(inv.paymentType === 'cash' ? 'Cash' : 'Credit')}`, `${t('Due date')}: ${fmtDate(inv.dueDate)}`, dl ? `${t('Delivery note')}: ${dl.deliveryNo}` : undefined, driver ? `${t('Driver')}: ${driver.name}` : undefined] }}
      />
      <table className="w-full border-collapse text-[12px]">
        <thead>
          <tr>
            <th className={th}>#</th>
            <th className={th}>{t('Product')}</th>
            <th className={`${th} text-end`}>{t('Qty (KG)')}</th>
            <th className={`${th} text-end`}>{t('Price / kg')}</th>
            <th className={`${th} text-end`}>{t('Amount')}</th>
            <th className={`${th} text-end`}>{t('VAT')} {inv.vatRate}%</th>
            <th className={`${th} text-end`}>{t('Total')}</th>
          </tr>
        </thead>
        <tbody>
          {inv.lines.map((l, i) => {
            const p = db.products.find((x) => x.id === l.productId)
            const amt = l.qtyKg * l.price
            return (
              <tr key={i}>
                <td className={td}>{i + 1}</td>
                <td className={td}>
                  <div className="font-medium">{name(p)}</div>
                  <div className="text-[10.5px] text-[#8a95a5]">{p?.code}</div>
                </td>
                <td className={`${td} text-end tabular`}>{fmtNum(l.qtyKg, 2)}</td>
                <td className={`${td} text-end tabular`}>{fmtNum(l.price, 2)}</td>
                <td className={`${td} text-end tabular`}>{fmtNum(amt, 2)}</td>
                <td className={`${td} text-end tabular`}>{fmtNum((amt * inv.vatRate) / 100, 2)}</td>
                <td className={`${td} text-end font-medium tabular`}>{fmtNum(amt * (1 + inv.vatRate / 100), 2)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <div className="mt-4 flex justify-between gap-6">
        <div />
        <div className="w-64 space-y-1 text-[12.5px]">
          <Line label={t('Subtotal (excl. VAT)')} value={fmtSAR(inv.subtotal)} />
          <Line label={`${t('VAT')} ${inv.vatRate}%`} value={fmtSAR(inv.vat)} />
          <Line label={t('Total (incl. VAT)')} value={fmtSAR(inv.total)} strong />
          {inv.returned > 0 && <Line label={t('Credit notes')} value={`- ${fmtSAR(inv.returned)}`} />}
          {inv.paid > 0 && <Line label={t('Paid')} value={`- ${fmtSAR(inv.paid)}`} />}
          <Line label={t('Balance due')} value={fmtSAR(invoiceBalance(inv))} strong />
        </div>
      </div>
      <div className="mt-10 grid grid-cols-2 gap-10 text-[11px] text-[#5f6b7a]">
        <div className="border-t pt-1">{t('Received by (name & signature)')}</div>
        <div className="border-t pt-1">{t('For')} {db.settings.companyName}</div>
      </div>
      <DocFooterNote />
    </div>
  )
}

export function ReceiptDoc({ paymentId }: { paymentId: ID }) {
  const t = useT()
  const name = useName()
  const db = useStore((s) => s.db)
  const p = db.payments.find((x) => x.id === paymentId)
  if (!p) return <p>{t('Payment not found')}</p>
  const c = db.customers.find((x) => x.id === p.customerId)!
  const driver = p.driverId ? db.drivers.find((d) => d.id === p.driverId) : undefined
  return (
    <div>
      <DocHeader title="Payment Receipt" number={p.receiptNo} date={fmtDateTime(p.createdAt)} extra={<div className="mt-1 text-[11px]">{t('سند قبض')}</div>} />
      <Parties
        left={{ label: 'Received from', lines: [name(c), c.address, c.phone] }}
        right={{ label: 'Payment', lines: [`${t('Method')}: ${t(p.method === 'cash' ? 'Cash' : 'Bank transfer')}`, p.bankRef ? `${t('Reference')}: ${p.bankRef}` : undefined, driver ? `${t('Collected by')}: ${driver.name}` : undefined, `${t('Status')}: ${t(p.verification)}`] }}
      />
      <div className="mb-4 rounded-lg bg-[#e8f5ec] p-4 text-center">
        <div className="text-[11px] tracking-wide text-[#03602f] uppercase">{t('Amount received')}</div>
        <div className="text-[26px] font-bold text-[#047a3f] tabular">{fmtSAR(p.amount)}</div>
      </div>
      <table className="w-full border-collapse text-[12px]">
        <thead>
          <tr>
            <th className={th}>{t('Invoice')}</th>
            <th className={th}>{t('Invoice date')}</th>
            <th className={`${th} text-end`}>{t('Invoice total')}</th>
            <th className={`${th} text-end`}>{t('Allocated')}</th>
            <th className={`${th} text-end`}>{t('Balance after')}</th>
          </tr>
        </thead>
        <tbody>
          {p.allocations.map((a) => {
            const inv = db.invoices.find((i) => i.id === a.invoiceId)
            return (
              <tr key={a.invoiceId}>
                <td className={td}>{inv?.invNo}</td>
                <td className={td}>{fmtDate(inv?.date)}</td>
                <td className={`${td} text-end tabular`}>{fmtSAR(inv?.total ?? 0)}</td>
                <td className={`${td} text-end font-medium tabular`}>{fmtSAR(a.amount)}</td>
                <td className={`${td} text-end tabular`}>{inv ? fmtSAR(invoiceBalance(inv)) : '-'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {p.notes && <p className="mt-3 text-[12px] text-[#5f6b7a]">{t('Notes')}: {p.notes}</p>}
      <div className="mt-10 grid grid-cols-2 gap-10 text-[11px] text-[#5f6b7a]">
        <div className="border-t pt-1">{t('Customer signature')}</div>
        <div className="border-t pt-1">{t('Received by')}</div>
      </div>
      <DocFooterNote />
    </div>
  )
}

export function LoadingSlipDoc({ loadId }: { loadId: ID }) {
  const t = useT()
  const name = useName()
  const db = useStore((s) => s.db)
  const l = db.vanLoads.find((x) => x.id === loadId)
  if (!l) return <p>{t('Loading slip not found')}</p>
  const d = db.drivers.find((x) => x.id === l.driverId)
  const v = db.vehicles.find((x) => x.id === l.vehicleId)
  const w = db.warehouses.find((x) => x.id === l.warehouseId)
  const total = l.lines.reduce((s, x) => s + x.qtyKg, 0)
  return (
    <div>
      <DocHeader title="Van Loading Slip" number={l.slipNo} date={fmtDateTime(l.createdAt)} />
      <Parties left={{ label: 'Driver & vehicle', lines: [name(d), d?.mobile, `${v?.plateNo} · ${v?.type}`] }} right={{ label: 'Loaded from', lines: [name(w), w?.address, `${t('Loaded by')}: ${l.loadedBy}`] }} />
      <table className="w-full border-collapse text-[12px]">
        <thead>
          <tr>
            <th className={th}>{t('Product')}</th>
            <th className={th}>{t('Batches (FEFO)')}</th>
            <th className={`${th} text-end`}>{t('Cartons')}</th>
            <th className={`${th} text-end`}>{t('Qty (KG)')}</th>
          </tr>
        </thead>
        <tbody>
          {l.lines.map((x) => {
            const p = db.products.find((pp) => pp.id === x.productId)
            return (
              <tr key={x.productId}>
                <td className={td}>{name(p)}</td>
                <td className={`${td} text-[11px]`}>{x.batches.map((b) => `${b.batchNo} (${fmtNum(b.qtyKg)} kg)`).join(', ')}</td>
                <td className={`${td} text-end tabular`}>{p ? fmtNum(x.qtyKg / p.cartonKg, 1) : '-'}</td>
                <td className={`${td} text-end font-medium tabular`}>{fmtNum(x.qtyKg, 1)}</td>
              </tr>
            )
          })}
          <tr>
            <td className={`${td} font-semibold`} colSpan={3}>{t('Total loaded')}</td>
            <td className={`${td} text-end font-semibold tabular`}>{fmtKg(total)}</td>
          </tr>
        </tbody>
      </table>
      <div className="mt-12 grid grid-cols-3 gap-8 text-[11px] text-[#5f6b7a]">
        <div className="border-t pt-1">{t('Store keeper')}</div>
        <div className="border-t pt-1">{t('Driver')}</div>
        <div className="border-t pt-1">{t('Security / gate')}</div>
      </div>
      <DocFooterNote>{t('Reefer temperature must be at or below -18°C for frozen and 0-4°C for chilled products before dispatch.')}</DocFooterNote>
    </div>
  )
}

export function SettlementDoc({ settlementId }: { settlementId: ID }) {
  const t = useT()
  const name = useName()
  const db = useStore((s) => s.db)
  const s = db.settlements.find((x) => x.id === settlementId)
  if (!s) return <p>{t('Settlement not found')}</p>
  const d = db.drivers.find((x) => x.id === s.driverId)
  const v = db.vehicles.find((x) => x.id === s.vehicleId)
  const money: [string, number, boolean?][] = [
    ['Total sales', s.totalSales], ['Cash sales', s.cashSales], ['Credit sales', s.creditSales], ['Cash collected', s.cashCollected], ['Bank transfers', s.bankTransfers],
    ['Collected against today’s sales', s.currentCollected], ['Old dues collected', s.oldDuesCollected], ['Expected cash', s.expectedCash, true], ['Cash handed over', s.cashHandedOver, true], [s.cashVariance < 0 ? 'Cash shortage' : 'Cash excess', s.cashVariance, true],
  ]
  return (
    <div>
      <DocHeader title="Daily Driver Settlement" number={s.settlementNo} date={fmtDate(s.date)} extra={<div className="mt-1 text-[11px] font-semibold uppercase">{t(s.status)}</div>} />
      <Parties left={{ label: 'Driver', lines: [name(d), d?.mobile, d?.code] }} right={{ label: 'Vehicle', lines: [v?.plateNo, v?.type, `${t('Deliveries')}: ${s.deliveriesDone}/${s.deliveriesTotal}`] }} />
      <div className="mb-2 text-[11px] font-semibold tracking-wide text-[#5f6b7a] uppercase">{t('Stock reconciliation (KG)')}</div>
      <table className="w-full border-collapse text-[11.5px]">
        <thead>
          <tr>
            {['Product', 'Opening', 'Loaded', 'Delivered / sold', 'Cust. returns', 'Returned to WH', 'Loss', 'Closing', 'Physical'].map((h, i) => (
              <th key={h} className={`${th} ${i ? 'text-end' : ''}`}>{t(h)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {s.rows.map((r) => (
            <tr key={r.productId}>
              <td className={td}>{name(db.products.find((p) => p.id === r.productId))}</td>
              {[r.opening, r.loaded, r.delivered, r.customerReturns, r.returnedToWH, r.loss, r.closing, r.physical].map((x, i) => (
                <td key={i} className={`${td} text-end tabular ${i === 7 && Math.abs(r.physical - r.closing) > 0.01 ? 'font-bold text-[#c2341f]' : ''}`}>{fmtNum(x, 1)}</td>
              ))}
            </tr>
          ))}
          <tr className="font-semibold">
            <td className={td}>{t('Total')}</td>
            {[s.openingKg, s.loadedKg, s.deliveredKg, s.customerReturnsKg, s.returnedKg, s.lossKg, s.closingKg, s.physicalKg].map((x, i) => (
              <td key={i} className={`${td} text-end tabular`}>{fmtNum(x, 1)}</td>
            ))}
          </tr>
        </tbody>
      </table>
      <p className="mt-1.5 text-[10.5px] text-[#5f6b7a]">{t('Opening + Loaded + Customer returns - Delivered/Sold - Returned to warehouse - Loss = Closing')}</p>
      <div className="mt-5 mb-2 text-[11px] font-semibold tracking-wide text-[#5f6b7a] uppercase">{t('Cash & collections (SAR)')}</div>
      <table className="w-full border-collapse text-[12px]">
        <tbody>
          {money.map(([l, v, strong]) => (
            <tr key={l}>
              <td className={`${td} ${strong ? 'font-semibold' : ''}`}>{t(l)}</td>
              <td className={`${td} text-end tabular ${strong ? 'font-semibold' : ''} ${l.startsWith('Cash shortage') ? 'text-[#c2341f]' : ''}`}>{fmtSAR(v)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {(s.driverNotes || s.supervisorRemarks) && (
        <div className="mt-4 space-y-1 text-[12px]">
          {s.driverNotes && <p><span className="font-semibold">{t('Driver notes')}:</span> {s.driverNotes}</p>}
          {s.supervisorRemarks && <p><span className="font-semibold">{t('Supervisor remarks')}:</span> {s.supervisorRemarks}</p>}
        </div>
      )}
      <div className="mt-4 text-[11px] text-[#5f6b7a]">
        {s.history.map((h, i) => (
          <div key={i}>{fmtDateTime(h.at)} - {t(h.status)} · {h.by}{h.note ? ` · ${h.note}` : ''}</div>
        ))}
      </div>
      <div className="mt-10 grid grid-cols-3 gap-8 text-[11px] text-[#5f6b7a]">
        <div className="border-t pt-1">{t('Driver')}</div>
        <div className="border-t pt-1">{t('Supervisor')}</div>
        <div className="border-t pt-1">{t('Accountant')}</div>
      </div>
      <DocFooterNote />
    </div>
  )
}

export function LandedCostDoc({ shipmentId }: { shipmentId: ID }) {
  const t = useT()
  const db = useStore((s) => s.db)
  const s = db.shipments.find((x) => x.id === shipmentId)
  if (!s) return null
  const lc = landedCost(s)
  return (
    <div className="text-[12px]">
      <div className="flex justify-between"><span>{t('Goods value')}</span><span className="tabular">{fmtSAR(s.goodsValueSAR)}</span></div>
      <div className="flex justify-between"><span>{t('Freight')}</span><span className="tabular">{fmtSAR(s.freightSAR)}</span></div>
      <div className="flex justify-between"><span>{t('Customs')}</span><span className="tabular">{fmtSAR(s.customsSAR)}</span></div>
      <div className="flex justify-between"><span>{t('Clearance')}</span><span className="tabular">{fmtSAR(s.clearanceSAR)}</span></div>
      <div className="flex justify-between font-semibold"><span>{t('Landed cost / kg')}</span><span className="tabular">{fmtSAR(lc.perKg)}</span></div>
    </div>
  )
}

function Line({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between gap-3 ${strong ? 'border-t border-[#d5dce6] pt-1 text-[13.5px] font-bold' : ''}`}>
      <span className={strong ? '' : 'text-[#5f6b7a]'}>{label}</span>
      <span className="tabular">{value}</span>
    </div>
  )
}
