import { EXPORT_BLUE, formatPrintedDate, toArgb, toneFor } from './exportStyles'

const THIN_RULE = { style: 'thin', color: { argb: 'FFE2E8F0' } }

function safeSheetName(name) {
  return String(name).replace(/[\\/?*[\]:]/g, ' ').trim().slice(0, 31) || 'Data'
}

function columnWidth(header, values) {
  const longest = values.reduce((max, value) => {
    const text = value instanceof Date ? '00/00/0000 00.00' : String(value ?? '')
    const longestLine = text.split('\n').reduce((lineMax, line) => Math.max(lineMax, line.length), 0)
    return Math.max(max, longestLine)
  }, String(header).length)
  return Math.min(48, Math.max(10, longest + 3))
}

/**
 * Excel export of the full table: styled header row, frozen header, auto filter, sensible column
 * widths, tinted status cells, and an "Info" sheet with the report details and summary.
 */
export async function downloadTableExcel(spec, { filterText } = {}) {
  const module = await import('exceljs')
  const ExcelJS = module.default ?? module
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'Talent Mobility'
  workbook.created = new Date()

  const sheet = workbook.addWorksheet(safeSheetName(spec.title), { views: [{ state: 'frozen', ySplit: 1 }] })
  sheet.columns = spec.headers.map((header, index) => ({
    header,
    key: `column${index}`,
    width: columnWidth(header, spec.rows.map((row) => row[index])),
  }))
  for (const row of spec.rows) sheet.addRow(row.map((value) => value ?? ''))

  const headerRow = sheet.getRow(1)
  headerRow.height = 26
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: toArgb(EXPORT_BLUE) } }
    cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true }
  })

  const statusIndex = spec.statusColumn
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return
    row.eachCell({ includeEmpty: true }, (cell, columnNumber) => {
      cell.alignment = { vertical: 'middle', wrapText: true }
      cell.border = { bottom: THIN_RULE }
      if (cell.value instanceof Date) cell.numFmt = 'dd/mm/yyyy hh:mm'
      if (statusIndex != null && columnNumber === statusIndex + 1 && cell.value) {
        const tone = toneFor(String(cell.value))
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: toArgb(tone.fill) } }
        cell.font = { bold: true, color: { argb: toArgb(tone.text) } }
        cell.alignment = { vertical: 'middle', horizontal: 'center' }
      }
    })
  })
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: spec.headers.length } }

  const info = workbook.addWorksheet('Info')
  info.columns = [{ width: 22 }, { width: 56 }]
  const details = [
    ['Laporan', spec.title],
    ['Keterangan', spec.subtitle ?? `${spec.rows.length} baris`],
    ['Dicetak', formatPrintedDate()],
    ['Filter', filterText || 'Semua data'],
    ['Jumlah baris', spec.rows.length],
    ...(spec.summary ?? []).map(({ label, value }) => [label, value]),
  ]
  details.forEach((detail, index) => {
    const row = info.addRow(detail)
    row.getCell(1).font = { bold: true, color: { argb: toArgb(EXPORT_BLUE) } }
    row.getCell(2).alignment = { horizontal: 'left' }
    if (index === 4) row.border = { top: THIN_RULE }
  })

  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${spec.filename}-${new Date().toISOString().slice(0, 10)}.xlsx`
  document.body.append(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
