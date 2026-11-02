import {
  LayoutDashboard, ArrowDownToLine, ArrowUpFromLine, Boxes, Truck, Users, Receipt, BarChart3, Settings,
} from 'lucide-react'
import { formatDate, todayISO } from '../lib/format.js'

export const NAV = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'purchases', label: 'Buy', icon: ArrowDownToLine },
  { id: 'sales', label: 'Sell', icon: ArrowUpFromLine },
  { id: 'inventory', label: 'Inventory', icon: Boxes },
  { id: 'suppliers', label: 'Suppliers', icon: Truck },
  { id: 'buyers', label: 'Buyers', icon: Users },
  { id: 'expenses', label: 'Expenses', icon: Receipt },
  { id: 'reports', label: 'Reports', icon: BarChart3 },
  { id: 'settings', label: 'Settings', icon: Settings },
]

export default function Sidebar({ route, businessName }) {
  return (
    <aside className="sidebar">
      <div className="brand-mark">PB</div>
      <div className="brand-text">
        <p className="eyebrow">Operations</p>
        <h2>Bottle<span>Desk</span></h2>
      </div>
      <nav aria-label="Main">
        {NAV.map(({ id, label, icon: Icon }) => (
          <a key={id} href={`#/${id}`} className={route === id ? 'active' : ''} aria-current={route === id ? 'page' : undefined}>
            <Icon size={18} /> <span>{label}</span>
          </a>
        ))}
      </nav>
      <div className="sidebar-footer">
        <p>{formatDate(todayISO())}</p>
        <strong>{businessName}</strong>
      </div>
    </aside>
  )
}
