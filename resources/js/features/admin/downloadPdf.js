export async function downloadTablePdf(filename, title, headers, rows) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ])
  const orientation = headers.length >= 6 ? 'landscape' : 'portrait'
  const document = new jsPDF({ orientation, unit: 'pt', format: 'a4' })
  const margin = { top: 62, right: 32, bottom: 36, left: 32 }
  const pageWidth = document.internal.pageSize.getWidth()

  document.setProperties({
    title,
    subject: 'Laporan data Talent Mobility',
    creator: 'Talent Mobility',
  })

  autoTable(document, {
    head: [headers],
    body: rows.map((row) => row.map((value) => (value == null ? '' : String(value)))),
    margin,
    startY: margin.top,
    theme: 'grid',
    styles: {
      font: 'helvetica',
      fontSize: 8,
      cellPadding: 5,
      overflow: 'linebreak',
      textColor: [39, 52, 72],
      lineColor: [220, 228, 239],
      lineWidth: 0.4,
    },
    headStyles: {
      fillColor: [37, 99, 235],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
    },
    alternateRowStyles: { fillColor: [246, 249, 253] },
    didDrawPage: () => {
      const pageHeight = document.internal.pageSize.getHeight()
      document.setFont('helvetica', 'bold')
      document.setFontSize(14)
      document.setTextColor(28, 46, 74)
      document.text(title, margin.left, 29)

      document.setFont('helvetica', 'normal')
      document.setFontSize(8)
      document.setTextColor(103, 116, 135)
      document.text(
        `${rows.length} baris · Diunduh ${new Intl.DateTimeFormat('id-ID', {
          dateStyle: 'medium',
          timeStyle: 'short',
        }).format(new Date())}`,
        margin.left,
        45,
      )
      document.text(
        `Talent Mobility · Halaman ${document.internal.getNumberOfPages()}`,
        pageWidth - margin.right,
        pageHeight - 16,
        { align: 'right' },
      )
    },
  })

  document.save(`${filename}-${new Date().toISOString().slice(0, 10)}.pdf`)
}
