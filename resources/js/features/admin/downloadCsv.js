export function downloadTableCsv(filename, headers, rows) {
  const escapeCell = (value) => {
    let text = value == null ? '' : String(value)
    const firstMeaningfulCharacter = text.trimStart().charAt(0)
    if ((firstMeaningfulCharacter && '=+-@'.includes(firstMeaningfulCharacter)) || text[0] === '\t' || text[0] === '\r') {
      text = `'${text}`
    }
    return `"${text.replaceAll('"', '""')}"`
  }
  const csv = [headers, ...rows].map((row) => row.map(escapeCell).join(',')).join('\r\n')
  const blob = new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${filename}-${new Date().toISOString().slice(0, 10)}.csv`
  document.body.append(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
