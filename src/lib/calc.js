import {
  round2, sum, isValidISO, formatDate, formatMoney, formatKg,
  monthKey, monthStart, monthEnd, addMonths, todayISO,
} from './format.js'

const EPS = 0.005
const KIND_ORDER = { purchase: 0, sale: 1, adjustment: 2 }

export const txnTotal = (t) => round2(t.kg * t.pricePerKg)

function compareEvents(a, b) {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1
  if (a.kind !== b.kind) return KIND_ORDER[a.kind] - KIND_ORDER[b.kind]
  if ((a.createdAt || 0) !== (b.createdAt || 0)) return (a.createdAt || 0) - (b.createdAt || 0)
  return String(a.id).localeCompare(String(b.id))
}

/**
 * Walks every purchase, sale and write-off in date order and keeps a running stock per bottle type.
 * Cost of goods sold uses the WEIGHTED AVERAGE cost of the stock at that moment, so profit only
 * counts the cost of bottles that were actually sold.
 */
export function buildLedger(data) {
  const events = [
    ...data.purchases.map((p) => ({ ...p, kind: 'purchase' })),
    ...data.sales.map((s) => ({ ...s, kind: 'sale' })),
    ...data.adjustments.map((a) => ({ ...a, kind: 'adjustment' })),
  ].sort(compareEvents)

  const types = {}
  for (const t of data.settings.bottleTypes) types[t] = { kg: 0, value: 0, lastAvg: 0 }

  const saleCost = {}
  const adjustmentCost = {}
  const movements = []
  const problems = []
  let running = 0

  for (const e of events) {
    if (!types[e.type]) types[e.type] = { kg: 0, value: 0, lastAvg: 0 }
    const t = types[e.type]

    if (e.kind === 'purchase') {
      const total = txnTotal(e)
      t.kg = round2(t.kg + e.kg)
      t.value = round2(t.value + total)
      t.lastAvg = t.kg > 0 ? t.value / t.kg : t.lastAvg
      running = round2(running + e.kg)
      movements.push({ id: e.id, kind: 'purchase', date: e.date, type: e.type, partyId: e.partyId, kgChange: e.kg, running, value: total })
    } else {
      const avg = t.kg > 0 ? t.value / t.kg : t.lastAvg
      if (e.kg > t.kg + EPS) {
        problems.push({ id: e.id, kind: e.kind, type: e.type, date: e.date, short: round2(e.kg - Math.max(t.kg, 0)) })
      }
      const takesAll = Math.abs(t.kg - e.kg) < EPS
      const cost = takesAll ? t.value : round2(e.kg * avg)
      t.kg = round2(t.kg - e.kg)
      t.value = takesAll ? 0 : round2(t.value - cost)
      if (t.kg > 0) t.lastAvg = t.value / t.kg
      if (e.kind === 'sale') saleCost[e.id] = cost
      else adjustmentCost[e.id] = cost
      running = round2(running - e.kg)
      movements.push({
        id: e.id, kind: e.kind, date: e.date, type: e.type, partyId: e.partyId || null,
        kgChange: -e.kg, running, value: e.kind === 'sale' ? txnTotal(e) : cost, reason: e.reason,
      })
    }
  }

  const stock = {}
  for (const [type, t] of Object.entries(types)) {
    stock[type] = { kg: t.kg, value: t.value, avgCost: t.kg > 0 ? round2(t.value / t.kg) : 0 }
  }
  const totalKg = sum(Object.values(stock), (s) => s.kg)
  const totalValue = sum(Object.values(stock), (s) => s.value)

  return { stock, totalKg, totalValue, saleCost, adjustmentCost, movements, problems }
}

/**
 * Per supplier / buyer statement. Payments made later are matched to the oldest unpaid
 * transactions first, so every transaction gets a Paid / Partial / Unpaid status.
 */
export function partyStatements(data, kind) {
  const txns = kind === 'supplier' ? data.purchases : data.sales
  const parties = kind === 'supplier' ? data.suppliers : data.buyers
  const payments = data.payments.filter((p) => p.kind === kind)
  const out = {}

  for (const party of parties) {
    const mine = txns
      .filter((t) => t.partyId === party.id)
      .sort((a, b) => compareEvents({ ...a, kind: 'x' }, { ...b, kind: 'x' }))
    const myPayments = payments
      .filter((p) => p.partyId === party.id)
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (a.createdAt || 0) - (b.createdAt || 0)))

    let pool = sum(myPayments, (p) => p.amount)
    const rows = mine.map((t) => {
      const total = txnTotal(t)
      return { ...t, total, paidAlloc: Math.min(total, round2(t.paid)) }
    })
    for (const r of rows) {
      const need = round2(r.total - r.paidAlloc)
      const take = Math.min(need, pool)
      r.paidAlloc = round2(r.paidAlloc + take)
      pool = round2(pool - take)
    }
    for (const r of rows) {
      r.balance = round2(r.total - r.paidAlloc)
      r.status = r.balance <= EPS ? 'paid' : r.paidAlloc > EPS ? 'partial' : 'unpaid'
    }

    const totalValue = sum(rows, (r) => r.total)
    const initialPaid = sum(mine, (t) => t.paid)
    const laterPaid = sum(myPayments, (p) => p.amount)
    const outstanding = round2(totalValue - initialPaid - laterPaid)
    const dates = [...mine.map((t) => t.date), ...myPayments.map((p) => p.date)].sort()

    out[party.id] = {
      party,
      txns: rows,
      payments: myPayments,
      count: rows.length,
      totalKg: sum(mine, (t) => t.kg),
      totalValue,
      paid: round2(initialPaid + laterPaid),
      outstanding,
      status: outstanding > EPS ? (initialPaid + laterPaid > EPS ? 'partial' : 'unpaid') : 'paid',
      lastDate: dates.length ? dates[dates.length - 1] : '',
    }
  }
  return out
}

/** Totals for a date range (inclusive). Leave from/to empty for all time. */
export function summarize(data, ledger, range = {}) {
  const inRange = (d) => (!range.from || d >= range.from) && (!range.to || d <= range.to)
  const purchases = data.purchases.filter((p) => inRange(p.date))
  const sales = data.sales.filter((s) => inRange(s.date))
  const expenses = data.expenses.filter((e) => inRange(e.date))
  const writeOffs = data.adjustments.filter((a) => inRange(a.date))

  const boughtKg = sum(purchases, (p) => p.kg)
  const boughtValue = sum(purchases, txnTotal)
  const soldKg = sum(sales, (s) => s.kg)
  const revenue = sum(sales, txnTotal)
  const cogs = sum(sales, (s) => ledger.saleCost[s.id] || 0)
  const grossProfit = round2(revenue - cogs)
  const expenseTotal = sum(expenses, (e) => e.amount)
  const writeOffKg = sum(writeOffs, (a) => a.kg)
  const writeOffCost = sum(writeOffs, (a) => ledger.adjustmentCost[a.id] || 0)
  const netProfit = round2(grossProfit - expenseTotal - writeOffCost)

  const byCategory = {}
  for (const e of expenses) byCategory[e.category] = round2((byCategory[e.category] || 0) + e.amount)
  const expenseByCategory = Object.entries(byCategory)
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount)

  return {
    purchaseCount: purchases.length, boughtKg, boughtValue,
    saleCount: sales.length, soldKg, revenue, cogs, grossProfit,
    expenseTotal, expenseByCategory, writeOffKg, writeOffCost, netProfit,
    margin: revenue > 0 ? (netProfit / revenue) * 100 : 0,
    avgBuyPrice: boughtKg > 0 ? boughtValue / boughtKg : 0,
    avgSellPrice: soldKg > 0 ? revenue / soldKg : 0,
    grossPerKg: soldKg > 0 ? grossProfit / soldKg : 0,
  }
}

/** Cash actually received / paid out (not what is merely owed). */
export function cashSummary(data) {
  const cashIn = round2(sum(data.sales, (s) => s.paid) + sum(data.payments.filter((p) => p.kind === 'buyer'), (p) => p.amount))
  const cashOut = round2(
    sum(data.purchases, (p) => p.paid) +
      sum(data.payments.filter((p) => p.kind === 'supplier'), (p) => p.amount) +
      sum(data.expenses, (e) => e.amount),
  )
  const opening = round2(Number(data.settings.openingCash) || 0)
  return { opening, cashIn, cashOut, balance: round2(opening + cashIn - cashOut) }
}

/** Month-by-month figures, oldest first, ending with the month of `endDate`. */
export function monthlySeries(data, ledger, months = 6, endDate = todayISO()) {
  const out = []
  for (let i = months - 1; i >= 0; i--) {
    const start = addMonths(endDate, -i)
    const s = summarize(data, ledger, { from: start, to: monthEnd(start) })
    out.push({
      key: monthKey(start), from: start, to: monthEnd(start),
      revenue: s.revenue, purchases: s.boughtValue, expenses: s.expenseTotal,
      grossProfit: s.grossProfit, netProfit: s.netProfit, soldKg: s.soldKg, boughtKg: s.boughtKg,
    })
  }
  return out
}

export function computeDerived(data) {
  const ledger = buildLedger(data)
  const suppliers = partyStatements(data, 'supplier')
  const buyers = partyStatements(data, 'buyer')

  const txnInfo = {}
  for (const st of [...Object.values(suppliers), ...Object.values(buyers)]) {
    for (const t of st.txns) txnInfo[t.id] = { paid: t.paidAlloc, balance: t.balance, status: t.status }
  }
  for (const t of [...data.purchases, ...data.sales]) {
    if (!t.partyId) txnInfo[t.id] = { paid: txnTotal(t), balance: 0, status: 'paid' }
  }

  return {
    ledger, suppliers, buyers, txnInfo,
    totals: summarize(data, ledger),
    cash: cashSummary(data),
    payables: sum(Object.values(suppliers), (s) => Math.max(s.outstanding, 0)),
    receivables: sum(Object.values(buyers), (b) => Math.max(b.outstanding, 0)),
  }
}

/** Returns a plain-English error for the first problem found, or null if the data is consistent. */
export function validateData(data) {
  const supplierIds = new Set(data.suppliers.map((s) => s.id))
  const buyerIds = new Set(data.buyers.map((b) => b.id))

  for (const [label, list, ids] of [
    ['purchase', data.purchases, supplierIds],
    ['sale', data.sales, buyerIds],
  ]) {
    for (const t of list) {
      if (!isValidISO(t.date)) return `A ${label} has an invalid date.`
      if (!t.type) return `A ${label} has no bottle type.`
      if (!(t.kg > 0)) return `Weight must be more than 0 kg.`
      if (!(t.pricePerKg > 0)) return `Price per kg must be more than ₦0.`
      const total = txnTotal(t)
      if (!(t.paid >= 0)) return `Amount paid can't be negative.`
      if (t.paid > total + EPS) return `Amount paid (${formatMoney(t.paid)}) can't be more than the total (${formatMoney(total)}).`
      if (t.partyId) {
        if (!ids.has(t.partyId)) return `A ${label} points to a ${label === 'purchase' ? 'supplier' : 'buyer'} that doesn't exist.`
      } else if (Math.abs(t.paid - total) > EPS) {
        return `Walk-in ${label === 'purchase' ? 'purchases' : 'sales'} must be paid in full. Pick or add a ${label === 'purchase' ? 'supplier' : 'buyer'} to record a balance.`
      }
    }
  }
  for (const p of data.payments) {
    if (!isValidISO(p.date)) return 'A payment has an invalid date.'
    if (!(p.amount > 0)) return 'Payment amount must be more than ₦0.'
    const ok = p.kind === 'supplier' ? supplierIds.has(p.partyId) : p.kind === 'buyer' ? buyerIds.has(p.partyId) : false
    if (!ok) return 'A payment points to someone who no longer exists.'
  }
  for (const e of data.expenses) {
    if (!isValidISO(e.date)) return 'An expense has an invalid date.'
    if (!(e.amount > 0)) return 'Expense amount must be more than ₦0.'
    if (!e.category) return 'An expense has no category.'
  }
  for (const a of data.adjustments) {
    if (!isValidISO(a.date)) return 'A write-off has an invalid date.'
    if (!(a.kg > 0)) return 'Write-off weight must be more than 0 kg.'
    if (!a.type) return 'A write-off has no bottle type.'
  }

  const ledger = buildLedger(data)
  if (ledger.problems.length) {
    const p = ledger.problems[0]
    return `Not enough ${p.type} in stock on ${formatDate(p.date)}: that would leave you ${formatKg(p.short)} short.`
  }
  for (const kind of ['supplier', 'buyer']) {
    for (const st of Object.values(partyStatements(data, kind))) {
      if (st.outstanding < -EPS) {
        return `${st.party.name} would be overpaid by ${formatMoney(-st.outstanding)}. Check the amounts paid.`
      }
    }
  }
  return null
}

export { monthStart, monthEnd }
