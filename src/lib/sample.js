import { emptyData } from './constants.js'
import { addDays, fromISO, round2, todayISO, monthStart } from './format.js'
import { partyStatements } from './calc.js'

function rng(seed) {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const BUY = { Clear: 200, Coloured: 150, Mixed: 120 }
const SELL = { Clear: 290, Coloured: 220, Mixed: 170 }

/** Realistic-looking demo data for the last ~5 months, relative to today. Fully fictional. */
export function generateSample(today = todayISO()) {
  const rand = rng(2026)
  const between = (a, b) => a + rand() * (b - a)
  const pick = (list) => list[Math.floor(rand() * list.length)]
  let n = 0
  const base = Date.now() - 1e7
  const id = (p) => `${p}${String(++n).padStart(4, '0')}`
  const stamp = () => base + n

  const data = emptyData()
  data.settings.businessName = 'Sample Bottle Business'
  data.settings.ownerName = 'Ada'

  const supplierSeed = [
    ['Emeka Collectors', 'Mushin'], ['Mama Nkechi', 'Oshodi'], ['Bola & Sons', 'Ikeja'],
    ['Yusuf Ibrahim', 'Agege'], ['Chidi Scrap Depot', 'Ajegunle'],
  ]
  const buyerSeed = [['GreenCycle Recyclers', 'Ikorodu'], ['PolyFibre Nigeria Ltd', 'Agbara'], ['Lagos Pelletizers', 'Ogba']]
  supplierSeed.forEach(([name, location], i) => data.suppliers.push({
    id: id('sup'), name, location, phone: `0800 000 010${i}`, note: 'Sample data', createdAt: stamp(),
  }))
  buyerSeed.forEach(([name, location], i) => data.buyers.push({
    id: id('buy'), name, location, phone: `0800 000 020${i}`, note: 'Sample data', createdAt: stamp(),
  }))

  const types = data.settings.bottleTypes
  const stock = Object.fromEntries(types.map((t) => [t, 0]))
  const start = addDays(today, -150)

  for (let i = 0; i <= 150; i++) {
    const date = addDays(start, i)
    const dow = fromISO(date).getDay()
    const dom = Number(date.slice(8))

    if (rand() < 0.55) {
      const count = rand() < 0.3 ? 2 : 1
      for (let k = 0; k < count; k++) {
        const r = rand()
        const type = r < 0.5 ? types[0] : r < 0.8 ? types[1] : types[2]
        const kg = Math.round(between(40, 220))
        const pricePerKg = Math.round(BUY[type] + between(-10, 10))
        const total = round2(kg * pricePerKg)
        const walkIn = rand() < 0.15
        const q = rand()
        const paid = walkIn || q < 0.6 ? total : q < 0.85 ? Math.round((total * between(0.4, 0.8)) / 100) * 100 : 0
        data.purchases.push({
          id: id('pur'), date, partyId: walkIn ? null : pick(data.suppliers).id, type, kg, pricePerKg,
          paid, note: '', createdAt: stamp(),
        })
        stock[type] += kg
      }
    }

    if (i > 10 && (dow === 2 || dow === 5)) {
      for (const type of types) {
        if (stock[type] > 150) {
          const kg = Math.round(stock[type] * between(0.5, 0.85))
          const pricePerKg = Math.round(SELL[type] + between(-15, 15))
          const total = round2(kg * pricePerKg)
          const q = rand()
          const paid = q < 0.55 ? total : q < 0.8 ? Math.round((total * between(0.4, 0.8)) / 100) * 100 : 0
          data.sales.push({
            id: id('sal'), date, partyId: pick(data.buyers).id, type, kg, pricePerKg, paid, note: '', createdAt: stamp(),
          })
          stock[type] -= kg
        }
      }
    }

    const exp = (category, description, amount) =>
      data.expenses.push({ id: id('exp'), date, category, description, amount: Math.round(amount / 100) * 100, createdAt: stamp() })
    if (dow === 1) exp('Transport', 'Weekly pick-up runs', between(8000, 15000))
    if (dow === 6) exp('Labour', 'Sorting crew', between(6000, 12000))
    if (dom === 1) exp('Rent & storage', 'Warehouse rent', 45000)
    if (dom === 5) exp('Utilities', 'Electricity and water', between(9000, 14000))
    if (i % 11 === 0) exp('Fuel', 'Generator fuel', between(5000, 9000))

    if ([40, 90, 130].includes(i)) {
      const type = types[0]
      if (stock[type] > 60) {
        const kg = Math.round(between(5, 15))
        data.adjustments.push({
          id: id('adj'), date, type, kg, reason: 'Moisture / dirt loss', note: 'Sample data', createdAt: stamp(),
        })
        stock[type] -= kg
      }
    }
  }

  // Part payments made after the original transaction.
  for (const kind of ['supplier', 'buyer']) {
    const st = partyStatements(data, kind)
    for (const s of Object.values(st)) {
      if (s.outstanding <= 0 || !s.txns.length) continue
      let left = Math.floor(s.outstanding * (kind === 'supplier' ? 0.7 : 0.6))
      const first = s.txns[0].date
      const span = Math.max(1, Math.round((fromISO(today) - fromISO(first)) / 86400000) - 3)
      for (let p = 0; p < 2 && left > 1000; p++) {
        const amount = Math.max(1000, Math.round((left * (p === 0 ? 0.6 : 1)) / 100) * 100)
        if (amount > left) break
        data.payments.push({
          id: id('pay'), kind, partyId: s.party.id, amount, date: addDays(first, Math.floor(rand() * span) + 1),
          note: 'Part payment', createdAt: stamp(),
        })
        left -= amount
      }
    }
  }
  data.settings.openingCash = 150000
  return data
}

export { monthStart }
