import test from 'node:test'
import assert from 'node:assert/strict'
import { emptyData } from '../src/lib/constants.js'
import { buildLedger, computeDerived, validateData, summarize, partyStatements, monthlySeries } from '../src/lib/calc.js'
import { generateSample } from '../src/lib/sample.js'
import { normalizeData, parseImport, exportJSON } from '../src/lib/storage.js'
import { formatMoney, round2, parseNumber, addMonths, monthEnd } from '../src/lib/format.js'

const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 0.011, `${msg || ''} expected ${b}, got ${a}`)

function base() {
  const d = emptyData()
  d.suppliers.push({ id: 's1', name: 'Emeka', phone: '', location: '', note: '', createdAt: 1 })
  d.buyers.push({ id: 'b1', name: 'GreenCycle', phone: '', location: '', note: '', createdAt: 1 })
  return d
}
const purchase = (o) => ({ id: 'p' + Math.random(), date: '2026-01-10', partyId: 's1', type: 'Clear', kg: 100, pricePerKg: 200, paid: 20000, note: '', createdAt: 1, ...o })
const sale = (o) => ({ id: 'x' + Math.random(), date: '2026-01-20', partyId: 'b1', type: 'Clear', kg: 50, pricePerKg: 300, paid: 15000, note: '', createdAt: 2, ...o })

test('money & number helpers', () => {
  assert.equal(formatMoney(200), '₦200')
  assert.equal(formatMoney(1234567.5), '₦1,234,567.5')
  assert.equal(formatMoney(-50), '-₦50')
  assert.equal(round2(0.1 + 0.2), 0.3)
  assert.equal(parseNumber('1,250.5'), 1250.5)
  assert.ok(Number.isNaN(parseNumber('')))
  assert.equal(addMonths('2026-01-31', 1), '2026-02-01')
  assert.equal(monthEnd('2026-02-10'), '2026-02-28')
})

test('buy ₦200/kg: 100 kg costs ₦20,000 and adds to stock', () => {
  const d = base()
  d.purchases.push(purchase())
  const l = buildLedger(d)
  assert.equal(l.totalKg, 100)
  assert.equal(l.totalValue, 20000)
  assert.equal(l.stock['Clear'].avgCost, 200)
})

test('selling uses average cost for profit', () => {
  const d = base()
  d.purchases.push(purchase({ kg: 100, pricePerKg: 200 }))
  d.purchases.push(purchase({ kg: 100, pricePerKg: 220, date: '2026-01-12', paid: 22000 }))
  const s = sale({ kg: 100, pricePerKg: 300, paid: 30000 })
  d.sales.push(s)
  const dv = computeDerived(d)
  assert.equal(dv.ledger.stock['Clear'].kg, 100)
  near(dv.ledger.saleCost[s.id], 21000, 'avg cost 210/kg x 100')
  near(dv.totals.grossProfit, 9000)
  near(dv.ledger.totalValue, 21000)
})

test('stock identity: bought - sold - written off = stock, and cost is fully accounted for', () => {
  const d = generateSample('2026-08-25')
  assert.equal(validateData(d), null)
  const dv = computeDerived(d)
  const t = dv.totals
  near(dv.ledger.totalKg, t.boughtKg - t.soldKg - t.writeOffKg, 'kg identity')
  near(t.boughtValue, t.cogs + t.writeOffCost + dv.ledger.totalValue, 'cost identity')
  near(t.netProfit, t.revenue - t.cogs - t.expenseTotal - t.writeOffCost, 'profit identity')
  assert.ok(d.purchases.length > 50 && d.sales.length > 10)
})

test('cannot sell more than you have; cannot delete bottles already sold', () => {
  const d = base()
  d.purchases.push(purchase({ id: 'p1', kg: 100 }))
  d.sales.push(sale({ kg: 101, paid: 0 }))
  assert.match(validateData(d), /Not enough Clear/)
  d.sales[0].kg = 60
  assert.equal(validateData(d), null)
  d.purchases = []
  assert.match(validateData(d), /Not enough/)
})

test('same-day buy then sell is allowed regardless of entry order', () => {
  const d = base()
  d.sales.push(sale({ date: '2026-02-01', kg: 10, createdAt: 1, paid: 0 }))
  d.purchases.push(purchase({ date: '2026-02-01', kg: 10, createdAt: 99, paid: 2000 }))
  assert.equal(validateData(d), null)
})

test('payments are matched to oldest transactions first', () => {
  const d = base()
  d.purchases.push(purchase({ id: 'a', date: '2026-01-01', kg: 100, pricePerKg: 100, paid: 0 }))   // 10,000
  d.purchases.push(purchase({ id: 'b', date: '2026-01-05', kg: 100, pricePerKg: 100, paid: 0 }))   // 10,000
  d.payments.push({ id: 'y1', kind: 'supplier', partyId: 's1', amount: 12000, date: '2026-01-06', note: '', createdAt: 1 })
  const st = partyStatements(d, 'supplier').s1
  assert.equal(st.outstanding, 8000)
  assert.equal(st.txns[0].status, 'paid')
  assert.equal(st.txns[1].status, 'partial')
  assert.equal(st.txns[1].balance, 8000)
  assert.equal(st.status, 'partial')
})

test('overpayment and bad amounts are rejected', () => {
  const d = base()
  d.purchases.push(purchase({ paid: 20001 }))
  assert.match(validateData(d), /can't be more than the total/)
  d.purchases[0].paid = 20000
  d.payments.push({ id: 'z', kind: 'supplier', partyId: 's1', amount: 5, date: '2026-01-11', note: '', createdAt: 1 })
  assert.match(validateData(d), /overpaid/)
  d.payments = []
  d.purchases[0].partyId = null
  d.purchases[0].paid = 100
  assert.match(validateData(d), /Walk-in/)
})

test('cash position', () => {
  const d = base()
  d.settings.openingCash = 5000
  d.purchases.push(purchase({ paid: 20000 }))
  d.sales.push(sale({ paid: 15000 }))
  d.expenses.push({ id: 'e', date: '2026-01-15', category: 'Transport', description: '', amount: 2000, createdAt: 1 })
  d.payments.push({ id: 'y', kind: 'buyer', partyId: 'b1', amount: 0.5, date: '2026-01-25', note: '', createdAt: 1 })
  const c = computeDerived(d).cash
  near(c.balance, 5000 + 15000.5 - 20000 - 2000)
  const dv = computeDerived(d)
  near(dv.receivables, 0, 'buyer owes 15000 total 15000?')
})

test('period summary and monthly series', () => {
  const d = generateSample('2026-08-25')
  const l = buildLedger(d)
  const all = summarize(d, l)
  const months = monthlySeries(d, l, 12, '2026-08-25')
  const inside = months.reduce((s, m) => s + m.revenue, 0)
  near(inside, all.revenue, 'monthly revenue adds up to total')
  assert.equal(months.length, 12)
  assert.equal(months[11].key, '2026-08')
})

test('backup export/import round-trips and rejects junk', () => {
  const d = generateSample('2026-08-25')
  const back = parseImport(exportJSON(d))
  assert.equal(back.purchases.length, d.purchases.length)
  near(computeDerived(back).totals.netProfit, computeDerived(d).totals.netProfit)
  assert.throws(() => parseImport('not json'))
  assert.throws(() => parseImport('[1,2]'))
  assert.throws(() => parseImport(JSON.stringify({ purchases: [{ date: 'x', kg: 5 }] })))
  assert.equal(normalizeData({}).settings.defaultBuyPrice, 200)
})

test('old "PET" names in saved data are renamed', () => {
  const d = normalizeData({
    settings: { bottleTypes: ['Clear PET', 'Coloured PET', 'Mixed'] },
    purchases: [{ id: 'a', date: '2026-01-01', type: 'Clear PET', kg: 10, pricePerKg: 200, paid: 2000 }],
    adjustments: [{ id: 'b', date: '2026-01-02', type: 'Clear PET', kg: 1 }],
  })
  assert.deepEqual(d.settings.bottleTypes, ['Clear', 'Coloured', 'Mixed'])
  assert.equal(d.purchases[0].type, 'Clear')
  assert.equal(d.adjustments[0].type, 'Clear')
  assert.equal(validateData(d), null)
})
