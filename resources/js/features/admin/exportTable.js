// One entry point for every table export. The heavy libraries (jsPDF, ExcelJS) load on demand,
// so they are only downloaded when somebody actually chooses a format.
export async function exportTable(format, spec, context = {}) {
  if (format === 'xlsx') {
    const { downloadTableExcel } = await import('./downloadExcel')
    return downloadTableExcel(spec, context)
  }
  const { downloadTablePdf } = await import('./downloadTablePdf')
  return downloadTablePdf(spec, context)
}
