import { STORAGE_KEY, DATA_VERSION, DEFAULT_BOTTLE_TYPES, LEGACY_TYPE_NAMES, emptyData } from './constants.js'
import { round2, uid } from './format.js'
import { validateData } from './calc.js'

const str = (v) => (v == null ? '' : String(v)).trim()
const typeName = (v) => LEGACY_TYPE_NAMES[str(v)] || str(v)
const arr = (v) => (Array.isArray(v) ? v : [])
const num = (v) => (v === '' || v == null ? NaN : round2(Number(v)))

const cleanParty = (p) => ({
  id: str(p?.id) || uid(), name: str(p?.name), phone: str(p?.phone), location: str(p?.location),
  note: str(p?.note), createdAt: Number(p?.createdAt) || 0,
})
const cleanTxn = (t) => ({
  id: str(t?.id) || uid(), date: str(t?.date), partyId: str(t?.partyId) || null, type: typeName(t?.type),
  kg: num(t?.kg), pricePerKg: num(t?.pricePerKg), paid: num(t?.paid), note: str(t?.note), createdAt: Number(t?.createdAt) || 0,
})
const cleanPayment = (p) => ({
  id: str(p?.id) || uid(), kind: str(p?.kind), partyId: str(p?.partyId), amount: num(p?.amount),
  date: str(p?.date), note: str(p?.note), createdAt: Number(p?.createdAt) || 0,
})
const cleanExpense = (e) => ({
  id: str(e?.id) || uid(), date: str(e?.date), category: str(e?.category), description: str(e?.description),
  amount: num(e?.amount), createdAt: Number(e?.createdAt) || 0,
})
const cleanAdjustment = (a) => ({
  id: str(a?.id) || uid(), date: str(a?.date), type: typeName(a?.type), kg: num(a?.kg), reason: str(a?.reason),
  note: str(a?.note), createdAt: Number(a?.createdAt) || 0,
})

/** Makes any loaded / imported object safe to use. Throws a friendly Error if it is not BottleDesk data. */
export function normalizeData(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('This file is not a BottleDesk backup.')
  const base = emptyData()
  const s = { ...base.settings, ...(raw.settings && typeof raw.settings === 'object' ? raw.settings : {}) }

  const types = [...new Set(arr(s.bottleTypes).map(typeName).filter(Boolean))]
  const out = {
    version: DATA_VERSION,
    settings: {
      businessName: str(s.businessName) || base.settings.businessName,
      ownerName: str(s.ownerName),
      defaultBuyPrice: Number(s.defaultBuyPrice) > 0 ? round2(Number(s.defaultBuyPrice)) : base.settings.defaultBuyPrice,
      openingCash: Number.isFinite(Number(s.openingCash)) ? round2(Number(s.openingCash)) : 0,
      lowStockKg: Number(s.lowStockKg) >= 0 ? Number(s.lowStockKg) : base.settings.lowStockKg,
      bottleTypes: types.length ? types : [...DEFAULT_BOTTLE_TYPES],
    },
    suppliers: arr(raw.suppliers).map(cleanParty),
    buyers: arr(raw.buyers).map(cleanParty),
    purchases: arr(raw.purchases).map(cleanTxn),
    sales: arr(raw.sales).map(cleanTxn),
    payments: arr(raw.payments).map(cleanPayment),
    expenses: arr(raw.expenses).map(cleanExpense),
    adjustments: arr(raw.adjustments).map(cleanAdjustment),
  }
  // Make sure every bottle type used in a record is also in the settings list.
  for (const t of [...out.purchases, ...out.sales, ...out.adjustments]) {
    if (t.type && !out.settings.bottleTypes.includes(t.type)) out.settings.bottleTypes.push(t.type)
  }
  return out
}

export function loadData() {
  let raw = null
  try {
    raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { data: emptyData(), warning: '' }
    const data = normalizeData(JSON.parse(raw))
    const problem = validateData(data)
    if (problem) throw new Error(problem)
    return { data, warning: '' }
  } catch (err) {
    // Never silently throw away someone's records: keep a copy of what we could not read.
    try {
      if (raw) localStorage.setItem(`${STORAGE_KEY}:unreadable-backup`, raw)
    } catch { /* ignore */ }
    return {
      data: emptyData(),
      warning: `Your saved data could not be read (${err.message}). A copy was kept in this browser, and you can start fresh or import a backup.`,
    }
  }
}

export function saveData(data) {
  try {
    const text = JSON.stringify(data)
    localStorage.setItem(STORAGE_KEY, text)
    return { ok: true, text }
  } catch {
    return { ok: false, text: '' }
  }
}

export function exportJSON(data) {
  return JSON.stringify({ app: 'bottledesk', version: DATA_VERSION, exportedAt: new Date().toISOString(), data }, null, 2)
}

/** Reads a backup file's text. Returns clean data or throws a friendly Error. */
export function parseImport(text) {
  let parsed
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error('That file could not be read. Choose a .json backup made by BottleDesk.')
  }
  const data = normalizeData(parsed && parsed.app === 'bottledesk' ? parsed.data : parsed)
  const problem = validateData(data)
  if (problem) throw new Error(`The backup has a problem: ${problem}`)
  return data
}
