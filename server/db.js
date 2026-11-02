// A tiny file-based database. One folder, a few JSON files, no extra software needed.
//   users.json      accounts (passwords are stored as salted scrypt hashes, never as text)
//   sessions.json   sign-in tokens (only a hash of each token is stored)
//   data/<id>.json  each account's business records (+ a .bak copy of the previous save)
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

const SESSION_DAYS = 90
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex')

export function createDb(dir) {
  const dataDir = path.join(dir, 'data')
  fs.mkdirSync(dataDir, { recursive: true })
  const usersFile = path.join(dir, 'users.json')
  const sessionsFile = path.join(dir, 'sessions.json')

  const read = (file, fallback) => {
    try {
      return JSON.parse(fs.readFileSync(file, 'utf8'))
    } catch (err) {
      if (err.code === 'ENOENT') return fallback
      throw new Error(`Could not read ${path.basename(file)}: ${err.message}`)
    }
  }
  // Write to a temporary file first, then rename, so a crash can never leave a half-written file.
  const write = (file, obj) => {
    const tmp = `${file}.tmp`
    fs.writeFileSync(tmp, JSON.stringify(obj))
    fs.renameSync(tmp, file)
  }

  const users = read(usersFile, { byName: {} })
  const sessions = read(sessionsFile, {})
  const now = () => Date.now()
  let pruned = false
  for (const [k, s] of Object.entries(sessions)) {
    if (s.expires < now()) { delete sessions[k]; pruned = true }
  }
  if (pruned) write(sessionsFile, sessions)

  const hashPassword = (password, salt) => crypto.scryptSync(password, salt, 64).toString('hex')
  const dataFile = (userId) => path.join(dataDir, `${userId}.json`)

  return {
    userCount: () => Object.keys(users.byName).length,

    createUser(username, password) {
      const key = username.toLowerCase()
      if (users.byName[key]) return null
      const salt = crypto.randomBytes(16).toString('hex')
      const user = { id: crypto.randomUUID(), username, salt, hash: hashPassword(password, salt), createdAt: now() }
      users.byName[key] = user
      write(usersFile, users)
      return { id: user.id, username: user.username }
    },

    verifyUser(username, password) {
      const user = users.byName[username.toLowerCase()]
      // Do the same amount of work whether or not the user exists, so timing reveals nothing.
      const salt = user ? user.salt : '00'.repeat(16)
      const attempt = Buffer.from(hashPassword(password, salt), 'hex')
      const real = Buffer.from(user ? user.hash : '00'.repeat(64), 'hex')
      if (!user || !crypto.timingSafeEqual(attempt, real)) return null
      return { id: user.id, username: user.username }
    },

    changePassword(userId, newPassword, keepToken) {
      const user = Object.values(users.byName).find((u) => u.id === userId)
      if (!user) return false
      user.salt = crypto.randomBytes(16).toString('hex')
      user.hash = hashPassword(newPassword, user.salt)
      write(usersFile, users)
      const keep = keepToken ? sha256(keepToken) : null
      for (const [k, s] of Object.entries(sessions)) if (s.userId === userId && k !== keep) delete sessions[k]
      write(sessionsFile, sessions)
      return true
    },

    createSession(userId) {
      const token = crypto.randomBytes(32).toString('hex')
      sessions[sha256(token)] = { userId, created: now(), expires: now() + SESSION_DAYS * 86400000 }
      write(sessionsFile, sessions)
      return token
    },

    getSession(token) {
      if (!token) return null
      const s = sessions[sha256(token)]
      if (!s || s.expires < now()) return null
      const user = Object.values(users.byName).find((u) => u.id === s.userId)
      return user ? { id: user.id, username: user.username } : null
    },

    revokeSession(token) {
      if (sessions[sha256(token)]) {
        delete sessions[sha256(token)]
        write(sessionsFile, sessions)
      }
    },

    getData(userId) {
      return read(dataFile(userId), { version: 0, updatedAt: null, data: null })
    },

    /** Saves only if the caller has seen the latest version, so two phones can't silently overwrite each other. */
    putData(userId, baseVersion, data) {
      const current = this.getData(userId)
      if (baseVersion !== current.version) return { conflict: true, version: current.version }
      const file = dataFile(userId)
      if (fs.existsSync(file)) fs.copyFileSync(file, `${file}.bak`)
      const next = { version: current.version + 1, updatedAt: new Date().toISOString(), data }
      write(file, next)
      return { conflict: false, version: next.version, updatedAt: next.updatedAt }
    },
  }
}
