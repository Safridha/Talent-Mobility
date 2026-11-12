import { useEffect, useState } from 'react'
import { ArrowRight, UploadCloud, X } from 'lucide-react'
import ModalBackdrop from '../../components/ModalBackdrop'
import SearchableSelect from '../../components/SearchableSelect'
import { apiRequest } from '../../api'
import { toApplicationEducation } from '../account/employeeOptions'
import { getJobTargetLabels } from './jobTargetLabels'

const MAX_APPLICATION_FILE_BYTES = 5 * 1024 * 1024
const MAX_APPLICATION_DOCUMENTS = 5

export default function ApplicationForm({ job, directTarget, session, organization, isSubmitting, onClose, onEditProfile, onSubmit }) {
  const [form, setForm] = useState({
    employee_number: '',
    applicant_full_name: session.applicant.name,
    origin_division: '',
    education_level: '',
    study_field: '',
    motivation: '',
  })
  // Data the applicant already keeps in their profile is shown as a summary instead of asked again.
  const [profile, setProfile] = useState(null)
  const [profileError, setProfileError] = useState('')
  const [bureauMaster, setBureauMaster] = useState(null)
  const [bureauMode, setBureauMode] = useState('none') // none | master | manual
  const [profileBureauId, setProfileBureauId] = useState('')
  const [manualBureau, setManualBureau] = useState('')
  const [originDepartmentId, setOriginDepartmentId] = useState('')
  const [originBureauId, setOriginBureauId] = useState('')
  const [supportingFiles, setSupportingFiles] = useState([])
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    apiRequest('/account/profile')
      .then((response) => { if (active) setProfile(response) })
      .catch((requestError) => { if (active) setProfileError(requestError.message) })
    apiRequest('/account/employee-master')
      .then((response) => { if (active) setBureauMaster(response) })
      .catch(() => { if (active) setBureauMaster({ bureaus: [] }) })
    return () => { active = false }
  }, [])

  const hasNip = Boolean(profile?.employee_number)
  const hasDivision = Boolean(profile?.division_name)
  const hasUnit = Boolean(profile?.department_name)
  const hasEducation = Boolean(profile?.last_education)
  const needsOrigin = !hasDivision || !hasUnit
  // Biro/Bengkel comes from the roster master data. If the department has any and the profile has none yet,
  // it must be picked here (and is saved to the profile).
  const departmentBureaus = (bureauMaster?.bureaus ?? []).filter(
    (bureau) => String(bureau.department_id) === String(profile?.department_id),
  )
  // Biro/Bengkel is optional. If the profile already has one it is summarised; otherwise the applicant may
  // skip it, pick one from the master data (saved to the profile) or type one manually (this application only).
  const showBureauForm = Boolean(profile) && !needsOrigin && !profile.bureau_id
  const chosenMasterBureau = departmentBureaus.find((bureau) => String(bureau.id) === profileBureauId)
  const selectedProfileBureau = profile?.bureau_id
    ? profile.bureau_name
    : !showBureauForm
      ? ''
      : bureauMode === 'master'
        ? chosenMasterBureau?.name || ''
        : bureauMode === 'manual'
          ? manualBureau.trim()
          : ''

  function updateField(event) {
    const { name, value } = event.target
    setForm((current) => ({ ...current, [name]: value }))
    if (name === 'origin_division') {
      setOriginDepartmentId('')
      setOriginBureauId('')
    }
  }

  const selectedOriginDivision = organization.divisions.find(
    (division) => division.name === form.origin_division,
  )
  const originDepartments = organization.departments.filter(
    (department) => String(department.division_id) === String(selectedOriginDivision?.id),
  )
  const selectedOriginDepartment = originDepartments.find(
    (department) => String(department.id) === originDepartmentId,
  )
  const originBureaus = organization.bureaus.filter(
    (bureau) => String(bureau.department_id) === originDepartmentId,
  )
  const selectedOriginBureau = originBureaus.find(
    (bureau) => String(bureau.id) === originBureauId,
  )
  const selectedOriginUnit = originDepartmentId === 'secretariat'
    ? selectedOriginDivision?.secretariat_name
    : selectedOriginDepartment && selectedOriginBureau
      ? `${selectedOriginDepartment.name} / ${selectedOriginBureau.name}`
      : selectedOriginDepartment?.name

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
    if (!profile || !bureauMaster) return
    if (needsOrigin && !selectedOriginUnit) {
      setError('Pilih departemen atau unit asal dari data master organisasi.')
      return
    }
    const body = new FormData()
    if (directTarget) {
      body.set('target_department_id', String(directTarget.target_department_id))
      if (directTarget.target_bureau_id) body.set('target_bureau_id', String(directTarget.target_bureau_id))
    } else {
      body.set('job_id', job.id)
    }
    body.set('employee_number', hasNip ? profile.employee_number : form.employee_number)
    body.set('applicant_full_name', profile.name || form.applicant_full_name)
    body.set('origin_division', needsOrigin ? form.origin_division : profile.division_name)
    if (showBureauForm && bureauMode === 'master' && !profileBureauId) {
      setError('Pilih biro / bengkel dari daftar, atau pilih opsi lain.')
      return
    }
    if (showBureauForm && bureauMode === 'manual' && !manualBureau.trim()) {
      setError('Tulis nama biro / bengkel, atau pilih "Tidak ada".')
      return
    }
    const profileUnit = selectedProfileBureau
      ? `${profile.department_name} / ${selectedProfileBureau}`.slice(0, 160)
      : profile.department_name
    body.set('origin_unit', needsOrigin ? selectedOriginUnit : profileUnit)
    body.set('education_level', hasEducation ? toApplicationEducation(profile.last_education) : form.education_level)
    body.set('study_field', form.study_field)
    body.set('motivation', form.motivation)
    if (supportingFiles.length === 0) {
      setError('Unggah setidaknya satu berkas PDF pendukung.')
      return
    }
    if (directTarget) {
      body.append('cv', supportingFiles[0])
      supportingFiles.slice(1).forEach((file) => body.append('supporting_document', file))
    } else {
      supportingFiles.forEach((file) => body.append('supporting_document', file))
    }
    try {
      // Only a bureau picked from the master data is saved to the profile; manual text never is.
      if (showBureauForm && bureauMode === 'master') {
        await apiRequest('/account/employee-profile', {
          method: 'PUT',
          body: JSON.stringify({
            division_id: profile.division_id,
            department_id: profile.department_id,
            bureau_id: Number(profileBureauId),
            position_title: profile.position_title || '',
            last_education: profile.last_education || '',
          }),
        })
      }
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
              <b>{directTarget ? directTarget.title : `[${job.id}] ${job.title}`}</b>
              <span>{directTarget
                ? [directTarget.division, directTarget.department, directTarget.unit].filter(Boolean).join(' › ')
                : getJobTargetLabels(job).join(' › ')}</span>
            </div>
            {profileError && <p className="login-error" role="alert">{profileError}</p>}
            {(!profile || !bureauMaster) && !profileError && <p className="application-profile-loading">Memuat data profil...</p>}
            {profile && bureauMaster && (
              <section aria-label="Ringkasan data Anda" className="application-profile-summary">
                <header>
                  <strong>Data Anda dari profil</strong>
                  {onEditProfile && <button onClick={onEditProfile} type="button">Ubah di profil</button>}
                </header>
                <dl>
                  <div><dt>Nama</dt><dd>{profile.name}</dd></div>
                  {hasNip && <div><dt>NIP</dt><dd>{profile.employee_number}</dd></div>}
                  {hasDivision && <div><dt>Divisi</dt><dd>{profile.division_name}</dd></div>}
                  {hasUnit && <div><dt>Departemen</dt><dd>{profile.department_name}</dd></div>}
                  {hasUnit && (
                    <div>
                      <dt>Biro / Bengkel</dt>
                      <dd>{profile.bureau_name || <span className="application-summary-empty">Belum diisi</span>}</dd>
                    </div>
                  )}
                  {profile.position_title && <div><dt>Jabatan</dt><dd>{profile.position_title}</dd></div>}
                  {hasEducation && <div><dt>Pendidikan</dt><dd>{profile.last_education}</dd></div>}
                </dl>
                {(!hasNip || needsOrigin || !hasEducation) && (
                  <p>Lengkapi data yang belum ada di profil pada formulir di bawah.</p>
                )}
              </section>
            )}
            <div className="application-form-grid">
              {!hasNip && (
              <label htmlFor="application-employee-number">
                <span className="application-form-label">Nomor Induk Pegawai (NIP) <em>*</em></span>
                <input autoComplete="off" id="application-employee-number" maxLength={40} name="employee_number" onChange={updateField} placeholder="Contoh: 19890412201" required value={form.employee_number} />
              </label>
              )}

              {needsOrigin && (
                <>
              <label htmlFor="application-origin-division">
                <span className="application-form-label">Divisi Asal Saat Ini <em>*</em></span>
                <SearchableSelect
                  disabled={!organization.divisions.length}
                  id="application-origin-division"
                  name="origin_division"
                  onChange={(value) => {
                    setForm((current) => ({ ...current, origin_division: value }))
                    setOriginDepartmentId('')
                    setOriginBureauId('')
                  }}
                  options={organization.divisions.map((division) => ({ value: division.name, label: division.name }))}
                  placeholder="Pilih divisi asal"
                  required
                  value={form.origin_division}
                />
              </label>
              <label htmlFor="application-origin-department">
                <span className="application-form-label">Departemen / Sekretariat Asal <em>*</em></span>
                <SearchableSelect
                  disabled={!selectedOriginDivision}
                  id="application-origin-department"
                  onChange={(value) => {
                    setOriginDepartmentId(value)
                    setOriginBureauId('')
                  }}
                  options={[
                    ...(selectedOriginDivision?.secretariat_name
                      ? [{ value: 'secretariat', label: `Sekretariat - ${selectedOriginDivision.secretariat_name}` }]
                      : []),
                    ...originDepartments.map((department) => ({ value: String(department.id), label: department.name })),
                  ]}
                  placeholder="Pilih departemen / sekretariat"
                  required
                  value={originDepartmentId}
                />
              </label>
              <label htmlFor="application-origin-bureau">
                <span className="application-form-label">Biro / Bengkel Asal (opsional)</span>
                <SearchableSelect
                  disabled={!selectedOriginDepartment}
                  id="application-origin-bureau"
                  onChange={setOriginBureauId}
                  options={[
                    { value: '', label: 'Tidak ada / tingkat departemen' },
                    ...originBureaus.map((bureau) => ({
                      value: String(bureau.id),
                      label: `${bureau.unit_type === 'bengkel' ? 'Bengkel' : 'Biro'} - ${bureau.name}`,
                    })),
                  ]}
                  placeholder="Tidak ada / tingkat departemen"
                  value={originBureauId}
                />
              </label>
                </>
              )}
              {showBureauForm && (
                <fieldset className="application-form-wide application-bureau-field">
                  <legend className="application-form-label">Biro / Bengkel Asal <small>(opsional)</small></legend>
                  <div className="application-bureau-options" role="radiogroup">
                    <label>
                      <input checked={bureauMode === 'none'} name="bureau-mode" onChange={() => setBureauMode('none')} type="radio" />
                      <span>Tidak ada / tidak perlu diisi</span>
                    </label>
                    <label className={departmentBureaus.length ? '' : 'is-disabled'}>
                      <input checked={bureauMode === 'master'} disabled={!departmentBureaus.length} name="bureau-mode" onChange={() => setBureauMode('master')} type="radio" />
                      <span>Pilih dari daftar{departmentBureaus.length ? '' : ' (belum ada untuk departemen ini)'}</span>
                    </label>
                    <label>
                      <input checked={bureauMode === 'manual'} name="bureau-mode" onChange={() => setBureauMode('manual')} type="radio" />
                      <span>Tulis manual</span>
                    </label>
                  </div>
                  {bureauMode === 'master' && (
                    <>
                      <SearchableSelect
                        id="application-profile-bureau"
                        onChange={setProfileBureauId}
                        options={departmentBureaus.map((bureau) => ({ value: String(bureau.id), label: bureau.name }))}
                        placeholder="Pilih biro / bengkel asal"
                        required
                        value={profileBureauId}
                      />
                      <small className="application-form-hint">Hanya biro / bengkel di bawah {profile.department_name}. Akan disimpan di profil Anda, jadi tidak perlu diisi lagi.</small>
                    </>
                  )}
                  {bureauMode === 'manual' && (
                    <>
                      <input
                        autoComplete="off"
                        maxLength={80}
                        onChange={(event) => setManualBureau(event.target.value)}
                        placeholder="Contoh: Biro Perancangan Kapal"
                        required
                        value={manualBureau}
                      />
                      <small className="application-form-hint">Hanya dipakai untuk lamaran ini. Input tidak disimpan di profil.</small>
                    </>
                  )}
                </fieldset>
              )}
              {!hasEducation && (
              <label htmlFor="application-education-level">
                <span className="application-form-label">Jenjang Pendidikan <em>*</em></span>
                <SearchableSelect
                  id="application-education-level"
                  name="education_level"
                  onChange={(value) => setForm((current) => ({ ...current, education_level: value }))}
                  options={['SMA/SMK', 'D1', 'D2', 'D3', 'D4/S1', 'S2', 'S3', 'Lainnya'].map((level) => ({ value: level, label: level }))}
                  placeholder="Pilih jenjang"
                  required
                  value={form.education_level}
                />
              </label>
              )}
              <label htmlFor="application-study-field">
                <span className="application-form-label">Jurusan / Bidang Studi <em>*</em></span>
                <input id="application-study-field" maxLength={160} name="study_field" onChange={updateField} placeholder="Contoh: Teknik Perkapalan / Teknik Mesin" required value={form.study_field} />
              </label>
              <label className="application-form-wide" htmlFor="application-motivation">
                <span className="application-form-label">Motivasi &amp; Rencana Kontribusi di Unit Tujuan <em>*</em></span>
                <textarea id="application-motivation" maxLength={3000} name="motivation" onChange={updateField} placeholder="Jelaskan alasan Anda ingin beralih tugas ke posisi ini serta kemampuan utama yang bisa Anda berikan..." required rows="3" value={form.motivation} />
              </label>
              <label className="application-form-wide">
                <span className="application-form-label">{directTarget ? 'Upload CV (wajib) dan berkas pendukung' : 'Upload Berkas Pendukung (CV / Riwayat Kinerja)'} <em>*</em></span>
                <span className="application-upload">
                  <span className="application-upload-icon"><UploadCloud size={24} /></span>
                  <strong>Klik untuk memilih {directTarget ? 'CV dan berkas pendukung' : 'berkas'} (Format PDF)</strong>
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
