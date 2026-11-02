// Talks to the BottleDesk server. The app works fully without it; this only adds cloud backup and sync.
const AUTH_KEY = 'bottledesk:auth'
const META_KEY = 'bottledesk:sync'
const SERVER_KEY = 'bottledesk:server'

/** Set VITE_API_URL when building the phone app so it already knows where your server is. */
export const BUILD_SERVER = import.meta.env?.VITE_API_URL || ''

export const isNativeApp = () =>
  typeof window !== 'undefined' && Boolean(window.Capacitor?.isNativePlatform?.())

export function normalizeServerUrl(input) {
  let s = String(input || '').trim().replace(/\/+$/, '')
  if (!s) return ''
  if (!/^https?:\/\//i.test(s)) {
    const local = /^(localhost|\d{1,3}(\.\d{1,3}){3})(:\d+)?(\/|$)/i.test(s)
    s = `${local ? 'http' : 'https'}://${s}`
  }
  return s
}

export class ApiError extends Error {
  constructor(message, status = 0, body = null) {
    super(message)
    this.status = status
    this.body = body
  }
}

export async function request(server, method, path, { token, body, timeout = 20000 } = {}) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeout)
  let res
  try {
    res = await fetch(`${server}${path}`, {
      method,
      headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    })
  } catch (err) {
    throw new ApiError(
      err.name === 'AbortError'
        ? 'The server took too long to answer.'
        : "Can't reach the server. Check your internet and the server address.",
      0,
    )
  } finally {
    clearTimeout(timer)
  }
  let json = null
  try { json = await res.json() } catch { /* not JSON */ }
  if (!res.ok) throw new ApiError(json?.error || `Server problem (${res.status}).`, res.status, json)
  return json
}

const safeGet = (key) => { try { return JSON.parse(localStorage.getItem(key)) } catch { return null } }
const safeSet = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* ignore */ } }

export const loadAuth = () => {
  const a = safeGet(AUTH_KEY)
  return a && a.token && a.username ? a : null
}
export const saveAuth = (auth) => safeSet(AUTH_KEY, auth)
export const clearAuth = () => { try { localStorage.removeItem(AUTH_KEY); localStorage.removeItem(META_KEY) } catch { /* ignore */ } }

export const loadMeta = (username) => {
  const m = safeGet(META_KEY)
  return m && m.user === username ? m : { user: username, baseVersion: 0, dirty: false, lastSync: null }
}
export const saveMeta = (meta) => safeSet(META_KEY, meta)

export const lastServer = () => { try { return localStorage.getItem(SERVER_KEY) || '' } catch { return '' } }
export const rememberServer = (s) => { try { localStorage.setItem(SERVER_KEY, s) } catch { /* ignore */ } }
