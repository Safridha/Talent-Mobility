import { useState } from 'react'
import { Save, X } from 'lucide-react'
import ModalBackdrop from '../../components/ModalBackdrop'
import SearchableSelect from '../../components/SearchableSelect'

function toDateTimeLocal(value) {
  const match = /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2}))?/.exec(value || '')
  return match ? `${match[1]}T${match[2] || '00:00'}` : ''
}

export function JobEditor({ job, onClose, onSave, organization, jobTypes, adminRole = 'super_admin', admin = {}, hasApplications = false }) {
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
  const isDivisionHead = adminRole === 'division_head'
  const isDepartmentHead = adminRole === 'department_head'
  const fixedDepartmentId = isDepartmentHead ? String(admin.department_id ?? '') : ''
  const fixedDepartment = organization.departments.find(
    (department) => String(department.id) === fixedDepartmentId,
  )
  const divisionId = isDivisionHead
    ? String(admin.division_id ?? '')
    : isDepartmentHead
      ? String(fixedDepartment?.division_id ?? '')
      : form.division_id
  const departmentId = isDepartmentHead ? fixedDepartmentId : form.department_id
  const selectedDivision = organization.divisions.find(
    (division) => String(division.id) === divisionId,
  )
  const scopeReady = (!isDivisionHead || Boolean(divisionId))
    && (!isDepartmentHead || Boolean(divisionId && departmentId))
  const dateTimeValue = toDateTimeLocal(form.posted)

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
        division_id: Number(divisionId),
        department_id: ['department', 'bureau'].includes(form.target_level) ? Number(departmentId) : null,
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
            <SearchableSelect
              disabled={hasApplications}
              onChange={(targetLevel) => {
                setForm((current) => ({
                  ...current,
                  target_level: targetLevel,
                  division_id: !isDivisionHead
                    && !isDepartmentHead
                    && targetLevel === 'secretariat'
                    && !selectedDivision?.secretariat_name
                    ? ''
                    : current.division_id,
                  department_id: isDepartmentHead
                    ? current.department_id
                    : ['department', 'bureau'].includes(targetLevel) ? current.department_id : '',
                  bureau_id: targetLevel === 'bureau' ? current.bureau_id : '',
                }))
              }}
              options={[
                ...(!isDepartmentHead ? [{ value: 'division', label: 'Divisi' }] : []),
                ...(!isDepartmentHead && (isDivisionHead
                  ? Boolean(selectedDivision?.secretariat_name)
                  : organization.divisions.some((division) => division.secretariat_name))
                  ? [{ value: 'secretariat', label: 'Sekretariat Divisi' }]
                  : []),
                { value: 'department', label: 'Departemen' },
                { value: 'bureau', label: 'Biro / Bengkel' },
              ]}
              required
              value={form.target_level}
            />
          </label>
          {isDivisionHead && <p className="organization-help admin-form-wide">
            Divisi: {selectedDivision?.name || 'Memuat divisi akun...'} — otomatis mengikuti cakupan akun Anda.
          </p>}
          {isDepartmentHead && <p className="organization-help admin-form-wide">
            Departemen: {fixedDepartment?.name || 'Memuat departemen akun...'}{selectedDivision ? ` — ${selectedDivision.name}` : ''}. Target otomatis mengikuti cakupan akun Anda.
          </p>}
          {!isDivisionHead && !isDepartmentHead && <label><span>Divisi <em>*</em></span>
            <SearchableSelect
              disabled={hasApplications}
              onChange={(value) => setForm((current) => ({ ...current, division_id: value, department_id: '', bureau_id: '' }))}
              options={organization.divisions
                .filter((division) => form.target_level !== 'secretariat' || division.secretariat_name)
                .map((division) => ({ value: String(division.id), label: division.name }))}
              placeholder="Pilih divisi"
              required
              value={form.division_id}
            />
          </label>}
          {!isDepartmentHead && ['department', 'bureau'].includes(form.target_level) && <label><span>Departemen <em>*</em></span>
            <SearchableSelect
              disabled={hasApplications || !divisionId}
              onChange={(value) => setForm((current) => ({ ...current, department_id: value, bureau_id: '' }))}
              options={organization.departments
                .filter((department) => String(department.division_id) === divisionId)
                .map((department) => ({ value: String(department.id), label: department.name }))}
              placeholder="Pilih departemen"
              required
              value={departmentId}
            />
          </label>}
          {form.target_level === 'bureau' && <label><span>Biro / bengkel <em>*</em></span>
            <SearchableSelect
              disabled={hasApplications || !departmentId}
              name="bureau_id"
              onChange={(value) => setForm((current) => ({ ...current, bureau_id: value }))}
              options={organization.bureaus
                .filter((bureau) => String(bureau.department_id) === departmentId)
                .map((bureau) => ({
                  value: String(bureau.id),
                  label: `${bureau.unit_type === 'bengkel' ? 'Bengkel' : 'Biro'} — ${bureau.name}`,
                }))}
              placeholder="Pilih biro / bengkel"
              required
              value={form.bureau_id}
            />
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
          <label><span>Tanggal / waktu tayang <em>*</em></span>
            <input
              name="posted"
              onChange={updateField}
              required={!editing || Boolean(dateTimeValue)}
              type="datetime-local"
              value={dateTimeValue}
            />
            {editing && !dateTimeValue && form.posted && (
              <small className="admin-field-help">
                Nilai tayang saat ini ({form.posted}) akan dipertahankan jika tidak diubah.
              </small>
            )}
          </label>
          <label><span>Jenis pekerjaan <em>*</em></span>
            <SearchableSelect
              name="job_type"
              onChange={(value) => setForm((current) => ({ ...current, job_type: value }))}
              options={jobTypes.map((jobType) => ({ value: jobType.name, label: jobType.name }))}
              placeholder="Pilih jenis pekerjaan"
              required
              value={form.job_type}
            />
          </label>
          <label className="admin-form-wide"><span>Ringkasan tugas <em>*</em></span><textarea name="summary" onChange={updateField} placeholder="Ringkas tujuan posisi dan hasil utama yang diharapkan." required rows="3" value={form.summary} /></label>
          <label><span>Spesifikasi internal <em>*</em></span><textarea onChange={(event) => setInternalSpecsText(event.target.value)} placeholder="Satu kebutuhan per baris: pengalaman proses kerja, kompetensi, atau sertifikasi internal." required rows="3" value={internalSpecsText} /></label>
          <label><span>Tanggung jawab &amp; deskripsi tugas <em>*</em></span><textarea onChange={(event) => setResponsibilitiesText(event.target.value)} placeholder="Satu tugas spesifik per baris sesuai pekerjaan di unit tujuan." required rows="3" value={responsibilitiesText} /></label>
          {error && <p className="login-error admin-form-wide" role="alert">{error}</p>}
          <div className="admin-form-actions admin-form-wide">
            <button className="detail-button" onClick={onClose} type="button">Batal</button>
            <button className="apply-button" disabled={isSaving || !scopeReady} type="submit"><Save size={16} /> {isSaving ? 'Menyimpan...' : 'Simpan lowongan'}</button>
          </div>
        </form>
      </section>
    </ModalBackdrop>
  )
}
