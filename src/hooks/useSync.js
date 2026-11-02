import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError, clearAuth, isNativeApp, loadAuth, loadMeta, normalizeServerUrl, rememberServer, request, saveAuth, saveMeta } from '../lib/api.js'
import { normalizeData } from '../lib/storage.js'
import { validateData } from '../lib/calc.js'

const isEmpty = (d) => !d || !(d.purchases.length || d.sales.length || d.expenses.length || d.payments.length || d.suppliers.length || d.buyers.length)

/**
 * Cloud backup + sync. The phone always keeps a full copy and works offline.
 * Changes are uploaded a moment after you make them (or when the signal comes back).
 */
export function useSync({ data, actions, notify }) {
  const [auth, setAuth] = useState(loadAuth)
  const [status, setStatus] = useState(loadAuth() ? 'syncing' : 'local') // local | syncing | synced | offline | error
  const [message, setMessage] = useState('')
  const [lastSync, setLastSync] = useState(() => (loadAuth() ? loadMeta(loadAuth().username).lastSync : null))
  const [conflict, setConflict] = useState(null)

  const dataRef = useRef(data)
  dataRef.current = data
  const authRef = useRef(auth)
  authRef.current = auth
  const meta = useRef(auth ? loadMeta(auth.username) : null)
  const lastJSON = useRef(meta.current && !meta.current.dirty ? JSON.stringify(data) : '')
  const busy = useRef(false)
  const again = useRef(false)
  const timer = useRef(null)
  const conflictOpen = useRef(false)
  const initializing = useRef(false) // true while the first sync after sign-in decides whose records win

  const persist = () => { if (meta.current) saveMeta(meta.current) }

  const goLocal = useCallback((why) => {
    clearTimeout(timer.current)
    clearAuth()
    meta.current = null
    setAuth(null)
    setStatus('local')
    setMessage('')
    setConflict(null)
    conflictOpen.current = false
    if (why) notify(why, 'error')
  }, [notify])

  const schedulePush = useCallback((ms) => {
    clearTimeout(timer.current)
    timer.current = setTimeout(() => pushNowRef.current(), ms)
  }, [])

  const applyServerData = useCallback((server) => {
    const clean = normalizeData(server.data)
    const problem = validateData(clean)
    if (problem) throw new Error(`The cloud copy has a problem: ${problem}`)
    lastJSON.current = JSON.stringify(clean)
    const res = actions.replaceAll(clean)
    if (!res.ok) throw new Error(res.error)
    meta.current = { ...meta.current, baseVersion: server.version, dirty: false, lastSync: new Date().toISOString() }
    persist()
    setLastSync(meta.current.lastSync)
  }, [actions])

  const openConflict = useCallback((server) => {
    conflictOpen.current = true
    setConflict({ server })
    setStatus('error')
    setMessage('Choose which copy to keep.')
  }, [])

  const handleError = useCallback(async (err, onConflict) => {
    if (!(err instanceof ApiError)) { setStatus('error'); setMessage(err.message); return }
    if (err.status === 0) { setStatus('offline'); setMessage('Offline. Your records are safe on this phone and will upload when you are back online.'); schedulePush(30000); return }
    if (err.status === 401) { goLocal('Your sign-in expired. Please sign in again. Your records are still on this phone.'); return }
    if (err.status === 409 && onConflict) { await onConflict(err); return }
    setStatus('error')
    setMessage(err.message)
  }, [goLocal, schedulePush])

  const pushNow = useCallback(async () => {
    const a = authRef.current
    if (!a || !meta.current || conflictOpen.current) return
    if (busy.current) { again.current = true; return }
    busy.current = true
    setStatus('syncing')
    const sent = dataRef.current
    try {
      const res = await request(a.server, 'PUT', '/api/data', { token: a.token, body: { baseVersion: meta.current.baseVersion, data: sent } })
      lastJSON.current = JSON.stringify(sent)
      const stillDirty = JSON.stringify(dataRef.current) !== lastJSON.current
      meta.current = { ...meta.current, baseVersion: res.version, dirty: stillDirty, lastSync: new Date().toISOString() }
      persist()
      setLastSync(meta.current.lastSync)
      setMessage('')
      setStatus(stillDirty ? 'syncing' : 'synced')
      if (stillDirty) again.current = true
    } catch (err) {
      await handleError(err, async (e) => {
        // The cloud has a different version from the one we last saw.
        const server = await request(a.server, 'GET', '/api/data', { token: a.token })
        if (!server.data || server.version < meta.current.baseVersion) {
          // Cloud was reset or restored from an older backup: the phone has the latest, so upload it.
          meta.current = { ...meta.current, baseVersion: server.version, dirty: true }
          persist()
          again.current = true
        } else {
          openConflict(server)
        }
      })
    } finally {
      busy.current = false
      if (again.current && !conflictOpen.current) { again.current = false; schedulePush(500) }
    }
  }, [handleError, openConflict, schedulePush])
  const pushNowRef = useRef(pushNow)
  pushNowRef.current = pushNow

  const pull = useCallback(async () => {
    const a = authRef.current
    if (!a || !meta.current || busy.current || conflictOpen.current || initializing.current) return
    if (meta.current.dirty) return pushNowRef.current()
    try {
      const server = await request(a.server, 'GET', '/api/data', { token: a.token })
      if (server.version === meta.current.baseVersion) { setStatus('synced'); setMessage(''); return }
      if (!server.data || server.version < meta.current.baseVersion) {
        meta.current = { ...meta.current, baseVersion: server.version, dirty: !isEmpty(dataRef.current) }
        persist()
        if (meta.current.dirty) schedulePush(200)
        return
      }
      if (JSON.stringify(dataRef.current) !== lastJSON.current) { meta.current = { ...meta.current, dirty: true }; persist(); return schedulePush(200) }
      applyServerData(server)
      setStatus('synced')
      setMessage('')
      notify('Updated with the latest records from the cloud.')
    } catch (err) {
      await handleError(err)
    }
  }, [applyServerData, handleError, notify, schedulePush])

  // First contact after signing in: decide whose records win if both sides already have some.
  const firstSync = useCallback(async (a) => {
    setStatus('syncing')
    try {
      const server = await request(a.server, 'GET', '/api/data', { token: a.token })
      const local = dataRef.current
      meta.current = { user: a.username, baseVersion: server.version, dirty: false, lastSync: null }
      if (!server.data || isEmpty(server.data)) {
        meta.current.dirty = true
        persist()
        lastJSON.current = ''
        return pushNowRef.current()
      }
      if (isEmpty(local) || JSON.stringify(normalizeData(server.data)) === JSON.stringify(local)) {
        applyServerData(server)
        setStatus('synced')
        if (!isEmpty(server.data)) notify('Your records were loaded from the cloud.')
        return
      }
      persist()
      openConflict(server)
    } catch (err) {
      await handleError(err)
    }
  }, [applyServerData, handleError, notify, openConflict])

  // ----- changes made on this phone -> upload soon -----
  useEffect(() => {
    if (!auth || !meta.current || conflictOpen.current || initializing.current) return
    if (JSON.stringify(data) === lastJSON.current) return
    meta.current = { ...meta.current, dirty: true }
    persist()
    setStatus((s) => (s === 'offline' ? s : 'syncing'))
    schedulePush(1500)
  }, [data, auth, schedulePush])

  // ----- on start, on coming back online, when the app is reopened, and every half minute -----
  useEffect(() => {
    if (!auth) return undefined
    const tick = () => { if (navigator.onLine !== false) pull() }
    tick()
    const iv = setInterval(tick, 30000)
    const vis = () => document.visibilityState === 'visible' && tick()
    window.addEventListener('online', tick)
    window.addEventListener('focus', tick)
    document.addEventListener('visibilitychange', vis)
    return () => {
      clearInterval(iv)
      window.removeEventListener('online', tick)
      window.removeEventListener('focus', tick)
      document.removeEventListener('visibilitychange', vis)
    }
  }, [auth, pull])

  useEffect(() => () => clearTimeout(timer.current), [])

  // ----- actions for the screens -----
  const signIn = useCallback(async ({ mode, server, username, password }) => {
    const base = normalizeServerUrl(server)
    if (!base && isNativeApp()) throw new ApiError('Enter your server address first, for example https://bottles.example.com')
    const res = await request(base, 'POST', mode === 'register' ? '/api/register' : '/api/login', { body: { username, password } })
    const a = { server: base, username: res.user.username, token: res.token }
    saveAuth(a)
    rememberServer(base)
    authRef.current = a
    meta.current = loadMeta(a.username)
    if (meta.current.baseVersion === undefined) meta.current = { user: a.username, baseVersion: 0, dirty: false, lastSync: null }
    initializing.current = true
    setAuth(a)
    try {
      await firstSync(a)
    } finally {
      initializing.current = false
    }
  }, [firstSync])

  const signOut = useCallback(async () => {
    const a = authRef.current
    if (a) { try { await request(a.server, 'POST', '/api/logout', { token: a.token, timeout: 5000 }) } catch { /* ignore */ } }
    goLocal()
    notify('Signed out. Your records stay on this phone.')
  }, [goLocal, notify])

  const changePassword = useCallback(async (oldPassword, newPassword) => {
    const a = authRef.current
    await request(a.server, 'POST', '/api/password', { token: a.token, body: { oldPassword, newPassword } })
  }, [])

  const syncNow = useCallback(() => (meta.current?.dirty ? pushNowRef.current() : pull()), [pull])

  const resolveConflict = useCallback(async (choice) => {
    const server = conflict?.server
    if (!server) return
    conflictOpen.current = false
    setConflict(null)
    try {
      if (choice === 'cloud') {
        applyServerData(server)
        setStatus('synced')
        notify('Your phone now matches the cloud copy.')
      } else {
        meta.current = { ...meta.current, baseVersion: server.version, dirty: true }
        persist()
        lastJSON.current = ''
        await pushNowRef.current()
      }
    } catch (err) {
      setStatus('error')
      setMessage(err.message)
    }
  }, [applyServerData, conflict, notify])

  return { auth, status, message, lastSync, conflict, signIn, signOut, changePassword, syncNow, resolveConflict }
}
