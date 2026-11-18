import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { normalizeData } from '../lib/storage.js'
import { validateData } from '../lib/calc.js'

const isEmpty = (d) => !d || !(d.purchases.length || d.sales.length || d.expenses.length || d.payments.length || d.suppliers.length || d.buyers.length)
const META_KEY = 'bottledesk:supabase-sync'

const loadMeta = (userId) => {
  try {
    const meta = JSON.parse(localStorage.getItem(META_KEY))
    return meta?.user === userId ? meta : { user: userId, dirty: false, lastSync: null }
  } catch {
    return { user: userId, dirty: false, lastSync: null }
  }
}

const saveMeta = (meta) => { try { localStorage.setItem(META_KEY, JSON.stringify(meta)) } catch { /* local copy remains safe */ } }

const cloudCopy = async (userId) => {
  const { data: row, error } = await supabase
    .from('business_data')
    .select('data')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw error
  return { data: row?.data ?? null, updatedAt: null }
}

const accountFromUser = (user) => ({ userId: user.id, username: user.email || user.user_metadata?.email || 'account' })

/**
 * Cloud backup + sync. The phone always keeps a full copy and works offline.
 * Changes are uploaded a moment after you make them (or when the signal comes back).
 */
export function useSync({ data, actions, notify }) {
  const [auth, setAuth] = useState(null)
  const [status, setStatus] = useState('local') // local | syncing | synced | offline | error
  const [message, setMessage] = useState('')
  const [lastSync, setLastSync] = useState(null)
  const [conflict, setConflict] = useState(null)

  const dataRef = useRef(data)
  dataRef.current = data
  const authRef = useRef(auth)
  authRef.current = auth
  const meta = useRef(null)
  const lastJSON = useRef(meta.current && !meta.current.dirty ? JSON.stringify(data) : '')
  const busy = useRef(false)
  const again = useRef(false)
  const timer = useRef(null)
  const conflictOpen = useRef(false)
  const initializing = useRef(false) // true while the first sync after sign-in decides whose records win
  const initializedSession = useRef(false)

  const persist = () => { if (meta.current) saveMeta(meta.current) }

  const goLocal = useCallback((why) => {
    clearTimeout(timer.current)
    authRef.current = null
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
    meta.current = { ...meta.current, dirty: false, lastSync: new Date().toISOString() }
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
    if (navigator.onLine === false || err instanceof TypeError) { setStatus('offline'); setMessage('Offline. Your records are safe on this phone and will upload when you are back online.'); schedulePush(30000); return }
    if (err.status === 401) {
      try { await supabase?.auth.signOut() } catch { /* local records are unaffected */ }
      goLocal('Your sign-in expired. Please sign in again. Your records are still on this phone.')
      return
    }
    if (onConflict) { await onConflict(err); return }
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
      const currentCloud = await cloudCopy(a.userId)
      const cloudJSON = currentCloud.data ? JSON.stringify(normalizeData(currentCloud.data)) : ''
      if (cloudJSON && cloudJSON !== lastJSON.current && cloudJSON !== JSON.stringify(sent)) {
        openConflict(currentCloud)
        return
      }
      const { error } = await supabase.from('business_data').upsert(
        { user_id: a.userId, data: sent },
        { onConflict: 'user_id' },
      )
      if (error) throw error
      lastJSON.current = JSON.stringify(sent)
      const stillDirty = JSON.stringify(dataRef.current) !== lastJSON.current
      meta.current = { ...meta.current, dirty: stillDirty, lastSync: new Date().toISOString() }
      persist()
      setLastSync(meta.current.lastSync)
      setMessage('')
      setStatus(stillDirty ? 'syncing' : 'synced')
      if (stillDirty) again.current = true
    } catch (err) {
      await handleError(err)
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
      const server = await cloudCopy(a.userId)
      const cloudJSON = server.data ? JSON.stringify(normalizeData(server.data)) : ''
      if (cloudJSON === lastJSON.current) { setStatus('synced'); setMessage(''); return }
      if (!server.data || !cloudJSON) {
        meta.current = { ...meta.current, dirty: !isEmpty(dataRef.current) }
        lastJSON.current = ''
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
      const server = await cloudCopy(a.userId)
      const local = dataRef.current
      meta.current = { user: a.userId, dirty: false, lastSync: null }
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

  const sessionRequest = useRef(null)
  useEffect(() => {
    let active = true
    if (!supabase) {
      setStatus('error')
      setMessage('Cloud backup is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY, then rebuild the app.')
      return () => { active = false }
    }
    if (initializedSession.current) return () => { active = false }
    if (!sessionRequest.current) sessionRequest.current = supabase.auth.getSession()
    const restoreSession = async () => {
      const { data: result, error } = await sessionRequest.current
      if (!active) return
      initializedSession.current = true
      if (error) { setStatus('error'); setMessage(error.message); return }
      if (!result.session?.user) return
      const a = accountFromUser(result.session.user)
      authRef.current = a
      meta.current = loadMeta(a.userId)
      setLastSync(meta.current.lastSync)
      initializing.current = true
      setAuth(a)
      try { await firstSync(a) } finally { initializing.current = false }
    }
    restoreSession().catch((err) => { if (active) { setStatus('error'); setMessage(err.message) } })
    return () => { active = false }
  }, [firstSync])

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
  const signIn = useCallback(async ({ mode, username, password }) => {
    if (!supabase) throw new Error('Cloud backup is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY, then rebuild the app.')
    const email = username.trim().toLowerCase()
    const result = mode === 'register'
      ? await supabase.auth.signUp({ email, password })
      : await supabase.auth.signInWithPassword({ email, password })
    if (result.error) throw result.error
    if (!result.data.session?.user) throw new Error('Account created. Check your email to confirm the account, then sign in.')
    const a = accountFromUser(result.data.session.user)
    authRef.current = a
    meta.current = loadMeta(a.userId)
    initializing.current = true
    setLastSync(meta.current.lastSync)
    setAuth(a)
    try {
      await firstSync(a)
    } finally {
      initializing.current = false
    }
  }, [firstSync])

  const signOut = useCallback(async () => {
    if (supabase) {
      const { error } = await supabase.auth.signOut()
      if (error) setMessage(error.message)
    }
    goLocal()
    notify('Signed out. Your records stay on this phone.')
  }, [goLocal, notify])

  const changePassword = useCallback(async (oldPassword, newPassword) => {
    const a = authRef.current
    if (!supabase || !a) throw new Error('Please sign in again.')
    const { error: verifyError } = await supabase.auth.signInWithPassword({ email: a.username, password: oldPassword })
    if (verifyError) throw verifyError
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    if (error) throw error
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
        meta.current = { ...meta.current, dirty: true }
        persist()
        lastJSON.current = server.data ? JSON.stringify(normalizeData(server.data)) : ''
        await pushNowRef.current()
      }
    } catch (err) {
      setStatus('error')
      setMessage(err.message)
    }
  }, [applyServerData, conflict, notify])

  return { auth, status, message, lastSync, conflict, signIn, signOut, changePassword, syncNow, resolveConflict }
}
