import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createServer } from '../server/index.js'
import { generateSample } from '../src/lib/sample.js'
import { emptyData } from '../src/lib/constants.js'

let server, base, dir
const call = async (method, url, { token, body } = {}) => {
  const res = await fetch(base + url, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  let json = null
  try { json = await res.json() } catch { /* not json */ }
  return { status: res.status, json, headers: res.headers }
}

before(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bd-'))
  server = createServer({ dataDir: dir, staticDir: null })
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  base = `http://127.0.0.1:${server.address().port}`
})
after(() => { server.close(); fs.rmSync(dir, { recursive: true, force: true }) })

test('health check and CORS', async () => {
  const r = await call('GET', '/api/health')
  assert.equal(r.status, 200)
  assert.equal(r.json.ok, true)
  assert.equal(r.headers.get('access-control-allow-origin'), '*')
  const pre = await fetch(base + '/api/data', { method: 'OPTIONS' })
  assert.equal(pre.status, 204)
})

test('register, duplicate, validation, login, wrong password', async () => {
  let r = await call('POST', '/api/register', { body: { username: 'ada@example.com', password: 'secret1' } })
  assert.equal(r.status, 201)
  assert.ok(r.json.token.length > 40)
  r = await call('POST', '/api/register', { body: { username: 'ADA@example.com', password: 'secret1' } })
  assert.equal(r.status, 409)
  r = await call('POST', '/api/register', { body: { username: 'ab', password: 'secret1' } })
  assert.equal(r.status, 400)
  r = await call('POST', '/api/register', { body: { username: 'bola', password: '123' } })
  assert.equal(r.status, 400)
  r = await call('POST', '/api/login', { body: { username: 'Ada@Example.com', password: 'secret1' } })
  assert.equal(r.status, 200)
  r = await call('POST', '/api/login', { body: { username: 'ada@example.com', password: 'nope' } })
  assert.equal(r.status, 401)
})

test('passwords are never stored in plain text', () => {
  const raw = fs.readFileSync(path.join(dir, 'users.json'), 'utf8')
  assert.ok(!raw.includes('secret1'))
  assert.match(raw, /"hash":"[0-9a-f]{128}"/)
})

test('data needs a valid token', async () => {
  assert.equal((await call('GET', '/api/data')).status, 401)
  assert.equal((await call('GET', '/api/data', { token: 'x'.repeat(64) })).status, 401)
})

test('save, load, version conflict, invalid data, backup copy', async () => {
  const { json: { token } } = await call('POST', '/api/login', { body: { username: 'ada@example.com', password: 'secret1' } })
  let r = await call('GET', '/api/data', { token })
  assert.deepEqual([r.json.version, r.json.data], [0, null])

  const sample = generateSample('2026-08-25')
  r = await call('PUT', '/api/data', { token, body: { baseVersion: 0, data: sample } })
  assert.equal(r.status, 200)
  assert.equal(r.json.version, 1)

  r = await call('GET', '/api/data', { token })
  assert.equal(r.json.version, 1)
  assert.equal(r.json.data.purchases.length, sample.purchases.length)

  // a second device that still thinks version is 0 must be refused
  r = await call('PUT', '/api/data', { token, body: { baseVersion: 0, data: emptyData() } })
  assert.equal(r.status, 409)
  assert.equal(r.json.version, 1)

  // records that do not add up are refused (sell bottles that were never bought)
  const bad = emptyData()
  bad.buyers.push({ id: 'b', name: 'X' })
  bad.sales.push({ id: 's', date: '2026-01-01', partyId: 'b', type: 'Clear', kg: 5, pricePerKg: 300, paid: 0 })
  r = await call('PUT', '/api/data', { token, body: { baseVersion: 1, data: bad } })
  assert.equal(r.status, 422)
  assert.match(r.json.error, /Not enough/)

  r = await call('PUT', '/api/data', { token, body: { baseVersion: 1, data: emptyData() } })
  assert.equal(r.status, 200)
  assert.equal(r.json.version, 2)
  const files = fs.readdirSync(path.join(dir, 'data'))
  assert.ok(files.some((f) => f.endsWith('.bak')), 'previous copy kept')
})

test("one user cannot see another user's data", async () => {
  const a = (await call('POST', '/api/login', { body: { username: 'ada@example.com', password: 'secret1' } })).json.token
  const b = (await call('POST', '/api/register', { body: { username: 'chidi', password: 'password9' } })).json.token
  assert.equal((await call('GET', '/api/data', { token: b })).json.version, 0)
  assert.ok((await call('GET', '/api/data', { token: a })).json.version >= 1)
})

test('change password and logout', async () => {
  const t1 = (await call('POST', '/api/login', { body: { username: 'chidi', password: 'password9' } })).json.token
  const t2 = (await call('POST', '/api/login', { body: { username: 'chidi', password: 'password9' } })).json.token
  let r = await call('POST', '/api/password', { token: t1, body: { oldPassword: 'wrong', newPassword: 'newpass77' } })
  assert.equal(r.status, 403)
  r = await call('POST', '/api/password', { token: t1, body: { oldPassword: 'password9', newPassword: 'newpass77' } })
  assert.equal(r.status, 200)
  assert.equal((await call('GET', '/api/me', { token: t1 })).status, 200)
  assert.equal((await call('GET', '/api/me', { token: t2 })).status, 401, 'other sessions signed out')
  assert.equal((await call('POST', '/api/login', { body: { username: 'chidi', password: 'newpass77' } })).status, 200)
  await call('POST', '/api/logout', { token: t1 })
  assert.equal((await call('GET', '/api/me', { token: t1 })).status, 401)
})

test('repeated wrong passwords get locked out', async () => {
  let last
  for (let i = 0; i < 6; i++) last = await call('POST', '/api/login', { body: { username: 'victim', password: 'x' + i } })
  assert.equal(last.status, 429)
})

test('bad input is handled, not crashed', async () => {
  const res = await fetch(base + '/api/login', { method: 'POST', body: '{not json' })
  assert.equal(res.status, 400)
  assert.equal((await call('GET', '/api/nothing')).status, 401)
  assert.equal((await call('GET', '/api/health')).status, 200)
})

test('can switch registration off', async () => {
  const d2 = fs.mkdtempSync(path.join(os.tmpdir(), 'bd2-'))
  const s2 = createServer({ dataDir: d2, staticDir: null, allowRegistration: false })
  await new Promise((r) => s2.listen(0, '127.0.0.1', r))
  const res = await fetch(`http://127.0.0.1:${s2.address().port}/api/register`, { method: 'POST', body: JSON.stringify({ username: 'abc', password: 'abcdef' }) })
  assert.equal(res.status, 403)
  s2.close(); fs.rmSync(d2, { recursive: true, force: true })
})

test('serves the web app and blocks path tricks', async () => {
  const d3 = fs.mkdtempSync(path.join(os.tmpdir(), 'bd3-'))
  const web = fs.mkdtempSync(path.join(os.tmpdir(), 'web-'))
  fs.writeFileSync(path.join(web, 'index.html'), '<h1>app</h1>')
  fs.writeFileSync(path.join(d3, 'secret.txt'), 'nope')
  const s3 = createServer({ dataDir: path.join(d3, 'db'), staticDir: web })
  await new Promise((r) => s3.listen(0, '127.0.0.1', r))
  const b3 = `http://127.0.0.1:${s3.address().port}`
  assert.equal(await (await fetch(b3 + '/')).text(), '<h1>app</h1>')
  assert.equal(await (await fetch(b3 + '/some/page')).text(), '<h1>app</h1>')
  assert.equal((await fetch(b3 + '/missing.js')).status, 404)
  const raw = await new Promise((resolve) => {
    import('node:net').then(({ default: net }) => {
      const sock = net.connect(s3.address().port, '127.0.0.1', () => sock.write('GET /../../secret.txt HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n'))
      let buf = ''
      sock.on('data', (c) => (buf += c))
      sock.on('end', () => resolve(buf))
    })
  })
  assert.ok(!raw.includes('nope'))
  s3.close(); fs.rmSync(d3, { recursive: true, force: true }); fs.rmSync(web, { recursive: true, force: true })
})
