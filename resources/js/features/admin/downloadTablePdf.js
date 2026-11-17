import { cellText, EXPORT_BLUE, formatPrintedDate, toneFor } from './exportStyles'

const MARGIN = 36
const INK = [15, 23, 42]
const MUTED = [100, 116, 139]
const RULE = [226, 232, 240]
const ROW_RULE = [236, 240, 246]
const HEAD_RULE = [203, 213, 225]

/**
 * Minimal, modern table report (A4). Layout:
 *   short accent bar, large title, subtitle, date and active filters on the right,
 *   an optional one-line summary strip, then a table with thin row rules and tinted status pills.
 *
 * spec = {
 *   filename, title, subtitle?, summary?: [{ label, value }],
 *   headers, rows,                      // full data (also the PDF table unless `pdf` is given)
 *   pdf?: { headers, rows, columns: [{ weight, type: 'person' | 'stack' | 'status' | 'center' }] },
 * }
 * Column types: `person` = bold first line + muted second line, `stack` = regular first line + muted
 * second line (cells use "\n"), `status` = tinted pill, `center` = centred text.
 */
export async function downloadTablePdf(spec, { filterText } = {}) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ])
  const pdf = spec.pdf ?? {}
  const headers = pdf.headers ?? spec.headers
  const rows = (pdf.rows ?? spec.rows).map((row) => row.map(cellText))
  const columns = pdf.columns ?? headers.map(() => ({}))
  const orientation = headers.length >= 6 ? 'landscape' : 'portrait'
  const doc = new jsPDF({ orientation, unit: 'pt', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const usableWidth = pageWidth - MARGIN * 2
  const subtitle = spec.subtitle ?? `${spec.rows.length} baris`
  const summary = spec.summary ?? []
  const hasStacks = columns.some((column) => column.type === 'person' || column.type === 'stack')

  doc.setProperties({ title: spec.title, subject: 'Laporan data Talent Mobility', creator: 'Talent Mobility' })

  function drawHead(firstPage) {
    doc.setFillColor(...EXPORT_BLUE)
    doc.roundedRect(MARGIN, 34, 36, 4, 2, 2, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(firstPage ? 22 : 14)
    doc.setTextColor(...INK)
    doc.text(spec.title, MARGIN, firstPage ? 64 : 58)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9.5)
    doc.setTextColor(...MUTED)
    if (firstPage) doc.text(subtitle, MARGIN, 81)
    doc.setFontSize(9)
    doc.text(formatPrintedDate(), pageWidth - MARGIN, firstPage ? 50 : 46, { align: 'right' })
    const [filterLine] = doc.splitTextToSize(filterText || 'Semua data', Math.min(360, usableWidth / 2))
    doc.text(filterLine, pageWidth - MARGIN, firstPage ? 64 : 58, { align: 'right' })
  }

  drawHead(true)

  let startY = 100
  if (summary.length) {
    doc.setDrawColor(...RULE)
    doc.setLineWidth(0.6)
    doc.line(MARGIN, 98, pageWidth - MARGIN, 98)
    doc.line(MARGIN, 134, pageWidth - MARGIN, 134)
    let cursor = MARGIN
    for (const { label, value } of summary) {
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(18)
      doc.setTextColor(...toneFor(label).text)
      doc.text(String(value), cursor, 123)
      const valueWidth = doc.getTextWidth(String(value))
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(9.5)
      doc.setTextColor(...MUTED)
      doc.text(label, cursor + valueWidth + 6, 123)
      cursor += valueWidth + 6 + doc.getTextWidth(label) + 34
    }
    startY = 148
  }

  const weights = columns.map((column) => column.weight)
  const hasWeights = weights.every((weight) => weight > 0)
  const weightSum = hasWeights ? weights.reduce((sum, weight) => sum + weight, 0) : 0
  const columnStyles = Object.fromEntries(columns.map((column, index) => [index, {
    ...(hasWeights ? { cellWidth: (usableWidth * column.weight) / weightSum } : {}),
    halign: column.type === 'center' ? 'center' : 'left',
  }]))
  const customTypes = new Set(['person', 'stack', 'status'])

  autoTable(doc, {
    head: [headers],
    body: rows,
    startY,
    margin: { top: 76, left: MARGIN, right: MARGIN, bottom: 44 },
    theme: 'plain',
    styles: {
      font: 'helvetica',
      fontSize: 9,
      cellPadding: { top: 8, right: 8, bottom: 8, left: 0 },
      textColor: [30, 41, 59],
      minCellHeight: hasStacks ? 38 : 24,
      valign: 'middle',
      overflow: 'linebreak',
    },
    headStyles: { textColor: MUTED, fontStyle: 'bold', fontSize: 8, minCellHeight: 22 },
    columnStyles,
    willDrawCell: (data) => {
      if (data.section === 'body' && customTypes.has(columns[data.column.index]?.type)) data.cell.text = ['']
    },
    didDrawCell: (data) => {
      const { cell } = data
      doc.setDrawColor(...(data.section === 'head' ? HEAD_RULE : ROW_RULE))
      doc.setLineWidth(data.section === 'head' ? 0.8 : 0.6)
      doc.line(cell.x, cell.y + cell.height, cell.x + cell.width, cell.y + cell.height)
      if (data.section !== 'body') return
      const type = columns[data.column.index]?.type
      const raw = String(data.row.raw[data.column.index] ?? '')
      if (type === 'person' || type === 'stack') {
        const [first = '', second = ''] = raw.split('\n')
        const x = cell.x + cell.padding('left')
        const textWidth = cell.width - cell.padding('left') - cell.padding('right')
        doc.setFont('helvetica', type === 'person' ? 'bold' : 'normal')
        doc.setFontSize(type === 'person' ? 9.5 : 9)
        const firstLines = doc.splitTextToSize(first, textWidth).slice(0, 2)
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(8)
        // The muted second line may wrap (long unit paths); at most two lines are drawn.
        const secondLines = second ? doc.splitTextToSize(second, textWidth).slice(0, 2) : []
        const blockHeight = firstLines.length * 11 + secondLines.length * 9.5
        let cursor = cell.y + (cell.height - blockHeight) / 2 + 8.5
        doc.setFont('helvetica', type === 'person' ? 'bold' : 'normal')
        doc.setFontSize(type === 'person' ? 9.5 : 9)
        doc.setTextColor(...(type === 'person' ? INK : [30, 41, 59]))
        for (const line of firstLines) {
          doc.text(line, x, cursor)
          cursor += 11
        }
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(8)
        doc.setTextColor(...MUTED)
        for (const line of secondLines) {
          doc.text(line, x, cursor - 1)
          cursor += 9.5
        }
      } else if (type === 'status' && raw) {
        const tone = toneFor(raw)
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(8)
        const width = doc.getTextWidth(raw) + 16
        const height = 15
        const y = cell.y + (cell.height - height) / 2
        doc.setFillColor(...tone.fill)
        doc.roundedRect(cell.x, y, width, height, height / 2, height / 2, 'F')
        doc.setTextColor(...tone.text)
        doc.text(raw, cell.x + width / 2, y + height / 2 + 2.8, { align: 'center' })
      }
    },
    didDrawPage: (data) => {
      if (data.pageNumber > 1) drawHead(false)
    },
  })

  const totalPages = doc.getNumberOfPages()
  for (let page = 1; page <= totalPages; page += 1) {
    doc.setPage(page)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(...MUTED)
    doc.text('Talent Mobility', MARGIN, pageHeight - 18)
    doc.text(`${page} / ${totalPages}`, pageWidth - MARGIN, pageHeight - 18, { align: 'right' })
  }

  doc.save(`${spec.filename}-${new Date().toISOString().slice(0, 10)}.pdf`)
}
