import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'

export function Modal({ title, subtitle, onClose, children, wide = false }) {
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && closeRef.current()
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [])

  return (
    <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal${wide ? ' wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <div>
            <h3>{title}</h3>
            {subtitle ? <p className="muted">{subtitle}</p> : null}
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  )
}

export function ConfirmDialog({ title, message, confirmLabel = 'Delete', onConfirm, onCancel, danger = true }) {
  return (
    <Modal title={title} onClose={onCancel}>
      <p className="confirm-text">{message}</p>
      <div className="form-actions">
        <button type="button" className="ghost-button" onClick={onCancel}>Cancel</button>
        <button type="button" className={danger ? 'danger-button' : 'primary-button'} onClick={onConfirm} autoFocus>
          {confirmLabel}
        </button>
      </div>
    </Modal>
  )
}

export function PageHeader({ eyebrow, title, subtitle, children }) {
  return (
    <header className="page-header">
      <div>
        {eyebrow ? <p className="eyebrow accent">{eyebrow}</p> : null}
        <h1>{title}</h1>
        {subtitle ? <p className="muted">{subtitle}</p> : null}
      </div>
      {children ? <div className="page-actions">{children}</div> : null}
    </header>
  )
}

export function StatCard({ tone = 'green', icon: Icon, label, value, unit, note }) {
  return (
    <article className={`stat-card ${tone}`}>
      <div className="icon-box"><Icon size={20} /></div>
      <p>{label}</p>
      <strong>{value}{unit ? <small> {unit}</small> : null}</strong>
      {note ? <span>{note}</span> : null}
    </article>
  )
}

const STATUS_LABEL = { paid: 'Paid', partial: 'Part paid', unpaid: 'Unpaid' }
const STATUS_TONE = { paid: 'green', partial: 'amber', unpaid: 'red' }
export const StatusBadge = ({ status }) => <span className={`badge ${STATUS_TONE[status]}`}>{STATUS_LABEL[status]}</span>

export const Badge = ({ tone = 'gray', children }) => <span className={`badge ${tone}`}>{children}</span>

export function EmptyState({ icon: Icon, title, text, children }) {
  return (
    <div className="empty">
      {Icon ? <Icon size={30} /> : null}
      <h4>{title}</h4>
      {text ? <p className="muted">{text}</p> : null}
      {children}
    </div>
  )
}

export function Field({ label, hint, error, children, className = '' }) {
  return (
    <label className={`field ${className}`}>
      <span className="field-label">{label}</span>
      {children}
      {hint ? <span className="field-hint">{hint}</span> : null}
      {error ? <span className="field-error">{error}</span> : null}
    </label>
  )
}

export function FormError({ children }) {
  return children ? <div className="form-error" role="alert">{children}</div> : null
}
