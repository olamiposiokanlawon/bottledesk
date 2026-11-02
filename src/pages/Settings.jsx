import { useRef, useState } from 'react'
import { Download, Upload, Trash2, Database, Plus, X } from 'lucide-react'
import { useApp } from '../context.jsx'
import { ConfirmDialog, Field, FormError, Modal, PageHeader } from '../components/ui.jsx'
import CloudPanel from '../components/CloudPanel.jsx'
import { exportJSON, parseImport } from '../lib/storage.js'
import { emptyData } from '../lib/constants.js'
import { downloadFile } from '../lib/csv.js'
import { parseNumber, todayISO } from '../lib/format.js'

export default function Settings() {
  const { data, actions, notify } = useApp()
  const s = data.settings
  const fileRef = useRef(null)
  const [v, setV] = useState({
    businessName: s.businessName, ownerName: s.ownerName, defaultBuyPrice: String(s.defaultBuyPrice),
    openingCash: String(s.openingCash), lowStockKg: String(s.lowStockKg),
  })
  const [error, setError] = useState('')
  const [newType, setNewType] = useState('')
  const [typeError, setTypeError] = useState('')
  const [modal, setModal] = useState(null)
  const [importError, setImportError] = useState('')
  const [confirmText, setConfirmText] = useState('')

  const save = (e) => {
    e.preventDefault()
    const price = parseNumber(v.defaultBuyPrice)
    const cash = v.openingCash.trim() === '' ? 0 : parseNumber(v.openingCash)
    const low = v.lowStockKg.trim() === '' ? 0 : parseNumber(v.lowStockKg)
    if (!v.businessName.trim()) return setError('Enter a business name.')
    if (!(price > 0)) return setError('The usual buying price must be more than ₦0.')
    if (!Number.isFinite(cash)) return setError('Opening cash must be a number.')
    if (!(low >= 0)) return setError('The low-stock alert must be 0 or more.')
    const res = actions.saveSettings({ businessName: v.businessName.trim(), ownerName: v.ownerName.trim(), defaultBuyPrice: price, openingCash: cash, lowStockKg: low })
    if (!res.ok) return setError(res.error)
    setError('')
    notify('Settings saved.')
  }

  const inUse = (type) =>
    [...data.purchases, ...data.sales, ...data.adjustments].some((r) => r.type === type)

  const addType = (e) => {
    e.preventDefault()
    const name = newType.trim()
    if (!name) return
    if (s.bottleTypes.some((t) => t.toLowerCase() === name.toLowerCase())) return setTypeError('You already have that type.')
    const res = actions.saveSettings({ bottleTypes: [...s.bottleTypes, name] })
    if (!res.ok) return setTypeError(res.error)
    setNewType(''); setTypeError('')
  }
  const removeType = (t) => {
    if (s.bottleTypes.length <= 1) return setTypeError('Keep at least one bottle type.')
    if (inUse(t)) return setTypeError(`"${t}" is used in your records, so it can't be removed.`)
    actions.saveSettings({ bottleTypes: s.bottleTypes.filter((x) => x !== t) })
    setTypeError('')
  }

  const backup = () => {
    downloadFile(`bottledesk-backup-${todayISO()}.json`, exportJSON(data), 'application/json')
    notify('Backup downloaded. Keep it somewhere safe, like Google Drive or WhatsApp to yourself.')
  }

  const onFile = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      const imported = parseImport(await file.text())
      setImportError('')
      setModal({ import: imported })
    } catch (err) {
      setImportError(err.message)
    }
  }

  const doImport = () => {
    const res = actions.replaceAll(modal.import)
    notify(res.ok ? 'Backup restored.' : res.error, res.ok ? 'success' : 'error')
    setModal(null)
  }

  const loadSample = async () => {
    const { generateSample } = await import('../lib/sample.js')
    const res = actions.replaceAll(generateSample())
    notify(res.ok ? 'Sample data loaded.' : res.error, res.ok ? 'success' : 'error')
    setModal(null)
  }

  const reset = () => {
    const res = actions.replaceAll(emptyData())
    notify(res.ok ? 'Everything has been cleared.' : res.error, res.ok ? 'success' : 'error')
    setModal(null); setConfirmText('')
  }

  const count = data.purchases.length + data.sales.length + data.expenses.length + data.payments.length

  return (
    <>
      <PageHeader eyebrow="Preferences" title="Settings" subtitle="Your business details, bottle types and data backup." />

      <CloudPanel />

      <div className="lower-grid even spaced">
        <form className="panel form" onSubmit={save}>
          <div className="panel-heading"><div><p className="eyebrow">Business</p><h4>Details & defaults</h4></div></div>
          <Field label="Business name"><input value={v.businessName} onChange={(e) => setV({ ...v, businessName: e.target.value })} /></Field>
          <Field label="Your first name (for the greeting)"><input value={v.ownerName} onChange={(e) => setV({ ...v, ownerName: e.target.value })} /></Field>
          <div className="form-grid">
            <Field label="Usual buying price (₦/kg)" hint="Filled in automatically when you record a purchase"><input type="number" min="0" step="0.01" value={v.defaultBuyPrice} onChange={(e) => setV({ ...v, defaultBuyPrice: e.target.value })} /></Field>
            <Field label="Low-stock alert (kg)" hint="Warn me when a type drops below this"><input type="number" min="0" step="1" value={v.lowStockKg} onChange={(e) => setV({ ...v, lowStockKg: e.target.value })} /></Field>
          </div>
          <Field label="Opening cash (₦)" hint="Money you had before using BottleDesk. Used for 'Cash on hand'."><input type="number" step="0.01" value={v.openingCash} onChange={(e) => setV({ ...v, openingCash: e.target.value })} /></Field>
          <FormError>{error}</FormError>
          <div className="form-actions"><button type="submit" className="primary-button">Save settings</button></div>
        </form>

        <section className="panel">
          <div className="panel-heading"><div><p className="eyebrow">Stock</p><h4>Bottle types</h4></div></div>
          <ul className="type-list">
            {s.bottleTypes.map((t) => (
              <li key={t}><span>{t}</span><button type="button" className="icon-button" aria-label={`Remove ${t}`} onClick={() => removeType(t)}><X size={16} /></button></li>
            ))}
          </ul>
          <form className="inline-form" onSubmit={addType}>
            <input value={newType} onChange={(e) => setNewType(e.target.value)} placeholder="e.g. Green, Black, Jerrycans" aria-label="New bottle type" />
            <button type="submit" className="ghost-button"><Plus size={16} /> Add</button>
          </form>
          <FormError>{typeError}</FormError>
        </section>
      </div>

      <section className="panel spaced">
        <div className="panel-heading"><div><p className="eyebrow">Your data</p><h4>Backup & restore</h4></div></div>
        <p className="muted pad">
          Records are always saved on this device. If you are not signed in to a cloud account above, they exist only here, so download a backup file regularly (for example every Friday) and keep it somewhere safe.
        </p>
        <div className="form-actions left">
          <button className="primary-button" onClick={backup}><Download size={16} /> Download backup</button>
          <button className="ghost-button" onClick={() => fileRef.current?.click()}><Upload size={16} /> Restore from backup</button>
          <input ref={fileRef} type="file" accept=".json,application/json" onChange={onFile} hidden />
        </div>
        <FormError>{importError}</FormError>
        <p className="muted pad small-text">{count} records saved · {data.suppliers.length} suppliers · {data.buyers.length} buyers</p>
      </section>

      <section className="panel spaced danger-zone">
        <div className="panel-heading"><div><p className="eyebrow">Careful</p><h4>Sample data & reset</h4></div></div>
        <div className="form-actions left">
          <button className="ghost-button" onClick={() => setModal({ sample: true })}><Database size={16} /> Load sample data</button>
          <button className="danger-button" onClick={() => setModal({ reset: true })}><Trash2 size={16} /> Delete everything</button>
        </div>
      </section>

      {modal?.import ? (
        <ConfirmDialog
          title="Replace your data with this backup?"
          message={`The backup has ${modal.import.purchases.length} purchases, ${modal.import.sales.length} sales and ${modal.import.expenses.length} expenses. Everything currently in BottleDesk will be replaced.`}
          confirmLabel="Restore backup" danger={false} onConfirm={doImport} onCancel={() => setModal(null)}
        />
      ) : null}
      {modal?.sample ? (
        <ConfirmDialog
          title="Load sample data?"
          message="This replaces everything in BottleDesk with made-up demo records. Download a backup first if you have real records."
          confirmLabel="Load sample data" danger={false} onConfirm={loadSample} onCancel={() => setModal(null)}
        />
      ) : null}
      {modal?.reset ? (
        <Modal title="Delete everything?" onClose={() => { setModal(null); setConfirmText('') }}>
          <p className="confirm-text">This permanently deletes all purchases, sales, expenses, suppliers and buyers. Type <b>DELETE</b> to confirm.</p>
          <input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} aria-label="Type DELETE to confirm" autoFocus />
          <div className="form-actions">
            <button className="ghost-button" onClick={() => { setModal(null); setConfirmText('') }}>Cancel</button>
            <button className="danger-button" disabled={confirmText.trim() !== 'DELETE'} onClick={reset}>Delete everything</button>
          </div>
        </Modal>
      ) : null}
    </>
  )
}
