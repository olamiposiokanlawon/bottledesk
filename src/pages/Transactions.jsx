import { useMemo, useState } from 'react'
import { ArrowDownToLine, ArrowUpFromLine, Pencil, Plus, Trash2 } from 'lucide-react'
import { useApp } from '../context.jsx'
import { ConfirmDialog, EmptyState, PageHeader, StatusBadge } from '../components/ui.jsx'
import TransactionForm from '../forms/TransactionForm.jsx'
import { txnTotal } from '../lib/calc.js'
import { formatDate, formatKg, formatMoney, round2, sum } from '../lib/format.js'

export default function Transactions({ kind }) {
  const { data, derived, actions, notify } = useApp()
  const isBuy = kind === 'purchase'
  const list = isBuy ? data.purchases : data.sales
  const parties = isBuy ? data.suppliers : data.buyers
  const [modal, setModal] = useState(null) // { edit?: txn } | { del: txn }
  const [f, setF] = useState({ q: '', type: '', status: '', from: '', to: '' })
  const setFilter = (p) => setF((o) => ({ ...o, ...p }))

  const nameOf = (id) => parties.find((p) => p.id === id)?.name || 'Walk-in'

  const rows = useMemo(() => {
    const q = f.q.trim().toLowerCase()
    return list
      .filter((t) => (!f.type || t.type === f.type) && (!f.from || t.date >= f.from) && (!f.to || t.date <= f.to))
      .filter((t) => !f.status || derived.txnInfo[t.id]?.status === f.status)
      .filter((t) => !q || nameOf(t.partyId).toLowerCase().includes(q) || (t.note || '').toLowerCase().includes(q))
      .sort((a, b) => (a.date === b.date ? b.createdAt - a.createdAt : a.date < b.date ? 1 : -1))
  }, [list, f, derived.txnInfo, parties])

  const totalKg = sum(rows, (t) => t.kg)
  const totalValue = sum(rows, txnTotal)
  const totalBalance = sum(rows, (t) => derived.txnInfo[t.id]?.balance || 0)
  const totalProfit = sum(rows, (t) => txnTotal(t) - (derived.ledger.saleCost[t.id] || 0))
  const filtered = f.q || f.type || f.status || f.from || f.to

  const remove = () => {
    const res = actions.deleteTransaction(kind, modal.del.id)
    if (res.ok) notify(`${isBuy ? 'Purchase' : 'Sale'} deleted.`)
    else notify(res.error, 'error')
    setModal(null)
  }

  return (
    <>
      <PageHeader
        eyebrow={isBuy ? 'Incoming stock' : 'Outgoing stock'}
        title={isBuy ? 'Buy bottles' : 'Sell bottles'}
        subtitle={isBuy ? `Record purchases from suppliers. The usual price is ₦${data.settings.defaultBuyPrice}/kg.` : 'Record sales to buyers at your own price per kg.'}
      >
        <button className="primary-button" onClick={() => setModal({})}><Plus size={18} /> {isBuy ? 'Record purchase' : 'Record sale'}</button>
      </PageHeader>

      <div className="panel">
        <div className="filters">
          <input type="search" placeholder={`Search ${isBuy ? 'supplier' : 'buyer'} or note`} value={f.q} onChange={(e) => setFilter({ q: e.target.value })} aria-label="Search" />
          <select value={f.type} onChange={(e) => setFilter({ type: e.target.value })} aria-label="Bottle type">
            <option value="">All types</option>
            {data.settings.bottleTypes.map((t) => <option key={t}>{t}</option>)}
          </select>
          <select value={f.status} onChange={(e) => setFilter({ status: e.target.value })} aria-label="Payment status">
            <option value="">Any payment status</option>
            <option value="paid">Paid</option>
            <option value="partial">Part paid</option>
            <option value="unpaid">Unpaid</option>
          </select>
          <label className="inline-date">From <input type="date" value={f.from} onChange={(e) => setFilter({ from: e.target.value })} /></label>
          <label className="inline-date">To <input type="date" value={f.to} onChange={(e) => setFilter({ to: e.target.value })} /></label>
          {filtered ? <button className="ghost-button small" onClick={() => setF({ q: '', type: '', status: '', from: '', to: '' })}>Clear</button> : null}
        </div>

        {rows.length ? (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Date</th><th>{isBuy ? 'Supplier' : 'Buyer'}</th><th>Type</th>
                  <th className="num">Weight</th><th className="num">₦/kg</th><th className="num">Total</th>
                  <th className="num">{isBuy ? 'Paid' : 'Received'}</th>
                  {!isBuy ? <th className="num">Profit</th> : null}
                  <th>Status</th><th />
                </tr>
              </thead>
              <tbody>
                {rows.map((t) => {
                  const info = derived.txnInfo[t.id] || { paid: 0, status: 'unpaid', balance: 0 }
                  const profit = round2(txnTotal(t) - (derived.ledger.saleCost[t.id] || 0))
                  return (
                    <tr key={t.id}>
                      <td className="nowrap">{formatDate(t.date)}</td>
                      <td>{nameOf(t.partyId)}{t.note ? <small className="sub">{t.note}</small> : null}</td>
                      <td>{t.type}</td>
                      <td className="num">{formatKg(t.kg)}</td>
                      <td className="num">{formatMoney(t.pricePerKg)}</td>
                      <td className="num strong">{formatMoney(txnTotal(t))}</td>
                      <td className="num">{formatMoney(info.paid)}{info.balance > 0 ? <small className="sub neg">{formatMoney(info.balance)} owing</small> : null}</td>
                      {!isBuy ? <td className={`num ${profit >= 0 ? 'pos' : 'neg'}`}>{formatMoney(profit)}</td> : null}
                      <td><StatusBadge status={info.status} /></td>
                      <td className="row-actions">
                        <button className="icon-button" aria-label="Edit" onClick={() => setModal({ edit: t })}><Pencil size={16} /></button>
                        <button className="icon-button" aria-label="Delete" onClick={() => setModal({ del: t })}><Trash2 size={16} /></button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={3}>{rows.length} {rows.length === 1 ? 'record' : 'records'}{filtered ? ' (filtered)' : ''}</td>
                  <td className="num">{formatKg(totalKg)}</td><td />
                  <td className="num">{formatMoney(totalValue)}</td>
                  <td className="num">{totalBalance > 0 ? `${formatMoney(totalBalance)} owing` : ''}</td>
                  {!isBuy ? <td className={`num ${totalProfit >= 0 ? 'pos' : 'neg'}`}>{formatMoney(totalProfit)}</td> : null}
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        ) : (
          <EmptyState
            icon={isBuy ? ArrowDownToLine : ArrowUpFromLine}
            title={list.length ? 'No records match your filters' : isBuy ? 'No purchases yet' : 'No sales yet'}
            text={list.length ? 'Try clearing the filters.' : isBuy ? 'Record bottles you buy from suppliers and they will appear here.' : 'Record bottles you sell and your profit will be worked out for you.'}
          />
        )}
      </div>

      {modal && !modal.del ? <TransactionForm kind={kind} initial={modal.edit} onClose={() => setModal(null)} /> : null}
      {modal?.del ? (
        <ConfirmDialog
          title={`Delete this ${isBuy ? 'purchase' : 'sale'}?`}
          message={`${formatDate(modal.del.date)} · ${formatKg(modal.del.kg)} ${modal.del.type} · ${formatMoney(txnTotal(modal.del))}. This also changes your stock and profit.`}
          onConfirm={remove}
          onCancel={() => setModal(null)}
        />
      ) : null}
    </>
  )
}
