const escapeCell = (v) => {
  const s = v == null ? '' : String(v)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** columns: [{ label, get: (row) => value }] */
export function toCSV(rows, columns) {
  const head = columns.map((c) => escapeCell(c.label)).join(',')
  const body = rows.map((r) => columns.map((c) => escapeCell(c.get(r))).join(','))
  return [head, ...body].join('\r\n')
}

export function downloadFile(filename, text, mime = 'text/csv;charset=utf-8') {
  // The BOM makes Excel open ₦ and other symbols correctly.
  const blob = new Blob([mime.startsWith('text/csv') ? '\ufeff' + text : text], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
