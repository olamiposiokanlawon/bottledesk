import { formatMoney } from '../lib/format.js'

function niceMax(v) {
  if (v <= 0) return 1000
  const pow = Math.pow(10, Math.floor(Math.log10(v)))
  const n = v / pow
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10
  return step * pow
}

const short = (n) => {
  const a = Math.abs(n)
  if (a >= 1e6) return `₦${+(n / 1e6).toFixed(1)}M`
  if (a >= 1e3) return `₦${+(n / 1e3).toFixed(0)}k`
  return `₦${Math.round(n)}`
}

/** Grouped bars. data: [{ label, a, b }]  names: [aName, bName] */
export default function BarChart({ data, names = ['Sales', 'Purchases'] }) {
  const W = 600, H = 230, L = 46, R = 8, T = 10, B = 26
  const max = niceMax(Math.max(...data.flatMap((d) => [d.a, d.b]), 0))
  const innerW = W - L - R, innerH = H - T - B
  const slot = innerW / Math.max(data.length, 1)
  const bw = Math.min(26, slot / 3)
  const y = (v) => T + innerH - (v / max) * innerH
  const ticks = [0, 0.25, 0.5, 0.75, 1]

  return (
    <div className="chart-wrap">
      <div className="legend">
        <span><i className="dot green" /> {names[0]}</span>
        <span><i className="dot orange" /> {names[1]}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="bar-chart" role="img" aria-label={`${names[0]} and ${names[1]} by month`}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={L} x2={W - R} y1={y(max * t)} y2={y(max * t)} stroke="#e9e9df" />
            <text x={L - 6} y={y(max * t) + 3} textAnchor="end" fontSize="10" fill="#98a198">{short(max * t)}</text>
          </g>
        ))}
        {data.map((d, i) => {
          const cx = L + slot * i + slot / 2
          return (
            <g key={d.label + i}>
              <rect x={cx - bw - 2} y={y(d.a)} width={bw} height={Math.max(innerH - (y(d.a) - T), 0)} fill="#7d9e43">
                <title>{`${d.label} - ${names[0]}: ${formatMoney(d.a)}`}</title>
              </rect>
              <rect x={cx + 2} y={y(d.b)} width={bw} height={Math.max(innerH - (y(d.b) - T), 0)} fill="#de9451">
                <title>{`${d.label} - ${names[1]}: ${formatMoney(d.b)}`}</title>
              </rect>
              <text x={cx} y={H - 8} textAnchor="middle" fontSize="10" fill="#98a198">{d.label}</text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}
