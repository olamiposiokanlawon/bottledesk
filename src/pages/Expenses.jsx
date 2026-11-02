import { useMemo, useState } from 'react'
import { Pencil, Plus, Receipt, Trash2 } from 'lucide-react'
import { useApp } from '../context.jsx'
import { ConfirmDialog, EmptyState, PageHeader } from '../components/ui.jsx'
import ExpenseForm from '../forms/ExpenseForm.jsx'
import { EXPENSE_CATEGORIES } from '../lib/constants.js'
import { formatDate, formatMoney, monthKey, monthLabel, sum } from '../lib/format.js'

export default function Expenses() {
  const { data, actions, notify } = useApp()
  const [modal, setModal] = useState(null)
  const [month, setMonth] = useState('')
  const [cat, setCat] = useState('')

  const months = useMemo(() => [...new Set(data.expenses.map((e) => monthKey(e.date)))].sort().reverse(), [data.expenses])
  const rows = useMemo(
    () =>
      data.expenses
        .filter((e) => (!month || monthKey(e.date) === month) && (!cat || e.category === cat))
        .sort((a, b) => (a.date === b.date ? b.createdAt - a.createdAt : a.date < b.date ? 1 : -1)),
    [data.expenses, month, cat],
  )
  const total = sum(rows, (e) => e.amount)
  const byCat = EXPENSE_CATEGORIES.concat([...new Set(rows.map((r) => r.category))].filter((c) => !EXPENSE_CATEGORIES.includes(c)))
    .map((c) => ({ c, amount: sum(rows.filter((r) => r.category === c), (r) => r.amount) }))
    .filter((x) => x.amount > 0)
    .sort((a, b) => b.amount - a.amount)

  const remove = () => {
    const res = actions.deleteExpense(modal.del.id)
    notify(res.ok ? 'Expense deleted.' : res.error, res.ok ? 'success' : 'error')
    setModal(null)
  }

  return (
    <>
      <PageHeader eyebrow="Costs" title="Expenses" subtitle="Transport, labour, rent and other costs. They are taken off your gross profit.">
        <button className="primary-button" onClick={() => setModal({ form: true })}><Plus size={18} /> Add expense</button>
      </PageHeader>

      <div className="panel">
        <div className="filters">
          <select value={month} onChange={(e) => setMonth(e.target.value)} aria-label="Month">
            <option value="">All months</option>
            {months.map((m) => <option key={m} value={m}>{monthLabel(m, true)}</option>)}
          </select>
          <select value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Category">
            <option value="">All categories</option>
            {EXPENSE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </select>
          <div className="total-pill">Total: <b>{formatMoney(total)}</b></div>
        </div>

        {byCat.length ? (
          <div className="chips">{byCat.map((x) => <span key={x.c} className="chip static">{x.c}: <b>{formatMoney(x.amount)}</b></span>)}</div>
        ) : null}

        {rows.length ? (
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th>Date</th><th>Category</th><th>Description</th><th className="num">Amount</th><th /></tr></thead>
              <tbody>
                {rows.map((e) => (
                  <tr key={e.id}>
                    <td className="nowrap">{formatDate(e.date)}</td><td>{e.category}</td><td>{e.description}</td><td className="num strong">{formatMoney(e.amount)}</td>
                    <td className="row-actions">
                      <button className="icon-button" aria-label="Edit" onClick={() => setModal({ form: true, edit: e })}><Pencil size={16} /></button>
                      <button className="icon-button" aria-label="Delete" onClick={() => setModal({ del: e })}><Trash2 size={16} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr><td colSpan={3}>{rows.length} expenses</td><td className="num">{formatMoney(total)}</td><td /></tr></tfoot>
            </table>
          </div>
        ) : <EmptyState icon={Receipt} title={data.expenses.length ? 'No expenses match' : 'No expenses yet'} text={data.expenses.length ? 'Try a different month or category.' : 'Record transport, labour, rent and other costs here.'} />}
      </div>

      {modal?.form ? <ExpenseForm initial={modal.edit} onClose={() => setModal(null)} /> : null}
      {modal?.del ? <ConfirmDialog title="Delete this expense?" message={`${modal.del.category}: ${formatMoney(modal.del.amount)} on ${formatDate(modal.del.date)}. Your profit will go up by this amount.`} onConfirm={remove} onCancel={() => setModal(null)} /> : null}
    </>
  )
}
