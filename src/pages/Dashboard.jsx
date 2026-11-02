import { useMemo, useState } from 'react'
import {
  Boxes, ArrowDownToLine, ArrowUpFromLine, CircleDollarSign, Wallet, Receipt, AlertTriangle, PackagePlus, Coins, Landmark,
} from 'lucide-react'
import { useApp } from '../context.jsx'
import { Badge, EmptyState, PageHeader, StatCard } from '../components/ui.jsx'
import BarChart from '../components/BarChart.jsx'
import TransactionForm from '../forms/TransactionForm.jsx'
import ExpenseForm from '../forms/ExpenseForm.jsx'
import { monthlySeries, summarize } from '../lib/calc.js'
import {
  formatDate, formatKg, formatMoney, formatNumber, formatPercent, greeting, longToday, monthLabel, monthStart, monthEnd, todayISO,
} from '../lib/format.js'
import { navigate } from '../hooks/useHashRoute.js'

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`

export default function Dashboard() {
  const { data, derived, actions, notify, sync } = useApp()
  const [modal, setModal] = useState(null)
  const [months, setMonths] = useState(6)
  const { totals, ledger, cash } = derived
  const today = todayISO()
  const thisMonth = useMemo(() => summarize(data, ledger, { from: monthStart(today), to: monthEnd(today) }), [data, ledger, today])
  const series = useMemo(() => monthlySeries(data, ledger, months), [data, ledger, months])
  const empty = !data.purchases.length && !data.sales.length && !data.expenses.length

  const low = data.settings.lowStockKg
  const lowTypes = Object.entries(ledger.stock).filter(([type, s]) => s.kg < low && data.purchases.some((p) => p.type === type))
  const name = data.settings.ownerName

  const recent = useMemo(() => {
    const nameOf = (list, id) => list.find((p) => p.id === id)?.name
    const rows = [
      ...data.purchases.map((p) => ({ key: p.id, date: p.date, at: p.createdAt, icon: 'buy', title: `Bought ${formatKg(p.kg)} ${p.type}`, sub: nameOf(data.suppliers, p.partyId) || 'Walk-in', amount: -(p.kg * p.pricePerKg) })),
      ...data.sales.map((s) => ({ key: s.id, date: s.date, at: s.createdAt, icon: 'sell', title: `Sold ${formatKg(s.kg)} ${s.type}`, sub: nameOf(data.buyers, s.partyId) || 'Walk-in', amount: s.kg * s.pricePerKg })),
      ...data.expenses.map((e) => ({ key: e.id, date: e.date, at: e.createdAt, icon: 'exp', title: e.category, sub: e.description || 'Expense', amount: -e.amount })),
    ]
    return rows.sort((a, b) => (a.date === b.date ? b.at - a.at : a.date < b.date ? 1 : -1)).slice(0, 7)
  }, [data])

  const loadSample = async () => {
    const { generateSample } = await import('../lib/sample.js')
    const res = actions.replaceAll(generateSample())
    notify(res.ok ? 'Sample data loaded. Replace it any time in Settings.' : res.error, res.ok ? 'success' : 'error')
  }

  return (
    <>
      <PageHeader eyebrow={longToday()} title={`${greeting()}${name ? `, ${name}` : ''}`} subtitle="Track every kilogram from collection to sale.">
        <button className="primary-button" onClick={() => setModal('purchase')}><PackagePlus size={18} /> Record purchase</button>
      </PageHeader>

      {empty ? (
        <div className="panel welcome">
          <EmptyState icon={Boxes} title="Welcome to BottleDesk" text="Your books are empty. Record your first purchase to get started, or look around with sample data.">
            <div className="form-actions center">
              <button className="primary-button" onClick={() => setModal('purchase')}>Record first purchase</button>
              <button className="ghost-button" onClick={loadSample}>Load sample data</button>
            </div>
          </EmptyState>
        </div>
      ) : null}

      {!sync.auth && !empty ? (
        <div className="callout alert nudge">
          <span>Your records are only on this phone. <a href="#/settings">Sign in to back them up automatically</a> so nothing is lost if the phone is.</span>
        </div>
      ) : null}

      {lowTypes.length && !empty ? (
        <div className="callout bad alert">
          <AlertTriangle size={18} />
          <span>Low stock: {lowTypes.map(([t, s]) => `${t} (${formatKg(s.kg)})`).join(', ')}. Alert level is {formatKg(low)}.</span>
        </div>
      ) : null}

      <section className="stats-grid" aria-label="Business statistics">
        <StatCard tone="green" icon={Boxes} label="Current stock" value={formatNumber(ledger.totalKg)} unit="kg" note={`Worth ${formatMoney(ledger.totalValue)} at cost`} />
        <StatCard tone="orange" icon={ArrowDownToLine} label="Total bought" value={formatNumber(totals.boughtKg)} unit="kg" note={`${formatMoney(totals.boughtValue)} · ${plural(data.suppliers.length, 'supplier')}`} />
        <StatCard tone="blue" icon={ArrowUpFromLine} label="Total sold" value={formatNumber(totals.soldKg)} unit="kg" note={`${formatMoney(totals.revenue)} · ${plural(data.buyers.length, 'buyer')}`} />
        <StatCard tone="yellow" icon={CircleDollarSign} label="Net profit (all time)" value={formatMoney(totals.netProfit)} note={`${formatMoney(thisMonth.netProfit)} this month · ${formatPercent(totals.margin)} margin`} />
      </section>

      <section className="stats-grid second" aria-label="Money position">
        <StatCard tone="green" icon={Wallet} label="Cash on hand" value={formatMoney(cash.balance)} note="Opening cash + money in − money out" />
        <StatCard tone="blue" icon={Landmark} label="Buyers owe you" value={formatMoney(derived.receivables)} note={<a href="#/buyers">View buyers</a>} />
        <StatCard tone="orange" icon={Coins} label="You owe suppliers" value={formatMoney(derived.payables)} note={<a href="#/suppliers">View suppliers</a>} />
        <StatCard tone="yellow" icon={Receipt} label="Expenses (all time)" value={formatMoney(totals.expenseTotal)} note={`${formatMoney(thisMonth.expenseTotal)} this month`} />
      </section>

      <section className="lower-grid">
        <article className="panel">
          <div className="panel-heading">
            <div><p className="eyebrow">Cash flow</p><h4>Sales vs purchases</h4></div>
            <select value={months} onChange={(e) => setMonths(Number(e.target.value))} aria-label="Chart period">
              <option value={6}>Last 6 months</option>
              <option value={12}>Last 12 months</option>
            </select>
          </div>
          <BarChart data={series.map((m) => ({ label: monthLabel(m.key), a: m.revenue, b: m.purchases }))} />
        </article>

        <article className="panel">
          <div className="panel-heading"><div><p className="eyebrow">Shortcuts</p><h4>Quick actions</h4></div></div>
          <button className="action" onClick={() => setModal('purchase')}><ArrowDownToLine size={19} /><span><b>Buy bottles</b><small>Add incoming stock</small></span><strong>+</strong></button>
          <button className="action" onClick={() => setModal('sale')}><ArrowUpFromLine size={19} /><span><b>Sell bottles</b><small>Record outgoing stock</small></span><strong>+</strong></button>
          <button className="action" onClick={() => setModal('expense')}><Receipt size={19} /><span><b>Add expense</b><small>Log a business cost</small></span><strong>+</strong></button>
        </article>
      </section>

      <section className="lower-grid even">
        <article className="panel">
          <div className="panel-heading"><div><p className="eyebrow">Inventory</p><h4>Stock by bottle type</h4></div><a className="link" href="#/inventory">Open</a></div>
          <div className="type-bars">
            {Object.entries(ledger.stock).map(([type, s]) => (
              <div key={type} className="type-row">
                <div className="type-top"><span>{type}</span><b>{formatKg(s.kg)}</b></div>
                <div className="bar"><i style={{ width: `${ledger.totalKg > 0 ? (s.kg / ledger.totalKg) * 100 : 0}%` }} /></div>
              </div>
            ))}
          </div>
        </article>

        <article className="panel">
          <div className="panel-heading"><div><p className="eyebrow">Latest</p><h4>Recent activity</h4></div></div>
          {recent.length ? (
            <ul className="activity">
              {recent.map((r) => (
                <li key={r.key}>
                  <div><b>{r.title}</b><small>{formatDate(r.date)} · {r.sub}</small></div>
                  <span className={r.amount >= 0 ? 'pos' : 'neg'}>{r.amount >= 0 ? '+' : ''}{formatMoney(r.amount)}</span>
                </li>
              ))}
            </ul>
          ) : <p className="muted pad">Nothing recorded yet.</p>}
        </article>
      </section>

      {modal === 'purchase' || modal === 'sale' ? <TransactionForm kind={modal} onClose={() => setModal(null)} /> : null}
      {modal === 'expense' ? <ExpenseForm onClose={() => setModal(null)} /> : null}
    </>
  )
}
