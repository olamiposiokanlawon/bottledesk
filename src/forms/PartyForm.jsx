import { useState } from 'react'
import { Modal, Field, FormError } from '../components/ui.jsx'
import { useApp } from '../context.jsx'

export default function PartyForm({ kind, initial, onClose }) {
  const { actions, notify } = useApp()
  const [v, setV] = useState(() => ({
    name: initial?.name || '', phone: initial?.phone || '', location: initial?.location || '', note: initial?.note || '',
  }))
  const [error, setError] = useState('')
  const set = (p) => setV((o) => ({ ...o, ...p }))

  const submit = (e) => {
    e.preventDefault()
    const res = actions.saveParty(kind, v, initial?.id)
    if (!res.ok) return setError(res.error)
    notify(initial ? 'Details saved.' : `${kind === 'supplier' ? 'Supplier' : 'Buyer'} added.`)
    onClose()
  }

  return (
    <Modal title={`${initial ? 'Edit' : 'Add'} ${kind}`} onClose={onClose}>
      <form onSubmit={submit} className="form">
        <Field label="Name"><input value={v.name} onChange={(e) => set({ name: e.target.value })} autoFocus /></Field>
        <div className="form-grid">
          <Field label="Phone"><input value={v.phone} onChange={(e) => set({ phone: e.target.value })} inputMode="tel" /></Field>
          <Field label="Location"><input value={v.location} onChange={(e) => set({ location: e.target.value })} /></Field>
        </div>
        <Field label="Note"><input value={v.note} onChange={(e) => set({ note: e.target.value })} /></Field>
        <FormError>{error}</FormError>
        <div className="form-actions">
          <button type="button" className="ghost-button" onClick={onClose}>Cancel</button>
          <button type="submit" className="primary-button">{initial ? 'Save changes' : `Add ${kind}`}</button>
        </div>
      </form>
    </Modal>
  )
}
