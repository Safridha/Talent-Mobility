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
      fillColor: [30, 58, 138],
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

const NAVY = [30, 58, 138]
const INK = [23, 32, 51]
const MUTED = [100, 116, 139]
const RULE = [226, 232, 240]
const STATUS_COLORS = {
  submitted: { fill: [226, 232, 240], text: [51, 65, 85] },
  screening: { fill: [254, 243, 199], text: [146, 64, 14] },
  interview: { fill: [224, 231, 255], text: [55, 48, 163] },
  accepted: { fill: [209, 250, 229], text: [4, 120, 87] },
  rejected: { fill: [254, 226, 226], text: [185, 28, 28] },
}

function formatDate(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value ?? '')
  return new Intl.DateTimeFormat('id-ID', { dateStyle: 'long', timeStyle: 'short' }).format(date)
}

// One-page-per-applicant report: header band, identity block, sections of label/value rows, page footer.
export async function downloadApplicantPdf(details, { statusLabel } = {}) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ])
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin = 42
  const contentWidth = pageWidth - margin * 2
  const name = details.applicant_name || 'Pelamar'
  const status = STATUS_COLORS[details.status] || STATUS_COLORS.submitted
  const printedAt = formatDate(new Date())

  doc.setProperties({
    title: `Data Pelamar - ${name}`,
    subject: 'Data pelamar Talent Mobility',
    creator: 'Talent Mobility',
  })

  // Header band
  doc.setFillColor(...NAVY)
  doc.rect(0, 0, pageWidth, 92, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8.5)
  doc.setTextColor(165, 180, 220)
  doc.text('TALENT MOBILITY', margin, 34, { charSpace: 1.4 })
  doc.setFontSize(22)
  doc.setTextColor(255, 255, 255)
  doc.text('Data Pelamar', margin, 62)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.setTextColor(165, 180, 220)
  doc.text('ID lamaran', pageWidth - margin, 34, { align: 'right' })
  doc.setFont('courier', 'bold')
  doc.setFontSize(9.5)
  doc.setTextColor(255, 255, 255)
  doc.text(String(details.id || '-'), pageWidth - margin, 49, { align: 'right' })

  // Identity block + status pill
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(17)
  doc.setTextColor(...INK)
  const nameLines = doc.splitTextToSize(name, contentWidth - 120)
  doc.text(nameLines, margin, 126)
  const afterName = 126 + (nameLines.length - 1) * 20
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(...MUTED)
  doc.text(
    [details.employee_number ? `NIP ${details.employee_number}` : null, `Dikirim ${formatDate(details.created_at)}`].filter(Boolean).join('   |   '),
    margin,
    afterName + 18,
  )
  const label = (statusLabel || details.status || '-').toUpperCase()
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8.5)
  const pillWidth = doc.getTextWidth(label) + 24
  doc.setFillColor(...status.fill)
  doc.roundedRect(pageWidth - margin - pillWidth, 112, pillWidth, 22, 11, 11, 'F')
  doc.setTextColor(...status.text)
  doc.text(label, pageWidth - margin - pillWidth / 2, 126.5, { align: 'center' })

  let cursor = afterName + 36
  doc.setDrawColor(...RULE)
  doc.setLineWidth(0.8)
  doc.line(margin, cursor, pageWidth - margin, cursor)
  cursor += 24

  // `wide` sections show one full-width text block (e.g. the motivation) instead of label/value rows.
  function section(title, rows, { wide = false } = {}) {
    const visible = rows.filter(([, value]) => value !== null && value !== undefined && String(value).trim() !== '')
    if (!visible.length) return
    if (cursor + 80 > pageHeight - 64) {
      doc.addPage()
      cursor = 64
    }
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.setTextColor(...NAVY)
    doc.text(title.toUpperCase(), margin, cursor, { charSpace: 0.9 })
    autoTable(doc, {
      startY: cursor + 8,
      margin: { top: 64, right: margin, bottom: 60, left: margin },
      theme: 'plain',
      body: visible.map(([key, value]) => (wide ? [String(value)] : [key, String(value)])),
      styles: {
        font: 'helvetica',
        fontSize: 10,
        textColor: INK,
        cellPadding: { top: 7, right: 8, bottom: 7, left: 0 },
        lineColor: RULE,
        lineWidth: { bottom: 0.6 },
        overflow: 'linebreak',
        valign: 'top',
      },
      columnStyles: wide
        ? { 0: { cellWidth: 'auto', fontSize: 10.5, cellPadding: { top: 8, right: 4, bottom: 8, left: 0 } } }
        : {
          0: { cellWidth: 150, fontStyle: 'bold', fontSize: 9, textColor: MUTED },
          1: { cellWidth: 'auto' },
        },
    })
    cursor = doc.lastAutoTable.finalY + 26
  }

  section('Identitas pelamar', [
    ['Nama lengkap', name],
    ['NIP', details.employee_number],
    ['Email', details.applicant_email],
    ['Nomor telepon', details.phone_number],
  ])
  section('Asal unit dan pendidikan', [
    ['Divisi asal', details.origin_division],
    ['Unit asal', details.origin_unit],
    ['Posisi saat ini', details.current_position],
    ['Pendidikan terakhir', details.education_level],
    ['Bidang studi', details.study_field],
  ])
  section('Tujuan lamaran', [
    ['Unit tujuan', details.target_label || details.job_title],
    ['Deskripsi posisi', details.position_description],
  ])
  section('Motivasi dan rencana kontribusi', [['', details.motivation]], { wide: true })

  // Footer and continuation header on every page (page count is known only now)
  const pages = doc.getNumberOfPages()
  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page)
    if (page > 1) {
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(8.5)
      doc.setTextColor(...MUTED)
      doc.text(`Data Pelamar - ${name}`, margin, 34)
      doc.setDrawColor(...RULE)
      doc.setLineWidth(0.6)
      doc.line(margin, 42, pageWidth - margin, 42)
    }
    doc.setDrawColor(...RULE)
    doc.setLineWidth(0.6)
    doc.line(margin, pageHeight - 44, pageWidth - margin, pageHeight - 44)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(...MUTED)
    doc.text(`Dokumen internal, bersifat rahasia  |  Dicetak ${printedAt}`, margin, pageHeight - 28)
    doc.text(`Halaman ${page} dari ${pages}`, pageWidth - margin, pageHeight - 28, { align: 'right' })
  }

  const safeName = name.toLocaleLowerCase('id').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  doc.save(`data-pelamar-${safeName || details.id}-${new Date().toISOString().slice(0, 10)}.pdf`)
}
