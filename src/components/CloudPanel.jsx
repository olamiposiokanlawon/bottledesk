import { useState } from 'react'
import { Cloud, CloudOff, RefreshCw } from 'lucide-react'
import { useApp } from '../context.jsx'
import { Field, FormError } from './ui.jsx'
import { BUILD_SERVER, ApiError, isNativeApp, lastServer, normalizeServerUrl, request } from '../lib/api.js'

const STATUS_TEXT = {
  local: 'Not backed up',
  syncing: 'Syncing…',
  synced: 'Backed up',
  offline: 'Offline',
  error: 'Needs attention',
}

export const timeAgo = (iso) => {
  if (!iso) return 'not yet'
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const h = Math.round(mins / 60)
  return h < 24 ? `${h} hour${h === 1 ? '' : 's'} ago` : `${Math.round(h / 24)} day(s) ago`
}

export default function CloudPanel() {
  const { sync, notify } = useApp()
  const native = isNativeApp()
  const [mode, setMode] = useState('login')
  const [v, setV] = useState({ server: BUILD_SERVER || lastServer(), username: '', password: '', confirm: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [test, setTest] = useState('')
  const [pw, setPw] = useState({ open: false, old: '', next: '', error: '', busy: false })
  const set = (p) => setV((o) => ({ ...o, ...p }))

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    if (v.username.trim().length < 3) return setError('Enter your username (3 or more characters). A phone number or email works well.')
    if (v.password.length < 6) return setError('Password must be at least 6 characters.')
    if (mode === 'register' && v.password !== v.confirm) return setError('The two passwords are not the same.')
    setBusy(true)
    try {
      await sync.signIn({ mode, server: v.server, username: v.username.trim(), password: v.password })
      notify(mode === 'register' ? 'Account created. Your records will now back up automatically.' : 'Signed in.')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const testConnection = async () => {
    setTest('Checking…')
    try {
      const base = normalizeServerUrl(v.server)
      if (!base && native) throw new ApiError('Enter your server address first.')
      const res = await request(base, 'GET', '/api/health', { timeout: 8000 })
      setTest(res.ok ? `Connected. ${res.registration ? '' : 'New accounts are switched off on this server.'}` : 'The server answered, but it is not BottleDesk.')
    } catch (err) {
      setTest(err.message)
    }
  }

  const changePw = async (e) => {
    e.preventDefault()
    if (pw.next.length < 6) return setPw({ ...pw, error: 'New password must be at least 6 characters.' })
    setPw({ ...pw, busy: true, error: '' })
    try {
      await sync.changePassword(pw.old, pw.next)
      notify('Password changed.')
      setPw({ open: false, old: '', next: '', error: '', busy: false })
    } catch (err) {
      setPw({ ...pw, busy: false, error: err.message })
    }
  }

  if (sync.auth) {
    return (
      <section className="panel spaced">
        <div className="panel-heading">
          <div><p className="eyebrow">Cloud backup</p><h4>Signed in as {sync.auth.username}</h4></div>
          <span className={`sync-chip ${sync.status}`}>{sync.status === 'offline' ? <CloudOff size={14} /> : <Cloud size={14} />} {STATUS_TEXT[sync.status]}</span>
        </div>
        <p className="muted pad">
          Your records are saved on this phone and copied to your server{sync.auth.server ? ` (${sync.auth.server.replace(/^https?:\/\//, '')})` : ''} whenever you have signal.
          Last backup: <b>{timeAgo(sync.lastSync)}</b>. Sign in on another phone to see the same records.
        </p>
        {sync.message ? <div className="form-error">{sync.message}</div> : null}
        <div className="form-actions left">
          <button className="primary-button" onClick={sync.syncNow}><RefreshCw size={16} /> Sync now</button>
          <button className="ghost-button" onClick={() => setPw({ ...pw, open: !pw.open })}>Change password</button>
          <button className="ghost-button" onClick={sync.signOut}>Sign out</button>
        </div>
        {pw.open ? (
          <form className="form pw-form" onSubmit={changePw}>
            <div className="form-grid">
              <Field label="Current password"><input type="password" autoComplete="current-password" value={pw.old} onChange={(e) => setPw({ ...pw, old: e.target.value })} /></Field>
              <Field label="New password"><input type="password" autoComplete="new-password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} /></Field>
            </div>
            <FormError>{pw.error}</FormError>
            <div className="form-actions left"><button className="primary-button" disabled={pw.busy}>Save new password</button></div>
          </form>
        ) : null}
      </section>
    )
  }

  return (
    <section className="panel spaced">
      <div className="panel-heading">
        <div><p className="eyebrow">Cloud backup</p><h4>Sign in to back up and share between phones</h4></div>
        <span className="sync-chip local"><CloudOff size={14} /> Not backed up</span>
      </div>
      <p className="muted pad">The app works fine without an account. Right now your records live only on this phone. Create a free account on your server and they are copied to it automatically, even if you lose or change your phone.</p>
      <div className="tabs" role="tablist">
        <button type="button" role="tab" aria-selected={mode === 'login'} className={mode === 'login' ? 'on' : ''} onClick={() => setMode('login')}>Sign in</button>
        <button type="button" role="tab" aria-selected={mode === 'register'} className={mode === 'register' ? 'on' : ''} onClick={() => setMode('register')}>Create account</button>
      </div>
      <form className="form" onSubmit={submit}>
        <Field label="Server address" hint={native ? 'Required. The web address of your BottleDesk server, e.g. https://bottles.example.com' : "Leave empty to use the server you opened this page from."}>
          <input value={v.server} onChange={(e) => set({ server: e.target.value })} placeholder={native ? 'https://your-server.com' : '(this website)'} autoCapitalize="none" autoCorrect="off" inputMode="url" />
        </Field>
        <div className="form-grid">
          <Field label="Username" hint="Phone number or email">
            <input value={v.username} onChange={(e) => set({ username: e.target.value })} autoComplete="username" autoCapitalize="none" />
          </Field>
          <Field label="Password" hint="At least 6 characters">
            <input type="password" value={v.password} onChange={(e) => set({ password: e.target.value })} autoComplete={mode === 'register' ? 'new-password' : 'current-password'} />
          </Field>
        </div>
        {mode === 'register' ? (
          <Field label="Repeat password"><input type="password" value={v.confirm} onChange={(e) => set({ confirm: e.target.value })} autoComplete="new-password" /></Field>
        ) : null}
        <FormError>{error}</FormError>
        {test ? <p className="muted">{test}</p> : null}
        <div className="form-actions left">
          <button className="primary-button" disabled={busy}>{busy ? 'Please wait…' : mode === 'register' ? 'Create account' : 'Sign in'}</button>
          <button type="button" className="ghost-button" onClick={testConnection}>Test connection</button>
        </div>
      </form>
    </section>
  )
}

export function SyncChip() {
  const { sync } = useApp()
  const label = STATUS_TEXT[sync.status]
  const Icon = sync.status === 'offline' || sync.status === 'local' ? CloudOff : Cloud
  return (
    <div className="sync-row no-print">
      <a href="#/settings" className={`sync-chip ${sync.status}`} title={sync.message || label}><Icon size={14} /> {label}</a>
    </div>
  )
}
