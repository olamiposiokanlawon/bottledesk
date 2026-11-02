import { useMemo, useState } from 'react'
import { Download, Printer } from 'lucide-react'
import { useApp } from '../context.jsx'
import { PageHeader } from '../components/ui.jsx'
import { monthlySeries, summarize, txnTotal } from '../lib/calc.js'
import { toCSV, downloadFile } from '../lib/csv.js'
import {
  addMonths, formatDate, formatKg, formatMoney, formatPercent, monthEnd, monthLabel, monthStart, todayISO,
} from '../lib/format.js'

const PRESETS = [
  { id: 'month', label: 'This month' },
  { id: 'last', label: 'Last month' },
  { id: 'quarter', label: 'Last 3 months' },
  { id: 'year', label: 'This year' },
  { id: 'all', label: 'All time' },
  { id: 'custom', label: 'Custom dates' },
]

function rangeFor(preset, custom) {
  const today = todayISO()
  switch (preset) {
    case 'month': return { from: monthStart(today), to: monthEnd(today) }
    case 'last': { const s = addMonths(today, -1); return { from: s, to: monthEnd(s) } }
    case 'quarter': return { from: addMonths(today, -2), to: monthEnd(today) }
    case 'year': return { from: `${today.slice(0, 4)}-01-01`, to: `${today.slice(0, 4)}-12-31` }
    case 'custom': return { from: custom.from, to: custom.to }
    default: return {}
  }
}

export default function Reports() {
  const { data, derived } = useApp()
  const [preset, setPreset] = useState('month')
  const [custom, setCustom] = useState({ from: '', to: '' })
  const range = rangeFor(preset, custom)
  const s = useMemo(() => summarize(data, derived.ledger, range), [data, derived.ledger, range.from, range.to])
  const months = useMemo(() => monthlySeries(data, derived.ledger, 12).reverse(), [data, derived.ledger])
  const rangeText = range.from || range.to ? `${range.from ? formatDate(range.from) : 'the start'} to ${range.to ? formatDate(range.to) : 'today'}` : 'All time'

  const partyName = (list, id) => list.find((p) => p.id === id)?.name || 'Walk-in'
  const stamp = todayISO()

  const exportPurchases = () => downloadFile(`purchases-${stamp}.csv`, toCSV(
    [...data.purchases].sort((a, b) => (a.date < b.date ? -1 : 1)),
    [
      { label: 'Date', get: (r) => r.date }, { label: 'Supplier', get: (r) => partyName(data.suppliers, r.partyId) },
      { label: 'Type', get: (r) => r.type }, { label: 'Kg', get: (r) => r.kg }, { label: 'Price per kg', get: (r) => r.pricePerKg },
      { label: 'Total', get: (r) => txnTotal(r) }, { label: 'Paid at time of purchase', get: (r) => r.paid },
      { label: 'Balance after all payments', get: (r) => derived.txnInfo[r.id]?.balance ?? 0 }, { label: 'Note', get: (r) => r.note },
    ]))
  const exportSales = () => downloadFile(`sales-${stamp}.csv`, toCSV(
    [...data.sales].sort((a, b) => (a.date < b.date ? -1 : 1)),
    [
      { label: 'Date', get: (r) => r.date }, { label: 'Buyer', get: (r) => partyName(data.buyers, r.partyId) },
      { label: 'Type', get: (r) => r.type }, { label: 'Kg', get: (r) => r.kg }, { label: 'Price per kg', get: (r) => r.pricePerKg },
      { label: 'Total', get: (r) => txnTotal(r) }, { label: 'Cost of bottles sold', get: (r) => derived.ledger.saleCost[r.id] ?? 0 },
      { label: 'Profit', get: (r) => txnTotal(r) - (derived.ledger.saleCost[r.id] ?? 0) },
      { label: 'Received at time of sale', get: (r) => r.paid }, { label: 'Balance after all payments', get: (r) => derived.txnInfo[r.id]?.balance ?? 0 },
      { label: 'Note', get: (r) => r.note },
    ]))
  const exportExpenses = () => downloadFile(`expenses-${stamp}.csv`, toCSV(
    [...data.expenses].sort((a, b) => (a.date < b.date ? -1 : 1)),
    [{ label: 'Date', get: (r) => r.date }, { label: 'Category', get: (r) => r.category }, { label: 'Description', get: (r) => r.description }, { label: 'Amount', get: (r) => r.amount }],
  ))

  return (
    <>
      <PageHeader eyebrow="Profit & loss" title="Reports" subtitle="See what you made after the cost of the bottles you sold and your expenses.">
        <button className="ghost-button" onClick={() => window.print()}><Printer size={17} /> Print</button>
      </PageHeader>

      <div className="panel no-print">
        <div className="filters">
          <select value={preset} onChange={(e) => setPreset(e.target.value)} aria-label="Report period">
            {PRESETS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
          {preset === 'custom' ? (
            <>
              <label className="inline-date">From <input type="date" value={custom.from} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} /></label>
              <label className="inline-date">To <input type="date" value={custom.to} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} /></label>
            </>
          ) : null}
        </div>
      </div>

      <div className="lower-grid even spaced">
        <article className="panel">
          <div className="panel-heading"><div><p className="eyebrow">{rangeText}</p><h4>Profit & loss</h4></div></div>
          <dl className="pl">
            <div><dt>Sales ({s.saleCount})</dt><dd>{formatMoney(s.revenue)}</dd></div>
            <div><dt>Cost of bottles sold</dt><dd className="neg">− {formatMoney(s.cogs)}</dd></div>
            <div className="total"><dt>Gross profit</dt><dd>{formatMoney(s.grossProfit)}</dd></div>
            <div><dt>Expenses</dt><dd className="neg">− {formatMoney(s.expenseTotal)}</dd></div>
            <div><dt>Stock written off</dt><dd className="neg">− {formatMoney(s.writeOffCost)}</dd></div>
            <div className="total big"><dt>Net profit</dt><dd className={s.netProfit >= 0 ? 'pos' : 'neg'}>{formatMoney(s.netProfit)}</dd></div>
            <div><dt>Profit margin</dt><dd>{formatPercent(s.margin)}</dd></div>
          </dl>
          <p className="muted note">Profit uses your average buying cost, so bottles still in the store are not counted as a loss.</p>
        </article>

        <article className="panel">
          <div className="panel-heading"><div><p className="eyebrow">{rangeText}</p><h4>Volumes & prices</h4></div></div>
          <dl className="pl">
            <div><dt>Bought ({s.purchaseCount})</dt><dd>{formatKg(s.boughtKg)} · {formatMoney(s.boughtValue)}</dd></div>
            <div><dt>Sold ({s.saleCount})</dt><dd>{formatKg(s.soldKg)} · {formatMoney(s.revenue)}</dd></div>
            <div><dt>Average buying price</dt><dd>{formatMoney(s.avgBuyPrice)}/kg</dd></div>
            <div><dt>Average selling price</dt><dd>{formatMoney(s.avgSellPrice)}/kg</dd></div>
            <div><dt>Gross profit per kg sold</dt><dd>{formatMoney(s.grossPerKg)}/kg</dd></div>
            <div><dt>Written off</dt><dd>{formatKg(s.writeOffKg)}</dd></div>
          </dl>
          <h5>Expenses by category</h5>
          {s.expenseByCategory.length ? (
            <dl className="pl">{s.expenseByCategory.map((x) => <div key={x.category}><dt>{x.category}</dt><dd>{formatMoney(x.amount)}</dd></div>)}</dl>
          ) : <p className="muted">No expenses in this period.</p>}
        </article>
      </div>

      <div className="panel spaced">
        <div className="panel-heading"><div><p className="eyebrow">Last 12 months</p><h4>Month by month</h4></div></div>
        <div className="table-wrap">
          <table className="data">
            <thead><tr><th>Month</th><th className="num">Bought</th><th className="num">Sold</th><th className="num">Sales</th><th className="num">Gross profit</th><th className="num">Expenses</th><th className="num">Net profit</th></tr></thead>
            <tbody>
              {months.map((m) => (
                <tr key={m.key}>
                  <td>{monthLabel(m.key, true)}</td><td className="num">{formatKg(m.boughtKg)}</td><td className="num">{formatKg(m.soldKg)}</td>
                  <td className="num">{formatMoney(m.revenue)}</td><td className="num">{formatMoney(m.grossProfit)}</td><td className="num">{formatMoney(m.expenses)}</td>
                  <td className={`num strong ${m.netProfit >= 0 ? 'pos' : 'neg'}`}>{formatMoney(m.netProfit)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="panel spaced no-print">
        <div className="panel-heading"><div><p className="eyebrow">Spreadsheets</p><h4>Export to Excel (CSV)</h4></div></div>
        <div className="form-actions left">
          <button className="ghost-button" onClick={exportPurchases}><Download size={16} /> Purchases</button>
          <button className="ghost-button" onClick={exportSales}><Download size={16} /> Sales</button>
          <button className="ghost-button" onClick={exportExpenses}><Download size={16} /> Expenses</button>
        </div>
      </div>
    </>
  )
}
