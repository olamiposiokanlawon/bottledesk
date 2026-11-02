import { useState } from 'react'
import { Modal, Field, FormError } from '../components/ui.jsx'
import { useApp } from '../context.jsx'
import { EXPENSE_CATEGORIES } from '../lib/constants.js'
import { formatMoney, isValidISO, parseNumber, todayISO } from '../lib/format.js'

export default function ExpenseForm({ initial, onClose }) {
  const { actions, notify } = useApp()
  const [v, setV] = useState(() =>
    initial
      ? { date: initial.date, category: initial.category, description: initial.description, amount: String(initial.amount) }
      : { date: todayISO(), category: EXPENSE_CATEGORIES[0], description: '', amount: '' },
  )
  const [error, setError] = useState('')
  const set = (p) => setV((o) => ({ ...o, ...p }))

  const submit = (e) => {
    e.preventDefault()
    const amount = parseNumber(v.amount)
    if (!isValidISO(v.date)) return setError('Choose a valid date.')
    if (!(amount > 0)) return setError('Enter the amount spent.')
    const res = actions.saveExpense({ ...v, amount }, initial?.id)
    if (!res.ok) return setError(res.error)
    notify(initial ? 'Expense updated.' : `Expense recorded: ${formatMoney(amount)}.`)
    onClose()
  }

  return (
    <Modal title={initial ? 'Edit expense' : 'Add expense'} subtitle="Business costs reduce your profit" onClose={onClose}>
      <form onSubmit={submit} className="form">
        <div className="form-grid">
          <Field label="Date"><input type="date" value={v.date} onChange={(e) => set({ date: e.target.value })} required /></Field>
          <Field label="Category">
            <select value={v.category} onChange={(e) => set({ category: e.target.value })}>
              {EXPENSE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
              {!EXPENSE_CATEGORIES.includes(v.category) ? <option>{v.category}</option> : null}
            </select>
          </Field>
        </div>
        <Field label="Amount (₦)">
          <input type="number" inputMode="decimal" min="0" step="0.01" value={v.amount} onChange={(e) => set({ amount: e.target.value })} autoFocus />
        </Field>
        <Field label="Description (optional)">
          <input value={v.description} onChange={(e) => set({ description: e.target.value })} placeholder="e.g. Truck hire to Ikorodu" />
        </Field>
        <FormError>{error}</FormError>
        <div className="form-actions">
          <button type="button" className="ghost-button" onClick={onClose}>Cancel</button>
          <button type="submit" className="primary-button">{initial ? 'Save changes' : 'Add expense'}</button>
        </div>
      </form>
    </Modal>
  )
}
