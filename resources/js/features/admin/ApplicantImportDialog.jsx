import { useState } from 'react'
import { Download, FileSpreadsheet, Upload } from 'lucide-react'
import { readSheet } from 'read-excel-file/browser'
import writeExcelFile from 'write-excel-file/browser'
import { apiRequest } from '../../api'
import { AdminFormDialog } from './AdminPrimitives'

// Header names follow the PT PAL employee roster (daftar Karyawan PT PAL.xlsx).
// "Unit Kerja" is a Departemen and "Job Title" is the Jabatan. TL/TTL and Age are ignored.
const TEMPLATE_HEADERS = ['nip', 'Employee Name', 'Divisi', 'Unit Kerja', 'Job Title', 'Last Education']
const TEMPLATE_EXAMPLE = [['12345678', 'Nama Karyawan', 'Divisi Rekayasa Umum', 'Departemen Desain Dasar', 'Perekayasa VI', 'S1']]

const COLUMN_ALIASES = {
  employee_number: ['nip', 'nik', 'nomorindukkaryawan', 'employeenumber'],
  name: ['employeename', 'nama', 'namalengkap', 'name'],
  division_name: ['divisi', 'division'],
  department_name: ['unitkerja', 'departemen', 'department'],
  position_title: ['jobtitle', 'jabatan', 'position'],
  last_education: ['lasteducation', 'pendidikanterakhir', 'pendidikan'],
}

function normalizeHeader(value) {
  return String(value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

function cellText(value) {
  if (value === null || value === undefined) return ''
  return String(value).trim()
}

async function parseWorkbook(file) {
  const sheet = await readSheet(file)
  if (!sheet.length) throw new Error('File Excel kosong.')
  const headers = sheet[0].map(normalizeHeader)
  const columnIndex = {}
  for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
    const index = headers.findIndex((header) => aliases.includes(header))
    if (index >= 0) columnIndex[field] = index
  }
  if (columnIndex.employee_number === undefined || columnIndex.name === undefined) {
    throw new Error('Kolom "nip" dan "Employee Name" wajib ada di baris pertama. Unduh template untuk format yang benar.')
  }
  const rows = []
  for (const line of sheet.slice(1)) {
    const row = {}
    for (const [field, index] of Object.entries(columnIndex)) row[field] = cellText(line[index])
    if (!row.employee_number && !row.name) continue
    rows.push(row)
  }
  if (!rows.length) throw new Error('Tidak ada baris data karyawan pada file.')
  return rows
}

export default function ApplicantImportDialog({ onClose, onImported }) {
  const [rows, setRows] = useState([])
  const [fileName, setFileName] = useState('')
  const [error, setError] = useState('')
  const [isParsing, setIsParsing] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [result, setResult] = useState(null)

  async function downloadTemplate() {
    await writeExcelFile([TEMPLATE_HEADERS, ...TEMPLATE_EXAMPLE]).toFile('template-import-akun-pelamar.xlsx')
  }

  async function chooseFile(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setError('')
    setResult(null)
    setIsParsing(true)
    try {
      setRows(await parseWorkbook(file))
      setFileName(file.name)
    } catch (parseError) {
      setRows([])
      setFileName('')
      setError(parseError.message || 'File tidak dapat dibaca. Gunakan file .xlsx.')
    } finally {
      setIsParsing(false)
    }
  }

  async function submit(event) {
    event.preventDefault()
    setError('')
    if (!rows.length) {
      setError('Pilih file Excel terlebih dahulu.')
      return
    }
    setIsImporting(true)
    try {
      const response = await apiRequest('/admin/accounts/import', {
        method: 'POST',
        body: JSON.stringify({ rows }),
      })
      setResult(response)
      onImported?.(response)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setIsImporting(false)
    }
  }

  return (
    <AdminFormDialog className="applicant-import-dialog" onClose={onClose} title="Import akun pelamar dari Excel">
      <form className="organization-form account-manager-form" onSubmit={submit}>
        <p className="organization-help account-form-help">
          Kolom yang dibaca: <strong>nip, Employee Name, Divisi, Unit Kerja (Departemen), Job Title (Jabatan), Last Education</strong>.
          Kolom lain (TL/TTL, Age) diabaikan. Email dikosongkan (tidak wajib) dan dapat diisi kemudian lewat Edit akun.
        </p>
        <div className="import-actions">
          <button className="detail-button" onClick={() => void downloadTemplate()} type="button">
            <Download size={15} /> Unduh template
          </button>
          <label className="detail-button import-file-button">
            <Upload size={15} /> {isParsing ? 'Membaca file...' : 'Pilih file .xlsx'}
            <input accept=".xlsx" onChange={(event) => void chooseFile(event)} type="file" />
          </label>
        </div>
        {fileName && (
          <p className="organization-help import-summary">
            <FileSpreadsheet size={15} /> <strong>{fileName}</strong> — {rows.length} baris karyawan siap diimpor.
          </p>
        )}
        {rows.length > 0 && (
          <div className="admin-table-scroll import-preview">
            <table className="admin-table">
              <thead><tr><th>NIP</th><th>NAMA</th><th>DIVISI</th><th>DEPARTEMEN</th><th>JABATAN</th><th>PENDIDIKAN</th></tr></thead>
              <tbody>
                {rows.slice(0, 5).map((row, index) => (
                  <tr key={`${row.employee_number}-${index}`}>
                    <td>{row.employee_number}</td><td>{row.name}</td><td>{row.division_name || '—'}</td>
                    <td>{row.department_name || '—'}</td><td>{row.position_title || '—'}</td><td>{row.last_education || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length > 5 && <p className="admin-table-note">Menampilkan 5 dari {rows.length} baris.</p>}
          </div>
        )}
        <p className="organization-help account-form-help">
          Semua akun dibuat dengan kata sandi awal <strong>pal@123</strong>. Pelamar masuk memakai NIP dan wajib menggantinya saat masuk pertama. NIP yang sudah terdaftar dilewati. Divisi dan Departemen yang belum ada di master data otomatis ditambahkan.
        </p>
        {error && <p className="admin-alert error" role="alert">{error}</p>}
        {result && (
          <div className="admin-alert success import-result" role="status">
            <p>{result.message}</p>
            {result.invalid?.length > 0 && (
              <ul>
                {result.invalid.map((item) => <li key={item.line}>Baris {item.line}: {item.message}</li>)}
              </ul>
            )}
          </div>
        )}
        <div className="organization-form-actions">
          <button className="detail-button" onClick={onClose} type="button">{result ? 'Tutup' : 'Batal'}</button>
          {!result && (
            <button className="apply-button" disabled={isImporting || !rows.length} type="submit">
              {isImporting ? 'Mengimpor...' : <><Upload size={16} /> Impor {rows.length || ''} akun</>}
            </button>
          )}
        </div>
      </form>
    </AdminFormDialog>
  )
}
