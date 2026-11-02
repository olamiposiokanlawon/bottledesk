import { useState } from 'react'
import { Modal, Field, FormError } from '../components/ui.jsx'
import { useApp } from '../context.jsx'
import { formatKg, formatMoney, isValidISO, parseNumber, round2, todayISO } from '../lib/format.js'

const NEW = '__new__'

export default function TransactionForm({ kind, initial, onClose }) {
  const { data, derived, actions, notify } = useApp()
  const isBuy = kind === 'purchase'
  const word = isBuy ? 'supplier' : 'buyer'
  const parties = isBuy ? data.suppliers : data.buyers
  const types = data.settings.bottleTypes

  const lastSalePrice = (type) => {
    const mine = data.sales.filter((s) => s.type === type).sort((a, b) => (a.date < b.date ? 1 : -1))
    return mine.length ? String(mine[0].pricePerKg) : ''
  }
  const defaultPrice = (type) => (isBuy ? String(data.settings.defaultBuyPrice) : lastSalePrice(type))

  const [v, setV] = useState(() =>
    initial
      ? {
          date: initial.date, partyId: initial.partyId || '', type: initial.type, kg: String(initial.kg),
          price: String(initial.pricePerKg), paid: String(initial.paid), note: initial.note || '', newName: '', newPhone: '',
        }
      : {
          date: todayISO(), partyId: '', type: types[0], kg: '', price: defaultPrice(types[0]), paid: '', note: '',
          newName: '', newPhone: '',
        },
  )
  const [paidTouched, setPaidTouched] = useState(Boolean(initial))
  const [priceTouched, setPriceTouched] = useState(Boolean(initial))
  const [error, setError] = useState('')

  const set = (patch) => setV((old) => ({ ...old, ...patch }))
  const kgN = parseNumber(v.kg)
  const priceN = parseNumber(v.price)
  const total = kgN > 0 && priceN > 0 ? round2(kgN * priceN) : 0
  const walkIn = v.partyId === ''
  const paidText = walkIn ? String(total) : paidTouched ? v.paid : String(total)
  const paidN = parseNumber(paidText)

  const stock = derived.ledger.stock[v.type]
  const available = round2((stock ? stock.kg : 0) + (initial && initial.type === v.type ? initial.kg : 0))
  const avgCost = stock ? stock.avgCost : 0
  const profit = !isBuy && kgN > 0 && priceN > 0 && avgCost > 0 ? round2((priceN - avgCost) * kgN) : null

  const onType = (type) => set({ type, ...(priceTouched ? {} : { price: defaultPrice(type) }) })

  const submit = (e) => {
    e.preventDefault()
    setError('')
    if (!isValidISO(v.date)) return setError('Choose a valid date.')
    if (!(kgN > 0)) return setError('Enter the weight in kg.')
    if (!(priceN > 0)) return setError('Enter the price per kg.')
    if (v.partyId === NEW && !v.newName.trim()) return setError(`Enter the new ${word}'s name.`)
    const finalPaid = walkIn ? total : paidN
    if (!(finalPaid >= 0)) return setError('Enter how much has been paid (0 if nothing yet).')
    if (finalPaid > total + 0.005) return setError(`Amount paid can't be more than the total (${formatMoney(total)}).`)

    const res = actions.saveTransaction(
      kind,
      { date: v.date, partyId: v.partyId === NEW ? '' : v.partyId, type: v.type, kg: kgN, pricePerKg: priceN, paid: finalPaid, note: v.note },
      initial?.id,
      v.partyId === NEW ? { name: v.newName, phone: v.newPhone } : null,
    )
    if (!res.ok) return setError(res.error)
    notify(initial ? 'Changes saved.' : isBuy ? `Purchase recorded: ${formatKg(kgN)} for ${formatMoney(total)}.` : `Sale recorded: ${formatKg(kgN)} for ${formatMoney(total)}.`)
    onClose()
  }

  const balance = round2(total - (Number.isFinite(finalPaidSafe(walkIn, total, paidN)) ? finalPaidSafe(walkIn, total, paidN) : 0))

  return (
    <Modal title={`${initial ? 'Edit' : 'Record'} ${isBuy ? 'purchase' : 'sale'}`} subtitle={isBuy ? 'Bottles you bought' : 'Bottles you sold'} onClose={onClose}>
      <form onSubmit={submit} className="form">
        <div className="form-grid">
          <Field label="Date">
            <input type="date" value={v.date} onChange={(e) => set({ date: e.target.value })} required />
          </Field>
          <Field label={isBuy ? 'Supplier' : 'Buyer'}>
            <select value={v.partyId} onChange={(e) => set({ partyId: e.target.value })}>
              <option value="">Walk-in (not recorded)</option>
              {parties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              <option value={NEW}>+ Add new {word}…</option>
            </select>
          </Field>
        </div>

        {v.partyId === NEW ? (
          <div className="form-grid">
            <Field label={`New ${word}'s name`}>
              <input value={v.newName} onChange={(e) => set({ newName: e.target.value })} placeholder="e.g. Emeka Collectors" autoFocus />
            </Field>
            <Field label="Phone (optional)">
              <input value={v.newPhone} onChange={(e) => set({ newPhone: e.target.value })} inputMode="tel" />
            </Field>
          </div>
        ) : null}

        <div className="form-grid">
          <Field label="Bottle type">
            <select value={v.type} onChange={(e) => onType(e.target.value)}>
              {types.map((t) => <option key={t} value={t}>{t}</option>)}
              {!types.includes(v.type) ? <option value={v.type}>{v.type}</option> : null}
            </select>
          </Field>
          <Field
            label="Weight (kg)"
            hint={!isBuy ? `In stock: ${formatKg(available)}` : undefined}
          >
            <input type="number" inputMode="decimal" min="0" step="0.01" value={v.kg} onChange={(e) => set({ kg: e.target.value })} placeholder="0" autoFocus={!initial && v.partyId !== NEW} />
          </Field>
        </div>

        <div className="form-grid">
          <Field label="Price per kg (₦)" hint={isBuy ? `Usual price ₦${data.settings.defaultBuyPrice}/kg` : avgCost > 0 ? `Your average cost is ${formatMoney(avgCost)}/kg` : undefined}>
            <input type="number" inputMode="decimal" min="0" step="0.01" value={v.price} onChange={(e) => { setPriceTouched(true); set({ price: e.target.value }) }} placeholder="0" />
          </Field>
          <Field label="Total">
            <div className="readout">{formatMoney(total)}</div>
          </Field>
        </div>

        <div className="form-grid">
          <Field
            label={isBuy ? 'Amount paid now (₦)' : 'Amount received now (₦)'}
            hint={walkIn ? 'Walk-in deals are paid in full. Choose or add someone to record a balance.' : undefined}
          >
            <input
              type="number" inputMode="decimal" min="0" step="0.01" value={paidText} disabled={walkIn}
              onChange={(e) => { setPaidTouched(true); set({ paid: e.target.value }) }}
            />
          </Field>
          <Field label={isBuy ? 'Still owed to supplier' : 'Still owed by buyer'}>
            <div className={`readout ${balance > 0 ? 'warn' : ''}`}>{formatMoney(balance)}</div>
          </Field>
        </div>
        {!walkIn ? (
          <div className="quick-row">
            <button type="button" className="chip" onClick={() => { setPaidTouched(true); set({ paid: String(total) }) }}>Paid in full</button>
            <button type="button" className="chip" onClick={() => { setPaidTouched(true); set({ paid: '0' }) }}>Nothing paid yet</button>
          </div>
        ) : null}

        {profit !== null ? (
          <div className={`callout ${profit >= 0 ? 'good' : 'bad'}`}>
            Estimated profit on this sale: <b>{formatMoney(profit)}</b> ({formatMoney(round2(profit / kgN))}/kg) after the cost of the bottles.
          </div>
        ) : null}

        <Field label="Note (optional)">
          <input value={v.note} onChange={(e) => set({ note: e.target.value })} placeholder="e.g. delivered by truck" />
        </Field>

        <FormError>{error}</FormError>
        <div className="form-actions">
          <button type="button" className="ghost-button" onClick={onClose}>Cancel</button>
          <button type="submit" className="primary-button">{initial ? 'Save changes' : isBuy ? 'Record purchase' : 'Record sale'}</button>
        </div>
      </form>
    </Modal>
  )
}

function finalPaidSafe(walkIn, total, paidN) {
  return walkIn ? total : paidN
}
