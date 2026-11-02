const nf = new Intl.NumberFormat('en-NG', { minimumFractionDigits: 0, maximumFractionDigits: 2 })

/** Round to 2 decimal places without floating point surprises. */
export const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100

export const sum = (list, pick = (x) => x) => round2(list.reduce((s, x) => s + (Number(pick(x)) || 0), 0))

export function formatMoney(n) {
  const v = round2(Number.isFinite(Number(n)) ? Number(n) : 0)
  if (v === 0) return '₦0'
  return `${v < 0 ? '-' : ''}₦${nf.format(Math.abs(v))}`
}

export function formatKg(n) {
  const v = round2(Number.isFinite(Number(n)) ? Number(n) : 0)
  return `${nf.format(v)} kg`
}

export const formatNumber = (n) => nf.format(round2(n))

export function formatPercent(n) {
  if (!Number.isFinite(n)) return '0%'
  return `${(Math.round(n * 10) / 10).toFixed(1)}%`
}

/** Turns typed text ("1,250.5") into a number. Empty / invalid -> NaN. */
export function parseNumber(text) {
  if (typeof text === 'number') return text
  const cleaned = String(text ?? '').replace(/,/g, '').trim()
  if (cleaned === '') return NaN
  return Number(cleaned)
}

// Dates are stored as local "YYYY-MM-DD" text.
const pad = (n) => String(n).padStart(2, '0')
export const toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const todayISO = () => toISO(new Date())

export function fromISO(iso) {
  const [y, m, d] = String(iso).split('-').map(Number)
  return new Date(y, m - 1, d)
}

export const isValidISO = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && toISO(fromISO(s)) === s

export function addDays(iso, n) {
  const d = fromISO(iso)
  d.setDate(d.getDate() + n)
  return toISO(d)
}

export const monthKey = (iso) => String(iso).slice(0, 7)
export const monthStart = (iso) => `${monthKey(iso)}-01`

export function monthEnd(iso) {
  const d = fromISO(monthStart(iso))
  d.setMonth(d.getMonth() + 1)
  d.setDate(0)
  return toISO(d)
}

/** First day of the month, `n` months away from the month of `iso`. */
export function addMonths(iso, n) {
  const d = fromISO(monthStart(iso))
  d.setMonth(d.getMonth() + n)
  return toISO(d)
}

export function formatDate(iso) {
  if (!iso) return ''
  return fromISO(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function monthLabel(key, long = false) {
  const d = fromISO(`${key}-01`)
  return long
    ? d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
    : d.toLocaleDateString('en-GB', { month: 'short' })
}

export function greeting(date = new Date()) {
  const h = date.getHours()
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
}

export function longToday(date = new Date()) {
  return date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 9)
