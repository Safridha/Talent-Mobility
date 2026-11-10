import { useState } from 'react'
import { ArrowRight, UploadCloud, X } from 'lucide-react'
import ModalBackdrop from '../../components/ModalBackdrop'

const MAX_APPLICATION_FILE_BYTES = 5 * 1024 * 1024
const MAX_APPLICATION_DOCUMENTS = 5

export default function ApplicationForm({ job, session, divisions, isSubmitting, onClose, onSubmit }) {
  const [form, setForm] = useState({
    employee_number: '',
    applicant_full_name: session.applicant.name,
    origin_division: '',
    origin_unit: '',
    education_level: '',
    study_field: '',
    motivation: '',
  })
  const [supportingFiles, setSupportingFiles] = useState([])
  const [error, setError] = useState('')

  function updateField(event) {
    const { name, value } = event.target
    setForm((current) => ({ ...current, [name]: value }))
  }

  function updateFiles(event) {
    const files = Array.from(event.target.files ?? [])
    event.target.value = ''
    setError('')
    if (supportingFiles.length + files.length > MAX_APPLICATION_DOCUMENTS) {
      setError('Maksimal 5 berkas pendukung dapat diunggah.')
      return
    }
    if (files.some((file) => file.size > MAX_APPLICATION_FILE_BYTES || !file.name.toLowerCase().endsWith('.pdf'))) {
      setError('Setiap berkas harus berupa PDF dengan ukuran maksimal 5 MB.')
      return
    }
    setSupportingFiles((current) => [...current, ...files])
  }

  function removeSupportingFile(index) {
    setSupportingFiles((current) => current.filter((_, fileIndex) => fileIndex !== index))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    const body = new FormData()
    body.set('job_id', job.id)
    body.set('employee_number', form.employee_number)
    body.set('applicant_full_name', form.applicant_full_name)
    body.set('origin_division', form.origin_division)
    body.set('origin_unit', form.origin_unit)
    body.set('education_level', form.education_level)
    body.set('study_field', form.study_field)
    body.set('motivation', form.motivation)
    if (supportingFiles.length === 0) {
      setError('Unggah setidaknya satu berkas PDF pendukung.')
      return
    }
    supportingFiles.forEach((file) => body.append('supporting_document', file))
    try {
      await onSubmit(body)
    } catch (submitError) {
      setError(submitError.message)
    }
  }

  return (
    <ModalBackdrop className="modal-backdrop application-form-backdrop" onDismiss={onClose}>
      <section
        aria-labelledby="application-form-title"
        aria-modal="true"
        className="detail-modal application-form-modal"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <header className="application-form-header">
          <div>
            <span>FORMULIR PENGAJUAN INTERNAL</span>
            <h2 id="application-form-title">Mutasi &amp; Rotasi Karier Pegawai</h2>
            <p>Lengkapi data profil dan dokumen pendukung sesuai rekam jejak Anda.</p>
          </div>
          <button aria-label="Tutup formulir lamaran" className="job-detail-close" onClick={onClose} type="button"><X size={21} /></button>
        </header>
        <form className="application-form-shell" onSubmit={handleSubmit}>
          <div className="application-form-body">
            <div className="application-target-position">
              <strong>POSISI &amp; PENEMPATAN TUJUAN:</strong>
              <b>[{job.id}] {job.title}</b>
              <span>{job.division} › {job.department} › {job.unit}</span>
            </div>
            <div className="application-form-grid">
              <label htmlFor="application-employee-number">
                <span className="application-form-label">Nomor Induk Pegawai (NIP) <em>*</em></span>
                <input autoComplete="off" id="application-employee-number" maxLength={40} name="employee_number" onChange={updateField} placeholder="Contoh: 19890412201" required value={form.employee_number} />
              </label>
              <label htmlFor="application-full-name">
                <span className="application-form-label">Nama Lengkap Sesuai ID <em>*</em></span>
                <input autoComplete="name" id="application-full-name" maxLength={200} name="applicant_full_name" onChange={updateField} placeholder="Contoh: Budi Santoso, S.T." required value={form.applicant_full_name} />
              </label>
              <label htmlFor="application-origin-division">
                <span className="application-form-label">Divisi Asal Saat Ini <em>*</em></span>
                <select id="application-origin-division" name="origin_division" onChange={updateField} required value={form.origin_division}>
                  <option value="">-- Pilih Divisi Asal --</option>
                  {divisions.map((division) => <option key={division} value={division}>{division}</option>)}
                </select>
              </label>
              <label htmlFor="application-origin-unit">
                <span className="application-form-label">Departemen / Unit Asal <em>*</em></span>
                <input id="application-origin-unit" maxLength={160} name="origin_unit" onChange={updateField} placeholder="Contoh: Dept. Quality Assurance" required value={form.origin_unit} />
              </label>
              <label htmlFor="application-education-level">
                <span className="application-form-label">Jenjang Pendidikan <em>*</em></span>
                <select id="application-education-level" name="education_level" onChange={updateField} required value={form.education_level}>
                  <option value="">-- Pilih Jenjang --</option>
                  {['SMA/SMK', 'D1', 'D2', 'D3', 'D4/S1', 'S2', 'S3', 'Lainnya'].map((level) => <option key={level} value={level}>{level}</option>)}
                </select>
              </label>
              <label htmlFor="application-study-field">
                <span className="application-form-label">Jurusan / Bidang Studi <em>*</em></span>
                <input id="application-study-field" maxLength={160} name="study_field" onChange={updateField} placeholder="Contoh: Teknik Perkapalan / Teknik Mesin" required value={form.study_field} />
              </label>
              <label className="application-form-wide" htmlFor="application-motivation">
                <span className="application-form-label">Motivasi &amp; Rencana Kontribusi di Unit Tujuan <em>*</em></span>
                <textarea id="application-motivation" maxLength={3000} name="motivation" onChange={updateField} placeholder="Jelaskan alasan Anda ingin beralih tugas ke posisi ini serta kemampuan utama yang bisa Anda berikan..." required rows="3" value={form.motivation} />
              </label>
              <label className="application-form-wide">
                <span className="application-form-label">Upload Berkas Pendukung (CV / Riwayat Kinerja) <em>*</em></span>
                <span className="application-upload">
                  <span className="application-upload-icon"><UploadCloud size={24} /></span>
                  <strong>Klik untuk memilih berkas (Format PDF)</strong>
                  <small>Hingga {MAX_APPLICATION_DOCUMENTS} berkas, maksimal 5 MB per berkas</small>
                  <input accept=".pdf,application/pdf" id="application-cv" multiple onChange={updateFiles} type="file" />
                </span>
              </label>
              {supportingFiles.length > 0 && (
                <ul className="application-selected-files application-form-wide">
                  {supportingFiles.map((file, index) => (
                    <li key={`${file.name}-${file.size}-${file.lastModified}-${index}`}>
                      <span>{file.name}</span>
                      <button aria-label={`Hapus ${file.name}`} onClick={() => removeSupportingFile(index)} type="button"><X size={15} /></button>
                    </li>
                  ))}
                </ul>
              )}
              {supportingFiles.length > 0 && (
                <p className="application-file-count application-form-wide">{supportingFiles.length} dari {MAX_APPLICATION_DOCUMENTS} berkas dipilih</p>
              )}
              {error && <p className="login-error application-form-wide" role="alert">{error}</p>}
            </div>
          </div>
          <footer className="application-form-footer">
            <button className="application-form-cancel" onClick={onClose} type="button">Batal</button>
            <button className="apply-button" disabled={isSubmitting} type="submit">
              {isSubmitting ? 'Mengirim...' : 'Kirim Pendaftaran'} <ArrowRight size={16} />
            </button>
          </footer>
        </form>
      </section>
    </ModalBackdrop>
  )
}
