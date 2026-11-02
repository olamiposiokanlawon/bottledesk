import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, X } from 'lucide-react'
import { AppContext } from './context.jsx'
import { useStore } from './hooks/useStore.js'
import { useHashRoute } from './hooks/useHashRoute.js'
import { useSync } from './hooks/useSync.js'
import { computeDerived } from './lib/calc.js'
import Sidebar from './components/Sidebar.jsx'
import { SyncChip } from './components/CloudPanel.jsx'
import ConflictDialog from './components/ConflictDialog.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Transactions from './pages/Transactions.jsx'
import Inventory from './pages/Inventory.jsx'
import Parties from './pages/Parties.jsx'
import Expenses from './pages/Expenses.jsx'
import Reports from './pages/Reports.jsx'
import Settings from './pages/Settings.jsx'

function Page({ route }) {
  switch (route) {
    case 'purchases': return <Transactions kind="purchase" key="purchase" />
    case 'sales': return <Transactions kind="sale" key="sale" />
    case 'inventory': return <Inventory />
    case 'suppliers': return <Parties kind="supplier" key="supplier" />
    case 'buyers': return <Parties kind="buyer" key="buyer" />
    case 'expenses': return <Expenses />
    case 'reports': return <Reports />
    case 'settings': return <Settings />
    default: return <Dashboard />
  }
}

export default function App() {
  const { data, actions, loadWarning, saveFailed } = useStore()
  const route = useHashRoute()
  const derived = useMemo(() => computeDerived(data), [data])

  const [toasts, setToasts] = useState([])
  const nextId = useRef(1)
  const notify = useCallback((message, type = 'success') => {
    const id = nextId.current++
    setToasts((t) => [...t, { id, message, type }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), type === 'error' ? 6000 : 3500)
  }, [])

  useEffect(() => {
    document.title = `${data.settings.businessName} · BottleDesk`
  }, [data.settings.businessName])

  const sync = useSync({ data, actions, notify })
  const ctx = useMemo(() => ({ data, derived, actions, notify, sync }), [data, derived, actions, notify, sync])

  return (
    <AppContext.Provider value={ctx}>
      <div className="app-shell">
        <Sidebar route={route} businessName={data.settings.businessName} />
        <main className="content">
          {loadWarning ? (
            <div className="banner bad">
              <AlertTriangle size={18} /> <span>{loadWarning}</span>
              <button className="icon-button" aria-label="Dismiss" onClick={actions.dismissWarning}><X size={16} /></button>
            </div>
          ) : null}
          {saveFailed ? (
            <div className="banner bad">
              <AlertTriangle size={18} />
              <span>Your changes could not be saved in this browser (private mode or storage full). Download a backup from Settings so you don't lose anything.</span>
            </div>
          ) : null}
          <SyncChip />
          <Page route={route} />
        </main>
      </div>

      <ConflictDialog />

      <div className="toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.type}`}>
            {t.type === 'error' ? <AlertTriangle size={17} /> : <CheckCircle2 size={17} />}
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </AppContext.Provider>
  )
}
