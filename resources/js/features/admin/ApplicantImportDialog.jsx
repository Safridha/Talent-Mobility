import { useState } from 'react'
import { Download, FileSpreadsheet, Upload, Search } from 'lucide-react'
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

// Excel drops the leading zero of NIPs: an 8-digit NIP starting with 20-26 is really 9 digits starting with 0.
// (The server applies the same rule, so the result is identical either way.)
function restoreNip(value) {
  const nip = String(value ?? '').trim()
  return /^2[0-6]\d{6}$/.test(nip) ? `0${nip}` : nip
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
    row.employee_number = restoreNip(row.employee_number)
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
  const [preview, setPreview] = useState(null) // dry-run outcome, shown before anything is saved

  async function downloadTemplate() {
    await writeExcelFile([TEMPLATE_HEADERS, ...TEMPLATE_EXAMPLE]).toFile('template-import-akun-pelamar.xlsx')
  }

  async function chooseFile(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setError('')
    setResult(null)
    setPreview(null)
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

  // First press: check what the file would change (nothing is saved). Second press: apply it.
  async function submit(event) {
    event.preventDefault()
    setError('')
    if (!rows.length) {
      setError('Pilih file Excel terlebih dahulu.')
      return
    }
    const applying = Boolean(preview)
    setIsImporting(true)
    try {
      const response = await apiRequest('/admin/accounts/import', {
        method: 'POST',
        body: JSON.stringify({ rows, dry_run: !applying }),
      })
      if (applying) {
        setResult(response)
        setPreview(null)
        onImported?.(response)
      } else {
        setPreview(response)
      }
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setIsImporting(false)
    }
  }

  const hasChanges = preview ? preview.created + preview.updated > 0 : false

  return (
    <AdminFormDialog className="applicant-import-dialog" onClose={onClose} title="Import akun pelamar dari Excel">
      <form className="organization-form account-manager-form" onSubmit={submit}>
        <p className="organization-help account-form-help">
          Kolom yang dibaca: <strong>nip, Employee Name, Divisi, Unit Kerja (Departemen), Job Title (Jabatan), Last Education</strong>.
          Kolom lain (TL/TTL, Age) diabaikan. NIP 8 digit berawalan 20-26 otomatis dilengkapi angka 0 di depan (Excel sering menghilangkannya), termasuk untuk akun lama yang NIP-nya sudah tersimpan tanpa 0. Email dikosongkan (tidak wajib) dan dapat diisi kemudian lewat Edit akun.
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
            <FileSpreadsheet size={15} /> <strong>{fileName}</strong> - {rows.length} baris karyawan siap diimpor.
          </p>
        )}
        {rows.length > 0 && (
          <div className="admin-table-scroll import-preview">
            <table className="admin-table">
              <thead><tr><th>NIP</th><th>NAMA</th><th>DIVISI</th><th>DEPARTEMEN</th><th>JABATAN</th><th>PENDIDIKAN</th></tr></thead>
              <tbody>
                {rows.slice(0, 5).map((row, index) => (
                  <tr key={`${row.employee_number}-${index}`}>
                    <td>{row.employee_number}</td><td>{row.name}</td><td>{row.division_name || '-'}</td>
                    <td>{row.department_name || '-'}</td><td>{row.position_title || '-'}</td><td>{row.last_education || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length > 5 && <p className="admin-table-note">Menampilkan 5 dari {rows.length} baris.</p>}
          </div>
        )}
        <p className="organization-help account-form-help">
          Akun baru dibuat dengan kata sandi awal <strong>pal@123</strong> dan wajib diganti saat masuk pertama. Untuk file yang diperbarui: NIP yang sudah terdaftar <strong>diperbarui</strong> (nama, divisi, departemen, jabatan, pendidikan). Sel kosong tidak menghapus data lama; email, kata sandi, dan biro tidak diubah (biro dikosongkan hanya jika departemen berpindah). Divisi dan Departemen baru otomatis ditambahkan ke master data.
        </p>
        {preview && !result && (
          <section aria-label="Pratinjau perubahan" className="import-diff">
            <h4><Search size={15} /> Pratinjau (belum disimpan)</h4>
            <dl className="import-diff-stats">
              <div><dt>Akun baru</dt><dd>{preview.created}</dd></div>
              <div><dt>Diperbarui</dt><dd>{preview.updated}</dd></div>
              <div><dt>Tidak berubah</dt><dd>{preview.unchanged}</dd></div>
              <div><dt>Dilewati</dt><dd>{preview.skipped}</dd></div>
            </dl>
            <ul className="import-diff-notes">
              {preview.nip_zero_restored > 0 && <li>{preview.nip_zero_restored} NIP dilengkapi angka 0 di depan{preview.nip_updated > 0 ? `; ${preview.nip_updated} akun lama akan mengganti NIP-nya` : ''}.</li>}
              {preview.matched_by_verifiers > 0 && <li>{preview.matched_by_verifiers} akun dicocokkan lewat nama dan kolom lain (divisi, departemen, jabatan, pendidikan) karena NIP-nya tidak ditemukan; NIP akunnya akan diganti sesuai Excel.</li>}
              {preview.new_divisions + preview.new_departments > 0 && <li>Master data bertambah {preview.new_divisions} divisi dan {preview.new_departments} departemen.</li>}
              {preview.biro_cleared > 0 && <li>{preview.biro_cleared} akun dikosongkan biro-nya karena berpindah departemen.</li>}
              {preview.not_in_file > 0 && <li>{preview.not_in_file} akun yang sudah terdaftar tidak ada di file ini (tidak diubah dan tidak dinonaktifkan).</li>}
              {preview.skipped > 0 && <li>{preview.skipped} baris dilewati karena NIP dipakai akun admin.</li>}
              {preview.invalid_count > 0 && <li>{preview.invalid_count} baris tidak valid:{' '}{preview.invalid.slice(0, 5).map((item) => `baris ${item.line} (${item.message})`).join(', ')}{preview.invalid_count > 5 ? ', ...' : ''}</li>}
            </ul>
            {preview.changes?.length > 0 && (
              <div className="admin-table-scroll import-preview">
                <table className="admin-table">
                  <thead><tr><th>NIP</th><th>NAMA</th><th>YANG BERUBAH</th></tr></thead>
                  <tbody>
                    {preview.changes.map((change) => (
                      <tr key={change.employee_number}><td>{change.employee_number}</td><td>{change.name}</td><td>{change.fields.join(', ')}{change.matched_by_verifiers ? ` (dicocokkan lewat nama; NIP lama ${change.old_employee_number})` : ''}</td></tr>
                    ))}
                  </tbody>
                </table>
                {preview.updated > preview.changes.length && <p className="admin-table-note">Menampilkan {preview.changes.length} dari {preview.updated} akun yang diperbarui.</p>}
              </div>
            )}
            {preview.not_in_file_accounts?.length > 0 && (
              <details className="import-missing">
                <summary>{preview.not_in_file} akun yang NIP-nya tidak ditemukan di Excel terbaru</summary>
                <p className="organization-help">
                  Datanya sudah ada di sistem tetapi tidak ada baris yang cocok di file ini, baik lewat NIP maupun lewat nama dan kolom lain. Akun ini tidak diubah dan tidak dinonaktifkan. Jika seharusnya ada barisnya, samakan nama, divisi, departemen, jabatan, atau pendidikan di Excel lalu periksa lagi.
                </p>
                <div className="admin-table-scroll import-preview">
                  <table className="admin-table">
                    <thead><tr><th>NIP</th><th>NAMA</th><th>DIVISI / DEPARTEMEN</th></tr></thead>
                    <tbody>
                      {preview.not_in_file_accounts.map((account) => (
                        <tr key={account.employee_number}>
                          <td>{account.employee_number}</td>
                          <td>{account.name}</td>
                          <td>{[account.division, account.department].filter(Boolean).join(' / ') || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {preview.not_in_file > preview.not_in_file_accounts.length && <p className="admin-table-note">Menampilkan {preview.not_in_file_accounts.length} dari {preview.not_in_file} akun.</p>}
                </div>
              </details>
            )}
            {!hasChanges && <p className="organization-help">Tidak ada akun baru maupun yang berubah, jadi tidak ada yang perlu diterapkan.</p>}
          </section>
        )}
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
            <button className="apply-button" disabled={isImporting || !rows.length || (preview && !hasChanges)} type="submit">
              {isImporting
                ? (preview ? 'Menerapkan...' : 'Memeriksa...')
                : preview
                  ? <><Upload size={16} /> Terapkan {preview.created + preview.updated} perubahan</>
                  : <><Search size={16} /> Periksa perubahan</>}
            </button>
          )}
        </div>
      </form>
    </AdminFormDialog>
  )
}
