// BottleDesk server: accounts + cloud backup/sync API, and it also serves the web app.
// No packages to install: this uses only what comes with Node.js.
import http from 'node:http'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createDb } from './db.js'
import { normalizeData } from '../src/lib/storage.js'
import { validateData } from '../src/lib/calc.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const MAX_BODY = 8 * 1024 * 1024
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8', '.map': 'application/json',
}

export function createServer(opts = {}) {
  const dataDir = opts.dataDir || process.env.DATA_DIR || path.join(HERE, '..', 'server-data')
  const staticDir = opts.staticDir ?? process.env.STATIC_DIR ?? path.join(HERE, '..', 'dist')
  const allowRegistration = opts.allowRegistration ?? process.env.ALLOW_REGISTRATION !== 'false'
  const trustProxy = opts.trustProxy ?? process.env.TRUST_PROXY === '1'
  const db = createDb(dataDir)

  // ---- simple brute-force protection (kept in memory) ----
  const failures = new Map()
  const registrations = new Map()
  const bump = (map, key, windowMs) => {
    const t = Date.now()
    const e = map.get(key)
    if (!e || t - e.first > windowMs) { const n = { count: 1, first: t }; map.set(key, n); return n }
    e.count++
    return e
  }
  const blockedFor = (map, key, max, windowMs) => {
    const e = map.get(key)
    if (!e) return 0
    const left = e.first + windowMs - Date.now()
    if (left <= 0) { map.delete(key); return 0 }
    return e.count >= max ? left : 0
  }
  const ipOf = (req) => (trustProxy && req.headers['x-forwarded-for'] ? String(req.headers['x-forwarded-for']).split(',')[0].trim() : req.socket.remoteAddress) || 'unknown'

  const send = (res, status, body, extra = {}) => {
    const text = JSON.stringify(body)
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extra })
    res.end(text)
  }
  const fail = (res, status, error, extra) => send(res, status, { error }, extra)

  const readBody = (req) =>
    new Promise((resolve, reject) => {
      let size = 0
      const chunks = []
      req.on('data', (c) => {
        size += c.length
        if (size > MAX_BODY) { reject(Object.assign(new Error('That is too much data.'), { status: 413 })); req.destroy(); return }
        chunks.push(c)
      })
      req.on('end', () => {
        try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}) }
        catch { reject(Object.assign(new Error('Request was not valid JSON.'), { status: 400 })) }
      })
      req.on('error', reject)
    })

  const authUser = (req) => {
    const h = req.headers.authorization || ''
    const token = h.startsWith('Bearer ') ? h.slice(7).trim() : ''
    const user = db.getSession(token)
    return user ? { user, token } : null
  }

  const cleanUsername = (v) => String(v ?? '').trim()
  const usernameError = (u) => (u.length < 3 || u.length > 64 ? 'Username must be 3 to 64 characters (a phone number or email works well).' : /[\u0000-\u001f]/.test(u) ? 'Username has invalid characters.' : '')
  const passwordError = (p) => (typeof p !== 'string' || p.length < 6 ? 'Password must be at least 6 characters.' : p.length > 128 ? 'Password is too long.' : '')

  async function api(req, res, url) {
    const route = `${req.method} ${url.pathname}`

    if (route === 'GET /api/health') return send(res, 200, { ok: true, name: 'bottledesk', registration: allowRegistration, time: new Date().toISOString() })

    if (route === 'POST /api/register') {
      if (!allowRegistration) return fail(res, 403, 'New accounts are switched off on this server.')
      const ip = ipOf(req)
      const wait = blockedFor(registrations, ip, 10, 3600000)
      if (wait) return fail(res, 429, 'Too many new accounts from this connection. Try again later.')
      const body = await readBody(req)
      const username = cleanUsername(body.username)
      const err = usernameError(username) || passwordError(body.password)
      if (err) return fail(res, 400, err)
      const user = db.createUser(username, body.password)
      if (!user) return fail(res, 409, 'That username is already taken. Sign in instead, or pick another.')
      bump(registrations, ip, 3600000)
      return send(res, 201, { token: db.createSession(user.id), user: { username: user.username } })
    }

    if (route === 'POST /api/login') {
      const body = await readBody(req)
      const username = cleanUsername(body.username)
      const key = `${ipOf(req)}|${username.toLowerCase()}`
      const wait = blockedFor(failures, key, 5, 900000)
      if (wait) return fail(res, 429, `Too many wrong attempts. Try again in ${Math.ceil(wait / 60000)} minute(s).`, { 'Retry-After': String(Math.ceil(wait / 1000)) })
      const user = typeof body.password === 'string' ? db.verifyUser(username, body.password) : null
      if (!user) { bump(failures, key, 900000); return fail(res, 401, 'Wrong username or password.') }
      failures.delete(key)
      return send(res, 200, { token: db.createSession(user.id), user: { username: user.username } })
    }

    // everything below needs a signed-in user
    const auth = authUser(req)
    if (!auth) return fail(res, 401, 'Please sign in again.')

    if (route === 'GET /api/me') return send(res, 200, { user: { username: auth.user.username } })

    if (route === 'POST /api/logout') { db.revokeSession(auth.token); return send(res, 200, { ok: true }) }

    if (route === 'POST /api/password') {
      const body = await readBody(req)
      if (!db.verifyUser(auth.user.username, String(body.oldPassword ?? ''))) return fail(res, 403, 'Your current password is wrong.')
      const err = passwordError(body.newPassword)
      if (err) return fail(res, 400, err)
      db.changePassword(auth.user.id, body.newPassword, auth.token)
      return send(res, 200, { ok: true })
    }

    if (route === 'GET /api/data') return send(res, 200, db.getData(auth.user.id))

    if (route === 'PUT /api/data') {
      const body = await readBody(req)
      if (!Number.isInteger(body.baseVersion) || body.baseVersion < 0) return fail(res, 400, 'baseVersion is missing.')
      let data
      try {
        data = normalizeData(body.data)
        const problem = validateData(data)
        if (problem) return fail(res, 422, `These records don't add up: ${problem}`)
      } catch (err) {
        return fail(res, 422, err.message)
      }
      const result = db.putData(auth.user.id, body.baseVersion, data)
      if (result.conflict) return send(res, 409, { error: 'The cloud copy changed since you last synced.', version: result.version })
      return send(res, 200, { version: result.version, updatedAt: result.updatedAt })
    }

    return fail(res, 404, 'Not found.')
  }

  function serveStatic(req, res, url) {
    if (!staticDir || !fs.existsSync(staticDir)) {
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' })
      return res.end('BottleDesk server is running. The web app has not been built yet (run: npm run build).')
    }
    const root = path.resolve(staticDir)
    let rel = decodeURIComponent(url.pathname)
    if (rel.endsWith('/')) rel += 'index.html'
    let file = path.resolve(root, '.' + path.sep + rel)
    if (file !== root && !file.startsWith(root + path.sep)) { res.writeHead(403); return res.end('Forbidden') }
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      if (path.extname(rel)) { res.writeHead(404); return res.end('Not found') }
      file = path.join(root, 'index.html')
    }
    const ext = path.extname(file).toLowerCase()
    const hashed = /[\\/]assets[\\/]/.test(file)
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': hashed ? 'public, max-age=31536000, immutable' : 'no-cache',
      'X-Content-Type-Options': 'nosniff',
    })
    if (req.method === 'HEAD') return res.end()
    fs.createReadStream(file).pipe(res)
  }

  const server = http.createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS')
    res.setHeader('Access-Control-Max-Age', '86400')
    if (req.method === 'OPTIONS') { res.writeHead(204); return res.end() }
    try {
      const url = new URL(req.url, 'http://localhost')
      if (url.pathname.startsWith('/api/')) return await api(req, res, url)
      if (req.method === 'GET' || req.method === 'HEAD') return serveStatic(req, res, url)
      res.writeHead(405); res.end('Method not allowed')
    } catch (err) {
      if (!res.headersSent) fail(res, err.status || 500, err.status ? err.message : 'Something went wrong on the server.')
      if (!err.status) console.error('Server error:', err)
    }
  })
  server.requestTimeout = 30000
  server.db = db
  return server
}

// ---- start when run directly: node server/index.js ----
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const port = Number(process.env.PORT) || 3000
  const host = process.env.HOST || '0.0.0.0'
  const server = createServer()
  server.listen(port, host, () => {
    console.log('\nBottleDesk is running.\n')
    console.log(`  On this computer:   http://localhost:${port}`)
    const lan = Object.values(os.networkInterfaces()).flat().filter((i) => i && i.family === 'IPv4' && !i.internal)
    for (const i of lan) console.log(`  On your phone (same Wi-Fi):  http://${i.address}:${port}`)
    console.log(`\n  Data is stored in: ${process.env.DATA_DIR || path.join(HERE, '..', 'server-data')}`)
    console.log('  Press Ctrl+C to stop.\n')
  })
  for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => server.close(() => process.exit(0)))
}
