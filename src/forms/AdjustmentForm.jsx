import { useState } from 'react'
import { Modal, Field, FormError } from '../components/ui.jsx'
import { useApp } from '../context.jsx'
import { ADJUSTMENT_REASONS } from '../lib/constants.js'
import { formatKg, isValidISO, parseNumber, todayISO } from '../lib/format.js'

export default function AdjustmentForm({ onClose }) {
  const { data, derived, actions, notify } = useApp()
  const types = data.settings.bottleTypes
  const [v, setV] = useState({ date: todayISO(), type: types[0], kg: '', reason: ADJUSTMENT_REASONS[0], note: '' })
  const [error, setError] = useState('')
  const set = (p) => setV((o) => ({ ...o, ...p }))
  const available = derived.ledger.stock[v.type]?.kg || 0

  const submit = (e) => {
    e.preventDefault()
    const kg = parseNumber(v.kg)
    if (!(kg > 0)) return setError('Enter how many kg were lost.')
    if (!isValidISO(v.date)) return setError('Choose a valid date.')
    const res = actions.addAdjustment({ ...v, kg })
    if (!res.ok) return setError(res.error)
    notify(`Write-off recorded: ${formatKg(kg)} of ${v.type}.`)
    onClose()
  }

  return (
    <Modal title="Write off stock" subtitle="Bottles lost to dirt, moisture, damage or theft. The cost counts as a loss in your profit." onClose={onClose}>
      <form onSubmit={submit} className="form">
        <div className="form-grid">
          <Field label="Date"><input type="date" value={v.date} onChange={(e) => set({ date: e.target.value })} /></Field>
          <Field label="Bottle type">
            <select value={v.type} onChange={(e) => set({ type: e.target.value })}>
              {types.map((t) => <option key={t}>{t}</option>)}
            </select>
          </Field>
        </div>
        <div className="form-grid">
          <Field label="Weight lost (kg)" hint={`In stock: ${formatKg(available)}`}>
            <input type="number" inputMode="decimal" min="0" step="0.01" value={v.kg} onChange={(e) => set({ kg: e.target.value })} autoFocus />
          </Field>
          <Field label="Reason">
            <select value={v.reason} onChange={(e) => set({ reason: e.target.value })}>
              {ADJUSTMENT_REASONS.map((r) => <option key={r}>{r}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Note (optional)"><input value={v.note} onChange={(e) => set({ note: e.target.value })} /></Field>
        <FormError>{error}</FormError>
        <div className="form-actions">
          <button type="button" className="ghost-button" onClick={onClose}>Cancel</button>
          <button type="submit" className="primary-button">Write off stock</button>
        </div>
      </form>
    </Modal>
  )
}
