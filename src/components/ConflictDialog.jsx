import { Modal } from './ui.jsx'
import { useApp } from '../context.jsx'
import { timeAgo } from './CloudPanel.jsx'

const counts = (d) => `${d.purchases?.length || 0} purchases, ${d.sales?.length || 0} sales, ${d.expenses?.length || 0} expenses`

export default function ConflictDialog() {
  const { sync, data } = useApp()
  if (!sync.conflict) return null
  const server = sync.conflict.server
  return (
    <Modal title="Two different copies found" subtitle="This phone and your cloud backup do not match. Pick the one you want to keep." onClose={() => {}}>
      <div className="conflict">
        <div>
          <h5>This phone</h5>
          <p>{counts(data)}</p>
        </div>
        <div>
          <h5>Cloud backup</h5>
          <p>{counts(server.data)}</p>
          <small>Saved {timeAgo(server.updatedAt)}</small>
        </div>
      </div>
      <p className="confirm-text">The copy you don't pick is replaced. If you're not sure, download a backup from Settings first, or choose the one with more records.</p>
      <div className="form-actions">
        <button className="ghost-button" onClick={() => sync.resolveConflict('cloud')}>Use cloud copy</button>
        <button className="primary-button" onClick={() => sync.resolveConflict('phone')}>Keep this phone's copy</button>
      </div>
    </Modal>
  )
}
