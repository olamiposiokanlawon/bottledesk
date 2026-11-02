import { useMemo, useState } from 'react'
import { Boxes, MinusCircle, Trash2, Scale, AlertTriangle, CircleDollarSign } from 'lucide-react'
import { useApp } from '../context.jsx'
import { Badge, ConfirmDialog, EmptyState, PageHeader, StatCard } from '../components/ui.jsx'
import AdjustmentForm from '../forms/AdjustmentForm.jsx'
import { formatDate, formatKg, formatMoney, formatNumber, sum } from '../lib/format.js'

const KIND_LABEL = { purchase: 'Purchase', sale: 'Sale', adjustment: 'Write-off' }

export default function Inventory() {
  const { data, derived, actions, notify } = useApp()
  const { ledger } = derived
  const [modal, setModal] = useState(null)
  const [showAll, setShowAll] = useState(false)
  const low = data.settings.lowStockKg

  const rows = Object.entries(ledger.stock).map(([type, s]) => ({
    type, ...s,
    bought: sum(data.purchases.filter((p) => p.type === type), (p) => p.kg),
    sold: sum(data.sales.filter((p) => p.type === type), (p) => p.kg),
    wasted: sum(data.adjustments.filter((p) => p.type === type), (p) => p.kg),
  }))
  const lowCount = rows.filter((r) => r.kg < low).length

  const movements = useMemo(() => [...ledger.movements].reverse(), [ledger.movements])
  const shown = showAll ? movements : movements.slice(0, 15)
  const partyName = (m) => {
    if (m.kind === 'adjustment') return m.reason || ''
    const list = m.kind === 'purchase' ? data.suppliers : data.buyers
    return list.find((p) => p.id === m.partyId)?.name || 'Walk-in'
  }

  const removeAdjustment = () => {
    const res = actions.deleteAdjustment(modal.del.id)
    notify(res.ok ? 'Write-off deleted. The stock is back.' : res.error, res.ok ? 'success' : 'error')
    setModal(null)
  }

  return (
    <>
      <PageHeader eyebrow="Stock" title="Inventory" subtitle="What you have in the store right now, worked out from every purchase, sale and write-off.">
        <button className="ghost-button" onClick={() => setModal({ add: true })}><MinusCircle size={18} /> Write off stock</button>
      </PageHeader>

      <section className="stats-grid three">
        <StatCard tone="green" icon={Scale} label="Total in stock" value={formatNumber(ledger.totalKg)} unit="kg" note={`${rows.length} bottle types`} />
        <StatCard tone="yellow" icon={CircleDollarSign} label="Stock value (at cost)" value={formatMoney(ledger.totalValue)} note="What the bottles in store cost you" />
        <StatCard tone={lowCount ? 'orange' : 'blue'} icon={AlertTriangle} label="Low-stock types" value={String(lowCount)} note={`Alert below ${formatKg(low)} (change in Settings)`} />
      </section>

      <div className="panel">
        <div className="panel-heading"><div><p className="eyebrow">By type</p><h4>Stock levels</h4></div></div>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr><th>Bottle type</th><th className="num">In stock</th><th className="num">Avg cost/kg</th><th className="num">Value</th><th className="num">Bought</th><th className="num">Sold</th><th className="num">Written off</th><th>Level</th></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.type}>
                  <td className="strong">{r.type}</td>
                  <td className="num strong">{formatKg(r.kg)}</td>
                  <td className="num">{formatMoney(r.avgCost)}</td>
                  <td className="num">{formatMoney(r.value)}</td>
                  <td className="num">{formatKg(r.bought)}</td>
                  <td className="num">{formatKg(r.sold)}</td>
                  <td className="num">{formatKg(r.wasted)}</td>
                  <td>{r.kg <= 0 ? <Badge tone="red">Empty</Badge> : r.kg < low ? <Badge tone="amber">Low</Badge> : <Badge tone="green">OK</Badge>}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr><td>Total</td><td className="num">{formatKg(ledger.totalKg)}</td><td /><td className="num">{formatMoney(ledger.totalValue)}</td>
                <td className="num">{formatKg(sum(rows, (r) => r.bought))}</td><td className="num">{formatKg(sum(rows, (r) => r.sold))}</td><td className="num">{formatKg(sum(rows, (r) => r.wasted))}</td><td /></tr>
            </tfoot>
          </table>
        </div>
      </div>

      <div className="panel spaced">
        <div className="panel-heading"><div><p className="eyebrow">History</p><h4>Stock movements</h4></div></div>
        {movements.length ? (
          <>
            <div className="table-wrap">
              <table className="data">
                <thead><tr><th>Date</th><th>Event</th><th>Type</th><th>Detail</th><th className="num">Change</th><th className="num">Total in stock</th><th /></tr></thead>
                <tbody>
                  {shown.map((m) => (
                    <tr key={m.kind + m.id}>
                      <td className="nowrap">{formatDate(m.date)}</td>
                      <td><Badge tone={m.kind === 'purchase' ? 'green' : m.kind === 'sale' ? 'blue' : 'red'}>{KIND_LABEL[m.kind]}</Badge></td>
                      <td>{m.type}</td>
                      <td>{partyName(m)}</td>
                      <td className={`num ${m.kgChange >= 0 ? 'pos' : 'neg'}`}>{m.kgChange >= 0 ? '+' : ''}{formatKg(m.kgChange)}</td>
                      <td className="num">{formatKg(m.running)}</td>
                      <td className="row-actions">
                        {m.kind === 'adjustment' ? (
                          <button className="icon-button" aria-label="Delete write-off" onClick={() => setModal({ del: data.adjustments.find((a) => a.id === m.id) })}><Trash2 size={16} /></button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {movements.length > 15 ? (
              <button className="ghost-button small centered" onClick={() => setShowAll((s) => !s)}>{showAll ? 'Show fewer' : `Show all ${movements.length}`}</button>
            ) : null}
          </>
        ) : <EmptyState icon={Boxes} title="No stock movements yet" text="Purchases, sales and write-offs will appear here." />}
      </div>

      {modal?.add ? <AdjustmentForm onClose={() => setModal(null)} /> : null}
      {modal?.del ? (
        <ConfirmDialog title="Delete this write-off?" message={`${formatKg(modal.del.kg)} of ${modal.del.type} (${modal.del.reason}) will go back into stock.`} onConfirm={removeAdjustment} onCancel={() => setModal(null)} />
      ) : null}
    </>
  )
}
