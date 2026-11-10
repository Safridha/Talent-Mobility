import { useState } from 'react'
import { Save, X } from 'lucide-react'
import ModalBackdrop from '../../components/ModalBackdrop'

export function JobEditor({ job, onClose, onSave, organization, jobTypes, adminRole = 'super_admin', hasApplications = false }) {
  const [form, setForm] = useState(() => job ? {
    id: job.id,
    title: job.title,
    target_level: job.target_level || 'bureau',
    division_id: String(job.division_id),
    department_id: job.department_id ? String(job.department_id) : '',
    bureau_id: job.bureau_id ? String(job.bureau_id) : '',
    location: job.location,
    quota: job.quota,
    posted: job.posted,
    job_type: job.type || job.job_type,
    summary: job.summary,
  } : {
    id: '',
    title: '',
    target_level: adminRole === 'department_head' ? 'department' : 'bureau',
    division_id: '',
    department_id: '',
    bureau_id: '',
    location: '',
    quota: 1,
    posted: '',
    job_type: jobTypes[0]?.name || '',
    summary: '',
  })
  const [internalSpecsText, setInternalSpecsText] = useState((job?.skills || []).join('\n'))
  const [responsibilitiesText, setResponsibilitiesText] = useState((job?.responsibilities || []).join('\n'))
  const [error, setError] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const editing = Boolean(job)

  function updateField(event) {
    const { name, value, type, checked } = event.target
    setForm((current) => ({ ...current, [name]: type === 'checkbox' ? checked : value }))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    setIsSaving(true)
    const lines = (text) => text.split(/\r?\n/).map((value) => value.trim()).filter(Boolean)
    try {
      await onSave({
        id: form.id.trim(),
        title: form.title,
        target_level: form.target_level,
        division_id: Number(form.division_id),
        department_id: ['department', 'bureau'].includes(form.target_level) ? Number(form.department_id) : null,
        bureau_id: form.target_level === 'bureau' ? Number(form.bureau_id) : null,
        location: form.location,
        quota: Number(form.quota),
        posted: form.posted,
        job_type: form.job_type,
        summary: form.summary,
        skills: lines(internalSpecsText),
        responsibilities: lines(responsibilitiesText),
      })
      onClose()
    } catch (saveError) {
      setError(saveError.message)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <ModalBackdrop onDismiss={onClose}>
      <section aria-labelledby="job-editor-title" aria-modal="true" className="detail-modal admin-editor-modal" onClick={(event) => event.stopPropagation()} role="dialog">
        <div className="modal-heading">
          <h2 id="job-editor-title">{editing ? 'Edit lowongan' : 'Tambah lowongan'}</h2>
          <button aria-label="Tutup form" className="icon-button" onClick={onClose} type="button"><X size={20} /></button>
        </div>
        <form className="admin-job-form" onSubmit={handleSubmit}>
          <p className="organization-help admin-form-wide"><em>*</em> Semua kolom bertanda bintang wajib diisi.</p>
          <label><span>Kode posisi <em>*</em></span><input disabled={editing} maxLength={64} name="id" onChange={updateField} required value={form.id} /></label>
          <label><span>Nama posisi <em>*</em></span><input name="title" onChange={updateField} required value={form.title} /></label>
          <label><span>Tingkat target lowongan <em>*</em></span>
            <select
              disabled={hasApplications}
              onChange={(event) => {
                const targetLevel = event.target.value
                const selectedDivision = organization.divisions.find(
                  (division) => String(division.id) === form.division_id,
                )
                setForm((current) => ({
                  ...current,
                  target_level: targetLevel,
                  division_id: targetLevel === 'secretariat' && !selectedDivision?.secretariat_name
                    ? ''
                    : current.division_id,
                  department_id: ['department', 'bureau'].includes(targetLevel) ? current.department_id : '',
                  bureau_id: targetLevel === 'bureau' ? current.bureau_id : '',
                }))
              }}
              required
              value={form.target_level}
            >
              {adminRole !== 'department_head' && <option value="division">Divisi</option>}
              {adminRole !== 'department_head' && organization.divisions.some((division) => division.secretariat_name) && (
                <option value="secretariat">Sekretariat Divisi</option>
              )}
              <option value="department">Departemen</option>
              <option value="bureau">Biro / Bengkel</option>
            </select>
          </label>
          <label><span>Divisi <em>*</em></span>
            <select disabled={hasApplications} onChange={(event) => setForm((current) => ({ ...current, division_id: event.target.value, department_id: '', bureau_id: '' }))} required value={form.division_id}>
              <option value="">Pilih divisi</option>
              {organization.divisions
                .filter((division) => form.target_level !== 'secretariat' || division.secretariat_name)
                .map((division) => <option key={division.id} value={division.id}>{division.name}</option>)}
            </select>
          </label>
          {['department', 'bureau'].includes(form.target_level) && <label><span>Departemen <em>*</em></span>
            <select disabled={hasApplications || !form.division_id} onChange={(event) => setForm((current) => ({ ...current, department_id: event.target.value, bureau_id: '' }))} required value={form.department_id}>
              <option value="">Pilih departemen</option>
              {organization.departments.filter((department) => String(department.division_id) === form.division_id).map((department) => (
                <option key={department.id} value={department.id}>{department.name}</option>
              ))}
            </select>
          </label>}
          {form.target_level === 'bureau' && <label><span>Biro / bengkel <em>*</em></span>
            <select disabled={hasApplications || !form.department_id} name="bureau_id" onChange={updateField} required value={form.bureau_id}>
              <option value="">Pilih biro / bengkel</option>
              {organization.bureaus.filter((bureau) => String(bureau.department_id) === form.department_id).map((bureau) => (
                <option key={bureau.id} value={bureau.id}>
                  {bureau.unit_type === 'bengkel' ? 'Bengkel' : 'Biro'} — {bureau.name}
                </option>
              ))}
            </select>
          </label>}
          <p className="organization-help admin-form-wide">
            {hasApplications
              ? 'Target organisasi dikunci karena lowongan sudah menerima lamaran.'
              : `Lamaran hanya akan terlihat oleh administrator yang berwenang pada target ${form.target_level === 'bureau' ? 'biro / bengkel' : form.target_level === 'department' ? 'departemen' : form.target_level === 'secretariat' ? 'sekretariat divisi' : 'divisi'} dan tingkat di atasnya.`}
          </p>
          <label><span>Lokasi penempatan <em>*</em></span>
            <input name="location" onChange={updateField} placeholder="Contoh: Surabaya / area galangan" required value={form.location} />
            <small className="admin-field-help">Kota atau area kerja unit tujuan; informasi ini ditampilkan kepada pelamar.</small>
          </label>
          <label><span>Kuota <em>*</em></span><input min="0" name="quota" onChange={updateField} required type="number" value={form.quota} /></label>
          <label><span>Tanggal / waktu tayang <em>*</em></span><input name="posted" onChange={updateField} required value={form.posted} /></label>
          <label><span>Jenis pekerjaan <em>*</em></span>
            <select name="job_type" onChange={updateField} required value={form.job_type}>
              <option value="">Pilih jenis pekerjaan</option>
              {jobTypes.map((jobType) => (
                <option key={jobType.id} value={jobType.name}>{jobType.name}</option>
              ))}
            </select>
          </label>
          <label className="admin-form-wide"><span>Ringkasan tugas <em>*</em></span><textarea name="summary" onChange={updateField} placeholder="Ringkas tujuan posisi dan hasil utama yang diharapkan." required rows="3" value={form.summary} /></label>
          <label><span>Spesifikasi internal <em>*</em></span><textarea onChange={(event) => setInternalSpecsText(event.target.value)} placeholder="Satu kebutuhan per baris: pengalaman proses kerja, kompetensi, atau sertifikasi internal." required rows="3" value={internalSpecsText} /></label>
          <label><span>Tanggung jawab &amp; deskripsi tugas <em>*</em></span><textarea onChange={(event) => setResponsibilitiesText(event.target.value)} placeholder="Satu tugas spesifik per baris sesuai pekerjaan di unit tujuan." required rows="3" value={responsibilitiesText} /></label>
          {error && <p className="login-error admin-form-wide" role="alert">{error}</p>}
          <div className="admin-form-actions admin-form-wide">
            <button className="detail-button" onClick={onClose} type="button">Batal</button>
            <button className="apply-button" disabled={isSaving} type="submit"><Save size={16} /> {isSaving ? 'Menyimpan...' : 'Simpan lowongan'}</button>
          </div>
        </form>
      </section>
    </ModalBackdrop>
  )
}
