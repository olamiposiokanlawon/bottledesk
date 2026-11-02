import { useState } from 'react'
import { Modal, Field, FormError } from '../components/ui.jsx'
import { useApp } from '../context.jsx'
import { formatMoney, isValidISO, parseNumber, todayISO } from '../lib/format.js'

export default function PaymentForm({ kind, party, outstanding, onClose }) {
  const { actions, notify } = useApp()
  const isSupplier = kind === 'supplier'
  const [v, setV] = useState({ amount: String(outstanding), date: todayISO(), note: '' })
  const [error, setError] = useState('')
  const set = (p) => setV((o) => ({ ...o, ...p }))

  const submit = (e) => {
    e.preventDefault()
    const amount = parseNumber(v.amount)
    if (!(amount > 0)) return setError('Enter the amount.')
    if (amount > outstanding + 0.005) return setError(`That is more than the balance of ${formatMoney(outstanding)}.`)
    if (!isValidISO(v.date)) return setError('Choose a valid date.')
    const res = actions.addPayment(kind, party.id, { amount, date: v.date, note: v.note })
    if (!res.ok) return setError(res.error)
    notify(`${isSupplier ? 'Payment to' : 'Payment from'} ${party.name} recorded: ${formatMoney(amount)}.`)
    onClose()
  }

  return (
    <Modal
      title={isSupplier ? `Pay ${party.name}` : `Payment from ${party.name}`}
      subtitle={`${isSupplier ? 'You owe them' : 'They owe you'} ${formatMoney(outstanding)}`}
      onClose={onClose}
    >
      <form onSubmit={submit} className="form">
        <div className="form-grid">
          <Field label="Amount (₦)">
            <input type="number" inputMode="decimal" min="0" step="0.01" value={v.amount} onChange={(e) => set({ amount: e.target.value })} autoFocus />
          </Field>
          <Field label="Date"><input type="date" value={v.date} onChange={(e) => set({ date: e.target.value })} /></Field>
        </div>
        <div className="quick-row">
          <button type="button" className="chip" onClick={() => set({ amount: String(outstanding) })}>Full balance</button>
          <button type="button" className="chip" onClick={() => set({ amount: String(Math.round(outstanding / 2)) })}>Half</button>
        </div>
        <Field label="Note (optional)"><input value={v.note} onChange={(e) => set({ note: e.target.value })} placeholder="e.g. bank transfer" /></Field>
        <FormError>{error}</FormError>
        <div className="form-actions">
          <button type="button" className="ghost-button" onClick={onClose}>Cancel</button>
          <button type="submit" className="primary-button">{isSupplier ? 'Record payment' : 'Record payment received'}</button>
        </div>
      </form>
    </Modal>
  )
}
