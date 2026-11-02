import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { STORAGE_KEY, emptyData } from '../lib/constants.js'
import { loadData, saveData, normalizeData } from '../lib/storage.js'
import { validateData } from '../lib/calc.js'
import { round2, uid } from '../lib/format.js'

const PARTY_KEY = { supplier: 'suppliers', buyer: 'buyers' }
const TXN_KEY = { purchase: 'purchases', sale: 'sales' }
const PARTY_OF_TXN = { purchase: 'supplier', sale: 'buyer' }
const trim = (v) => String(v ?? '').trim()

export function useStore() {
  const initial = useMemo(() => loadData(), [])
  const [data, setData] = useState(initial.data)
  const [loadWarning, setLoadWarning] = useState(initial.warning)
  const [saveFailed, setSaveFailed] = useState(false)
  const ref = useRef(initial.data)
  const lastSaved = useRef('')

  // Every change goes through here: build the new data, check it is consistent, then commit.
  const apply = useCallback((producer) => {
    let next
    try {
      next = producer(ref.current)
    } catch (err) {
      return { ok: false, error: err.message }
    }
    const error = validateData(next)
    if (error) return { ok: false, error }
    ref.current = next
    setData(next)
    return { ok: true }
  }, [])

  // Save to the browser after each change.
  useEffect(() => {
    const res = saveData(data)
    if (res.ok) lastSaved.current = res.text
    setSaveFailed(!res.ok)
  }, [data])

  // Keep two open tabs in sync so one tab can't overwrite the other with old data.
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key !== STORAGE_KEY || e.newValue === lastSaved.current) return
      try {
        const next = e.newValue ? normalizeData(JSON.parse(e.newValue)) : emptyData()
        ref.current = next
        setData(next)
      } catch { /* ignore unreadable data from another tab */ }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const actions = useMemo(() => {
    const makeParty = (kind, form, existing) => {
      const name = trim(form.name)
      if (!name) throw new Error('Please enter a name.')
      return {
        id: existing?.id || uid(), name, phone: trim(form.phone), location: trim(form.location),
        note: trim(form.note), createdAt: existing?.createdAt || Date.now(),
      }
    }
    const assertNameFree = (list, name, exceptId, kind) => {
      if (list.some((p) => p.id !== exceptId && p.name.toLowerCase() === name.toLowerCase())) {
        throw new Error(`There is already a ${kind} called "${name}". Pick them from the list instead.`)
      }
    }

    return {
      // ----- purchases & sales -----
      saveTransaction: (kind, form, id, newParty) =>
        apply((d) => {
          const listKey = TXN_KEY[kind]
          const partyKey = PARTY_KEY[PARTY_OF_TXN[kind]]
          let parties = d[partyKey]
          let partyId = form.partyId || null
          if (newParty) {
            const p = makeParty(PARTY_OF_TXN[kind], newParty)
            assertNameFree(parties, p.name, null, PARTY_OF_TXN[kind])
            parties = [...parties, p]
            partyId = p.id
          }
          const existing = id ? d[listKey].find((x) => x.id === id) : null
          const record = {
            id: existing?.id || uid(), date: form.date, partyId, type: form.type,
            kg: round2(form.kg), pricePerKg: round2(form.pricePerKg), paid: round2(form.paid),
            note: trim(form.note), createdAt: existing?.createdAt || Date.now(),
          }
          const list = existing ? d[listKey].map((x) => (x.id === id ? record : x)) : [...d[listKey], record]
          return { ...d, [partyKey]: parties, [listKey]: list }
        }),

      deleteTransaction: (kind, id) =>
        apply((d) => ({ ...d, [TXN_KEY[kind]]: d[TXN_KEY[kind]].filter((x) => x.id !== id) })),

      // ----- suppliers & buyers -----
      saveParty: (kind, form, id) =>
        apply((d) => {
          const key = PARTY_KEY[kind]
          const existing = id ? d[key].find((p) => p.id === id) : null
          const party = makeParty(kind, form, existing)
          assertNameFree(d[key], party.name, id, kind)
          return { ...d, [key]: existing ? d[key].map((p) => (p.id === id ? party : p)) : [...d[key], party] }
        }),

      deleteParty: (kind, id) =>
        apply((d) => {
          const key = PARTY_KEY[kind]
          const used =
            d[TXN_KEY[kind === 'supplier' ? 'purchase' : 'sale']].filter((t) => t.partyId === id).length +
            d.payments.filter((p) => p.kind === kind && p.partyId === id).length
          if (used > 0) {
            throw new Error(`This ${kind} has ${used} record${used === 1 ? '' : 's'} in your books, so they can't be deleted. You can edit their details instead.`)
          }
          return { ...d, [key]: d[key].filter((p) => p.id !== id) }
        }),

      // ----- payments to suppliers / from buyers -----
      addPayment: (kind, partyId, form) =>
        apply((d) => ({
          ...d,
          payments: [...d.payments, {
            id: uid(), kind, partyId, amount: round2(form.amount), date: form.date, note: trim(form.note), createdAt: Date.now(),
          }],
        })),
      deletePayment: (id) => apply((d) => ({ ...d, payments: d.payments.filter((p) => p.id !== id) })),

      // ----- expenses -----
      saveExpense: (form, id) =>
        apply((d) => {
          const existing = id ? d.expenses.find((e) => e.id === id) : null
          const rec = {
            id: existing?.id || uid(), date: form.date, category: form.category, description: trim(form.description),
            amount: round2(form.amount), createdAt: existing?.createdAt || Date.now(),
          }
          return { ...d, expenses: existing ? d.expenses.map((e) => (e.id === id ? rec : e)) : [...d.expenses, rec] }
        }),
      deleteExpense: (id) => apply((d) => ({ ...d, expenses: d.expenses.filter((e) => e.id !== id) })),

      // ----- stock write-offs -----
      addAdjustment: (form) =>
        apply((d) => ({
          ...d,
          adjustments: [...d.adjustments, {
            id: uid(), date: form.date, type: form.type, kg: round2(form.kg), reason: form.reason, note: trim(form.note),
            createdAt: Date.now(),
          }],
        })),
      deleteAdjustment: (id) => apply((d) => ({ ...d, adjustments: d.adjustments.filter((a) => a.id !== id) })),

      // ----- settings & whole-data operations -----
      saveSettings: (patch) => apply((d) => ({ ...d, settings: { ...d.settings, ...patch } })),
      replaceAll: (next) => apply(() => next),
      dismissWarning: () => setLoadWarning(''),
    }
  }, [apply])

  return { data, actions, loadWarning, saveFailed }
}
