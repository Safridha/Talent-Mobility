import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowRight,
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Database,
  Download,
  Eye,
  EyeOff,
  FileText,
  GraduationCap,
  Info,
  List,
  LogIn,
  LogOut,
  MapPin,
  Plus,
  Save,
  RotateCcw,
  Search,
  Shield,
  SlidersHorizontal,
  Trash2,
  UploadCloud,
  Users,
  UserPlus,
  Wrench,
  X,
} from 'lucide-react'
import { apiDownload, apiRequest } from './api'
import '../css/App.css'

const MAX_APPLICATION_FILE_BYTES = 5 * 1024 * 1024
const MAX_APPLICATION_DOCUMENTS = 5

function Brand() {
  return (
    <a className="brand" href="#home" aria-label="Empower To Produce">
      <span aria-hidden="true" className="brand-icon">
        <svg fill="none" height="24" viewBox="0 0 24 24" width="24">
          <path d="M16 12V4m0 0-4 4m4-4 4 4M16 12H5m0 0 4-4m-4 4 4 4m7-4v4a4 4 0 0 0 4 4h1" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.8" />
        </svg>
      </span>
      <span className="brand-copy">
        <span className="brand-title">Empower To Produce</span>
        <span className="brand-subtitle">From Potential To Real Contribution</span>
      </span>
    </a>
  )
}

function AuthDialog({ initialMode, onClose, onSuccess }) {
  const [mode, setMode] = useState(initialMode)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const backdropPointer = useRef(null)

  function handleBackdropPointerDown(event) {
    backdropPointer.current = event.target === event.currentTarget
      ? { x: event.clientX, y: event.clientY, moved: false }
      : null
  }

  function handleBackdropPointerMove(event) {
    const pointer = backdropPointer.current
    if (pointer && Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) > 12) {
      pointer.moved = true
    }
  }

  function handleBackdropClick(event) {
    const pointer = backdropPointer.current
    backdropPointer.current = null
    if (event.target === event.currentTarget && pointer && !pointer.moved) onClose()
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    setIsSubmitting(true)
    try {
      const session = await apiRequest(mode === 'register' ? '/register' : '/login', {
        method: 'POST',
        body: JSON.stringify(
          mode === 'register'
            ? { name: name.trim(), email: email.trim(), password }
            : { email: email.trim(), password },
        ),
      })
      onSuccess(session)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div
      className="modal-backdrop auth-backdrop"
      onClick={handleBackdropClick}
      onPointerCancel={() => { backdropPointer.current = null }}
      onPointerDown={handleBackdropPointerDown}
      onPointerMove={handleBackdropPointerMove}
      role="presentation"
    >
      <section
        aria-labelledby="auth-title"
        aria-modal="true"
        className="detail-modal auth-dialog"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className="modal-heading">
          <span className="section-kicker">{mode === 'register' ? 'AKUN PELAMAR' : 'AKUN ANDA'}</span>
          <button aria-label="Tutup" className="icon-button" onClick={onClose} type="button"><X size={20} /></button>
        </div>
        <div className="auth-dialog-content">
          <h2 id="auth-title">{mode === 'register' ? 'Buat akun pelamar' : 'Masuk ke akun Anda'}</h2>
          <p className="login-description">
            {mode === 'register'
              ? 'Belum punya akun? Daftar terlebih dahulu. Jika sudah memiliki akun, pilih Masuk untuk melanjutkan pendaftaran posisi.'
              : 'Setelah berhasil masuk, formulir untuk posisi yang Anda pilih akan terbuka.'}
          </p>
          <form className="login-form" onSubmit={handleSubmit}>
            {mode === 'register' && (
              <>
                <label htmlFor="register-name">Nama lengkap</label>
                <input autoComplete="name" id="register-name" maxLength={200} onChange={(event) => setName(event.target.value)} placeholder="Masukkan nama lengkap" required value={name} />
              </>
            )}
            <label htmlFor="auth-email">Email</label>
            <input autoComplete="email" id="auth-email" onChange={(event) => setEmail(event.target.value)} placeholder="nama@email.com" required type="email" value={email} />
            <label htmlFor="auth-password">Kata sandi</label>
            <div className="password-field">
              <input autoComplete={mode === 'register' ? 'new-password' : 'current-password'} id="auth-password" maxLength={128} minLength={mode === 'register' ? 8 : undefined} onChange={(event) => setPassword(event.target.value)} placeholder={mode === 'register' ? 'Minimal 8 karakter' : 'Masukkan kata sandi'} required type={showPassword ? 'text' : 'password'} value={password} />
              <button aria-label={showPassword ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'} onClick={() => setShowPassword((shown) => !shown)} type="button">
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            {error && <p className="login-error" role="alert">{error}</p>}
            <button className="primary-button login-submit" disabled={isSubmitting} type="submit">
              {isSubmitting
                ? (mode === 'register' ? 'Membuat akun...' : 'Memeriksa akun...')
                : (mode === 'register' ? 'Buat akun & lanjutkan' : 'Masuk')}
              <ArrowRight size={17} />
            </button>
          </form>
          <p className="auth-switch">
            {mode === 'register' ? 'Sudah punya akun?' : 'Belum punya akun?'}{' '}
            <button onClick={() => { setMode(mode === 'register' ? 'login' : 'register'); setError('') }} type="button">
              {mode === 'register' ? 'Masuk' : 'Buat akun'}
            </button>
          </p>
        </div>
      </section>
    </div>
  )
}

function JobDetail({ job, onClose, onApply, isApplying, hasApplied }) {
  return (
    <div className="modal-backdrop job-detail-backdrop" onClick={onClose} role="presentation">
      <section
        aria-labelledby="job-detail-title"
        aria-modal="true"
        className="detail-modal job-detail-modal"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <header className="job-detail-header">
          <div className="job-detail-heading-row">
            <div className="job-detail-badges">
              <span className="job-detail-code">{job.id}</span>
              <span>Kuota: {job.quota} Orang</span>
            </div>
            <button aria-label="Tutup detail" className="job-detail-close" onClick={onClose} type="button"><X size={21} /></button>
          </div>
          <h2 id="job-detail-title">{job.title}</h2>
          <div aria-label="Struktur organisasi" className="job-detail-breadcrumb">
            <strong>{job.division}</strong>
            <ChevronRight size={16} />
            <span>{job.department}</span>
            <ChevronRight size={16} />
            <span>{job.unit}</span>
          </div>
          <div className="job-detail-meta">
            <span><MapPin size={15} />{job.location}</span>
            <span><BriefcaseBusiness size={15} />{job.type}</span>
            <span><CalendarDays size={15} />Tayang {job.posted}</span>
          </div>
        </header>
        <div className="job-detail-body">
          <section className="job-detail-section">
            <h3>RINGKASAN TUGAS</h3>
            <p className="job-detail-summary">{job.summary}</p>
          </section>
          <section className="job-detail-section">
            <h3><List size={17} /> TANGGUNG JAWAB &amp; DESKRIPSI TUGAS</h3>
            {job.responsibilities?.length ? (
              <ul className="job-detail-list">
                {job.responsibilities.map((responsibility) => <li key={responsibility}>{responsibility}</li>)}
              </ul>
            ) : <p className="job-detail-empty">Deskripsi tugas akan diinformasikan oleh tim rekrutmen.</p>}
          </section>
          <section className="job-detail-section">
            <h3><GraduationCap size={18} /> SPESIFIKASI INTERNAL</h3>
            <p className="job-detail-summary">Kebutuhan pengalaman dan kompetensi yang relevan dengan pekerjaan di unit tujuan.</p>
            {job.skills?.length ? (
              <ul className="job-detail-list">
                {job.skills.map((specification) => <li key={specification}>{specification}</li>)}
              </ul>
            ) : <p className="job-detail-empty">Belum ada spesifikasi internal khusus untuk lowongan ini.</p>}
          </section>
          <aside className="job-detail-notice">
            <Info size={16} />
            <p>Proses mutasi memerlukan persetujuan atasan langsung (minimal setingkat Manager Departemen asal) setelah lolos seleksi berkas.</p>
          </aside>
        </div>
        <footer className="job-detail-footer">
          <button className="job-detail-dismiss" onClick={onClose} type="button">Tutup</button>
          <button className="apply-button job-detail-apply" disabled={isApplying || hasApplied} onClick={() => onApply(job)} type="button">
            {isApplying ? 'Mengirim...' : hasApplied ? 'Sudah mendaftar' : 'Daftar Posisi Ini'}
            <ArrowRight size={17} />
          </button>
        </footer>
      </section>
    </div>
  )
}

function JobCard({ job, onSelect, onApply, isApplying, hasApplied }) {
  return (
    <article className="job-card">
      <div className="card-top">
        <span className="division-tag"><Building2 size={14} /> {job.division}</span>
        <span className="quota-tag">Kuota: <strong>{job.quota}</strong></span>
      </div>
      <h2>{job.title}</h2>
      <div className="job-organization">
        <span><Users size={15} />{job.department}</span>
        <span><Wrench size={15} />{job.unit}</span>
      </div>
      <div className="job-meta">
        <span><MapPin size={14} />{job.location}</span>
        <span><BriefcaseBusiness size={14} />{job.type}</span>
        <span><CalendarDays size={14} />Tayang {job.posted}</span>
      </div>
      <p className="job-summary">{job.summary}</p>
      <div className="card-footer">
        <div className="card-actions">
          <button className="detail-button" onClick={() => onSelect(job)}>Detail <ChevronRight size={17} /></button>
          <button className="apply-button" disabled={isApplying || hasApplied} onClick={() => onApply(job)}>
            {isApplying ? 'Mengirim...' : hasApplied ? 'Terkirim' : 'Lamar'}
          </button>
        </div>
      </div>
    </article>
  )
}

function ApplicationForm({ job, session, divisions, isSubmitting, onClose, onSubmit }) {
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
    <div className="modal-backdrop application-form-backdrop" onClick={onClose} role="presentation">
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
              <label htmlFor="application-employee-number">Nomor Induk Pegawai (NIP) <em>*</em>
                <input autoComplete="off" id="application-employee-number" maxLength={40} name="employee_number" onChange={updateField} placeholder="Contoh: 19890412201" required value={form.employee_number} />
              </label>
              <label htmlFor="application-full-name">Nama Lengkap Sesuai ID <em>*</em>
                <input autoComplete="name" id="application-full-name" maxLength={200} name="applicant_full_name" onChange={updateField} placeholder="Contoh: Budi Santoso, S.T." required value={form.applicant_full_name} />
              </label>
              <label htmlFor="application-origin-division">Divisi Asal Saat Ini <em>*</em>
                <select id="application-origin-division" name="origin_division" onChange={updateField} required value={form.origin_division}>
                  <option value="">-- Pilih Divisi Asal --</option>
                  {divisions.map((division) => <option key={division} value={division}>{division}</option>)}
                </select>
              </label>
              <label htmlFor="application-origin-unit">Departemen / Unit Asal <em>*</em>
                <input id="application-origin-unit" maxLength={160} name="origin_unit" onChange={updateField} placeholder="Contoh: Dept. Quality Assurance" required value={form.origin_unit} />
              </label>
              <label htmlFor="application-education-level">Jenjang Pendidikan <em>*</em>
                <select id="application-education-level" name="education_level" onChange={updateField} required value={form.education_level}>
                  <option value="">-- Pilih Jenjang --</option>
                  {['SMA/SMK', 'D1', 'D2', 'D3', 'D4/S1', 'S2', 'S3', 'Lainnya'].map((level) => <option key={level} value={level}>{level}</option>)}
                </select>
              </label>
              <label htmlFor="application-study-field">Jurusan / Bidang Studi <em>*</em>
                <input id="application-study-field" maxLength={160} name="study_field" onChange={updateField} placeholder="Contoh: Teknik Perkapalan / Teknik Mesin" required value={form.study_field} />
              </label>
              <label className="application-form-wide" htmlFor="application-motivation">Motivasi &amp; Rencana Kontribusi di Unit Tujuan <em>*</em>
                <textarea id="application-motivation" maxLength={3000} name="motivation" onChange={updateField} placeholder="Jelaskan alasan Anda ingin beralih tugas ke posisi ini serta kemampuan utama yang bisa Anda berikan..." required rows="3" value={form.motivation} />
              </label>
              <label className="application-form-wide">Upload Berkas Pendukung (CV / Riwayat Kinerja) <em>*</em>
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
    </div>
  )
}

function DatasetMonitor({ sessionToken }) {
  const [activeDataset, setActiveDataset] = useState('positions')
  const [positions, setPositions] = useState([])
  const [applicationRows, setApplicationRows] = useState([])
  const [totalApplications, setTotalApplications] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    Promise.all([
      apiRequest('/monitoring/positions', { token: sessionToken }),
      apiRequest('/monitoring/applications', { token: sessionToken }),
    ])
      .then(([positionResponse, applicationResponse]) => {
        if (!active) return
        setPositions(positionResponse.data)
        setApplicationRows(applicationResponse.data)
        setTotalApplications(applicationResponse.total_applications)
      })
      .catch((requestError) => {
        if (active) setError(requestError.message)
      })
      .finally(() => {
        if (active) setIsLoading(false)
      })
    return () => { active = false }
  }, [sessionToken])

  return (
    <section className="dataset-monitor-page">
      <header className="dataset-overview">
        <div className="dataset-overview-copy">
          <h1><Database size={25} /> Monitoring Relasi &amp; Dataset Terpetakan</h1>
          <p>Data master hirarki posisi rekrutmen dan rekap jumlah lamaran.</p>
        </div>
        <div aria-label="Pilih dataset monitoring" className="dataset-tabs" role="tablist">
          <button aria-selected={activeDataset === 'positions'} className={activeDataset === 'positions' ? 'dataset-tab active' : 'dataset-tab'} onClick={() => setActiveDataset('positions')} role="tab">
            Dataset Posisi (master_posisi)
          </button>
          <button aria-selected={activeDataset === 'applications'} className={activeDataset === 'applications' ? 'dataset-tab active' : 'dataset-tab'} onClick={() => setActiveDataset('applications')} role="tab">
            Dataset Apply (lamaran) <span>{totalApplications}</span>
          </button>
        </div>
      </header>

      <section className="dataset-table-panel">
        <div className="dataset-table-heading">
          <span className="dataset-table-title"><i /> {activeDataset === 'positions' ? 'MASTER STRUKTUR POSISI & KUOTA' : 'REKAP DATA APPLY PER POSISI'}</span>
          <span>{activeDataset === 'positions'
            ? <>Total Mapping: <strong>{positions.length}</strong> Posisi</>
            : <>Total Lamaran: <strong>{totalApplications}</strong></>}</span>
        </div>
        {isLoading ? (
          <div className="dataset-table-state">Memuat data monitoring...</div>
        ) : error ? (
          <div className="dataset-table-state error" role="alert">{error}</div>
        ) : activeDataset === 'positions' ? (
          <div className="dataset-table-scroll">
            <table className="admin-table monitoring-table">
              <thead>
                <tr>
                  <th>KODE POSISI</th>
                  <th>NAMA POSISI</th>
                  <th>DIVISI TUJUAN</th>
                  <th>DEPARTEMEN</th>
                  <th>BIRO / BENGKEL</th>
                  <th>KUOTA</th>
                  <th>STATUS</th>
                </tr>
              </thead>
              <tbody>
                {positions.map((position) => (
                  <tr key={position.id}>
                    <td className="position-code">{position.id}</td>
                    <td className="position-name">{position.title}</td>
                    <td>{position.division}</td>
                    <td>{position.department}</td>
                    <td>{position.unit}</td>
                    <td className="quota-cell">{position.quota}</td>
                    <td><span className={position.is_open ? 'status-pill open' : 'status-pill closed'}>{position.is_open ? 'OPEN' : 'CLOSED'}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="dataset-table-scroll">
            <table className="admin-table monitoring-table">
              <thead>
                <tr>
                  <th>KODE POSISI</th>
                  <th>NAMA POSISI</th>
                  <th>DIVISI</th>
                  <th>DEPARTEMEN</th>
                  <th>BIRO / BENGKEL</th>
                  <th>JUMLAH LAMARAN</th>
                  <th>STATUS POSISI</th>
                </tr>
              </thead>
              <tbody>
                {applicationRows.map((row) => (
                  <tr key={row.job_id}>
                    <td className="position-code">{row.job_id}</td>
                    <td className="position-name">{row.job_title}</td>
                    <td>{row.division}</td>
                    <td>{row.department}</td>
                    <td>{row.unit}</td>
                    <td className="quota-cell">{row.application_count}</td>
                    <td><span className={row.is_open ? 'status-pill open' : 'status-pill closed'}>{row.is_open ? 'OPEN' : 'CLOSED'}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="privacy-note">Ditampilkan sebagai rekap agregat; nama dan email pelamar tidak ditampilkan.</p>
          </div>
        )}
      </section>
    </section>
  )
}

function JobCatalog({ session, onLogin, onLogout }) {
  const [activeTab, setActiveTab] = useState('jobs')
  const [jobs, setJobs] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [jobsError, setJobsError] = useState('')
  const [logoutError, setLogoutError] = useState('')
  const [applicationsError, setApplicationsError] = useState('')
  const [applicationNotice, setApplicationNotice] = useState('')
  const [division, setDivision] = useState('')
  const [department, setDepartment] = useState('')
  const [unit, setUnit] = useState('')
  const [selectedJob, setSelectedJob] = useState(null)
  const [authMode, setAuthMode] = useState(null)
  const [applicationFormOpen, setApplicationFormOpen] = useState(false)
  const [pendingJob, setPendingJob] = useState(null)
  const [applyingJobId, setApplyingJobId] = useState('')
  const [appliedJobIds, setAppliedJobIds] = useState(() => new Set())
  const [userApplications, setUserApplications] = useState([])
  const [applicationsLoadedFor, setApplicationsLoadedFor] = useState(null)
  const [applicationsErrorFor, setApplicationsErrorFor] = useState(null)
  const sessionToken = session?.token
  const currentUserApplications = applicationsLoadedFor === sessionToken ? userApplications : []
  const isApplicationsLoading = Boolean(sessionToken && applicationsLoadedFor !== sessionToken)

  useEffect(() => {
    let active = true
    apiRequest('/jobs')
      .then((response) => {
        if (active) setJobs(response.data)
      })
      .catch((requestError) => {
        if (active) setJobsError(requestError.message)
      })
      .finally(() => {
        if (active) setIsLoading(false)
      })
    return () => { active = false }
  }, [])

  useEffect(() => {
    let active = true
    if (!sessionToken) return () => { active = false }
    apiRequest('/applications', { token: sessionToken })
      .then((response) => {
        if (!active) return
        setUserApplications(response.data)
        setAppliedJobIds(new Set(response.data.map((application) => application.job_id)))
        setApplicationsLoadedFor(sessionToken)
        setApplicationsErrorFor(null)
        setApplicationsError('')
      })
      .catch((requestError) => {
        if (!active) return
        setApplicationsError(requestError.message)
        setApplicationsErrorFor(sessionToken)
        setApplicationsLoadedFor(sessionToken)
      })
    return () => { active = false }
  }, [sessionToken])

  const divisions = useMemo(() => [...new Set(jobs.map((job) => job.division))], [jobs])
  const departments = useMemo(
    () => [...new Set(jobs.filter((job) => !division || job.division === division).map((job) => job.department))],
    [jobs, division],
  )
  const units = useMemo(
    () => [...new Set(jobs.filter((job) => (!division || job.division === division) && (!department || job.department === department)).map((job) => job.unit))],
    [jobs, division, department],
  )
  const filteredJobs = useMemo(() => {
    return jobs.filter((job) => (
      (!division || job.division === division)
      && (!department || job.department === department)
      && (!unit || job.unit === unit)
    ))
  }, [jobs, division, department, unit])

  function resetFilters() {
    setDivision('')
    setDepartment('')
    setUnit('')
  }

  async function submitApplication(job, token, body) {
    setApplicationNotice('')
    setApplicationsError('')
    setApplyingJobId(job.id)
    try {
      await apiRequest('/applications', {
        method: 'POST',
        token,
        body,
      })
      setAppliedJobIds((current) => new Set([...current, job.id]))
      setUserApplications((current) => current.some((application) => application.job_id === job.id)
        ? current
        : [...current, { job_id: job.id, status: 'submitted' }])
      setApplicationsLoadedFor(token)
      setApplicationNotice(`Lamaran untuk ${job.title} berhasil dikirim.`)
      setSelectedJob(null)
    } catch (requestError) {
      setApplicationsError(requestError.message)
      throw requestError
    } finally {
      setApplyingJobId('')
    }
  }

  function handleApply(job) {
    setSelectedJob(null)
    setApplicationNotice('')
    if (!session) {
      setPendingJob(job)
      setAuthMode('register')
      return
    }
    if (!appliedJobIds.has(job.id)) {
      setPendingJob(job)
      setApplicationFormOpen(true)
    }
  }

  function handleAuthSuccess(newSession) {
    onLogin(newSession)
    setAuthMode(null)
    setAppliedJobIds(new Set())
    setApplicationsError('')
    const job = pendingJob
    if (job && newSession.role !== 'admin') {
      setApplicationFormOpen(true)
    } else {
      setPendingJob(null)
      setApplicationFormOpen(false)
    }
  }

  async function handleApplicationSubmit(body) {
    if (!pendingJob || !session) return
    await submitApplication(pendingJob, session.token, body)
    setApplicationFormOpen(false)
    setPendingJob(null)
  }

  async function handleLogout() {
    setLogoutError('')
    try {
      await onLogout()
      setAppliedJobIds(new Set())
      setUserApplications([])
      setApplicationsLoadedFor(null)
      setApplicationsErrorFor(null)
      setApplicationsError('')
      setActiveTab('jobs')
    } catch (requestError) {
      setLogoutError(requestError.message)
    }
  }

  return (
    <main className="app-shell" id="home">
      <header className="site-header">
        <div className="header-inner">
          <Brand />
          <div className="header-account">
            {session ? (
              <div className="signed-in-user">
                <span>{session.applicant.name} <strong>{session.applicant.email}</strong></span>
                <button aria-label="Keluar dari portal" onClick={handleLogout} title="Keluar"><LogOut size={17} /></button>
              </div>
            ) : (
              <div className="auth-actions">
                <button className="header-auth-button" onClick={() => setAuthMode('login')}><LogIn size={16} /> Masuk</button>
                <button className="header-register-button" onClick={() => setAuthMode('register')}><UserPlus size={16} /> Daftar</button>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="page-content">
        {activeTab === 'jobs' ? (
          <>
            <section className="hero-panel">
              <div className="hero-copy">
                <span className="hero-badge"><span>↗</span> Program Internal Mobility Periode 2026</span>
                <h1>Kembangkan Karier Anda di Unit &amp; Divisi Baru</h1>
                <p>Fasilitasi perpindahan internal transparan antardivisi, biro, dan bengkel produksi. Perluas keahlian teknis dan manajerial Anda untuk kemajuan bersama perusahaan.</p>
              </div>
              <div className="hero-stats" aria-label="Ringkasan lowongan">
                <div><strong>{jobs.length}</strong><span>Posisi Aktif</span></div>
                <div><strong>{new Set(jobs.map((job) => job.unit)).size}</strong><span>Biro/Bengkel</span></div>
              </div>
            </section>

            <section className="filter-panel" aria-label="Filter struktur organisasi lowongan">
              <div className="filter-heading">
                <h2><SlidersHorizontal size={21} /> Filter berdasarkan struktur organisasi</h2>
                <button className="reset-button" onClick={resetFilters}><RotateCcw size={15} /> Reset Filter</button>
              </div>
              <div className="filter-grid">
                <label>Divisi Tujuan
                  <select onChange={(event) => { setDivision(event.target.value); setDepartment(''); setUnit('') }} value={division}>
                    <option value="">Semua Divisi</option>
                    {divisions.map((item) => <option key={item} value={item}>{item}</option>)}
                  </select>
                </label>
                <label>Departemen Tujuan
                  <select onChange={(event) => { setDepartment(event.target.value); setUnit('') }} value={department}>
                    <option value="">Semua Departemen</option>
                    {departments.map((item) => <option key={item} value={item}>{item}</option>)}
                  </select>
                </label>
                <label>Biro / Bengkel
                  <select onChange={(event) => setUnit(event.target.value)} value={unit}>
                    <option value="">Semua Biro &amp; Bengkel</option>
                    {units.map((item) => <option key={item} value={item}>{item}</option>)}
                  </select>
                </label>
              </div>
            </section>

            <div className="results-bar">
              <span>Menampilkan <strong>{filteredJobs.length}</strong> lowongan pekerjaan aktif</span>
              <span className="open-note"><i /> Lowongan dapat dilihat tanpa login</span>
            </div>
            {logoutError && <p className="login-error" role="alert">{logoutError}</p>}
            {applicationsError && <p className="login-error" role="alert">{applicationsError}</p>}
            {applicationNotice && <p className="application-notice" role="status">{applicationNotice}</p>}
            {isLoading ? (
              <section className="empty-state"><h2>Memuat lowongan...</h2></section>
            ) : jobsError ? (
              <section className="empty-state"><h2>Lowongan belum dapat dimuat</h2><p role="alert">{jobsError}</p></section>
            ) : filteredJobs.length ? (
              <section className="job-grid" aria-label="Daftar lowongan aktif">
                {filteredJobs.map((job) => (
                  <JobCard
                    hasApplied={appliedJobIds.has(job.id)}
                    isApplying={applyingJobId === job.id}
                    job={job}
                    key={job.id}
                    onApply={handleApply}
                    onSelect={setSelectedJob}
                  />
                ))}
              </section>
            ) : (
              <section className="empty-state"><Search size={24} /><h2>Lowongan tidak ditemukan</h2><p>Coba pilih divisi, departemen, atau biro / bengkel lain.</p><button className="reset-button" onClick={resetFilters}>Reset Filter</button></section>
            )}
          </>
        ) : activeTab === 'applications' && session ? (
          <section aria-labelledby="my-applications-title">
            <section className="hero-panel">
              <div className="hero-copy">
                <span className="hero-badge"><FileText size={14} /> Perkembangan proses</span>
                <h1 id="my-applications-title">Lamaran Saya</h1>
                <p>Pantau status setiap lamaran yang Anda kirim. Tim Human Capital akan memperbarui status saat proses seleksi berjalan.</p>
              </div>
              <div className="hero-stats">
                <div><strong>{currentUserApplications.length}</strong><span>Total lamaran</span></div>
                <div><strong>{currentUserApplications.filter((application) => application.status === 'screening' || application.status === 'interview').length}</strong><span>Dalam proses</span></div>
                <div><strong>{currentUserApplications.filter((application) => application.status === 'accepted').length}</strong><span>Diterima</span></div>
              </div>
            </section>
            {applicationsErrorFor === sessionToken && applicationsError ? (
              <section className="empty-state"><h2>Riwayat belum dapat dimuat</h2><p role="alert">{applicationsError}</p></section>
            ) : isApplicationsLoading ? (
              <section className="empty-state"><h2>Memuat riwayat lamaran...</h2></section>
            ) : currentUserApplications.length ? (
              <section aria-label="Riwayat lamaran" className="job-grid">
                {currentUserApplications.map((application) => {
                  const job = jobs.find((item) => item.id === application.job_id)
                  const status = applicationStatusOptions.find((item) => item.value === application.status)
                  return (
                    <article className="job-card" key={application.job_id}>
                      <div className="card-top">
                        <span className="division-tag">{status?.label || application.status}</span>
                        <span className="job-id">{application.job_id}</span>
                      </div>
                      <h2>{job?.title || 'Posisi tidak lagi tersedia'}</h2>
                      <p className="job-summary">{applicationStatusDescriptions[application.status] || 'Status lamaran sedang diperbarui.'}</p>
                      {job && <div className="job-organization"><span>{job.division}</span><span>{job.department}</span></div>}
                    </article>
                  )
                })}
              </section>
            ) : (
              <section className="empty-state">
                <FileText size={24} />
                <h2>Belum ada lamaran</h2>
                <p>Temukan posisi yang sesuai dengan pengalaman Anda, lalu kirim lamaran untuk mulai mengikuti proses seleksi.</p>
              </section>
            )}
          </section>
        ) : null}
        {session && (
          <div className="page-section-navigation">
            {activeTab === 'jobs' ? (
              <button className="application-nav-button" onClick={() => setActiveTab('applications')}>
                <FileText size={17} /> Lamaran Saya <span>{currentUserApplications.length}</span>
              </button>
            ) : (
              <button className="application-nav-button" onClick={() => setActiveTab('jobs')}>
                Kembali ke lowongan aktif
              </button>
            )}
          </div>
        )}
      </div>

      <footer className="site-footer">
        <span><Shield size={16} fill="currentColor" /> Portal Resmi Human Capital Internal Mobility &amp; Rekrutmen Terpadu</span>
        <span>Versi 2.4.0 <i /> Relational Dataset Mapped</span>
      </footer>
      {selectedJob && (
        <JobDetail
          hasApplied={appliedJobIds.has(selectedJob.id)}
          isApplying={applyingJobId === selectedJob.id}
          job={selectedJob}
          onApply={handleApply}
          onClose={() => setSelectedJob(null)}
        />
      )}
      {authMode && (
        <AuthDialog initialMode={authMode} onClose={() => { setAuthMode(null); setPendingJob(null) }} onSuccess={handleAuthSuccess} />
      )}
      {applicationFormOpen && pendingJob && session && (
        <ApplicationForm
          divisions={[...new Set(jobs.map((job) => job.division))].sort()}
          isSubmitting={applyingJobId === pendingJob.id}
          job={pendingJob}
          onClose={() => { setApplicationFormOpen(false); setPendingJob(null) }}
          onSubmit={handleApplicationSubmit}
          session={session}
        />
      )}
    </main>
  )
}

const applicationStatusOptions = [
  { value: 'submitted', label: 'Masuk' },
  { value: 'screening', label: 'Seleksi' },
  { value: 'interview', label: 'Wawancara' },
  { value: 'accepted', label: 'Diterima' },
  { value: 'rejected', label: 'Ditolak' },
]

const applicationStatusDescriptions = {
  submitted: 'Lamaran Anda sudah diterima dan menunggu peninjauan awal.',
  screening: 'Tim Human Capital sedang meninjau kesesuaian kualifikasi Anda.',
  interview: 'Anda masuk tahap wawancara. Pantau informasi lanjutan dari tim Human Capital.',
  accepted: 'Selamat, lamaran Anda diterima. Tim Human Capital akan menghubungi Anda untuk langkah berikutnya.',
  rejected: 'Lamaran belum dapat dilanjutkan untuk posisi ini. Terima kasih atas partisipasi Anda.',
}

function AdminToast({ message, onClose }) {
  useEffect(() => {
    if (!message) return undefined
    const timeout = window.setTimeout(() => onClose(''), 4000)
    return () => window.clearTimeout(timeout)
  }, [message, onClose])

  if (!message) return null
  return (
    <div aria-live="polite" className="admin-toast" role="status">
      <CheckCircle2 size={19} />
      <span>{message}</span>
      <button aria-label="Tutup notifikasi" onClick={() => onClose('')} type="button"><X size={16} /></button>
    </div>
  )
}

function ConfirmDialog({ title, message, error, isBusy, onCancel, onConfirm }) {
  return (
    <div className="modal-backdrop admin-confirm-backdrop" onClick={() => { if (!isBusy) onCancel() }} role="presentation">
      <section
        aria-labelledby="admin-confirm-title"
        aria-modal="true"
        className="detail-modal admin-confirm-dialog"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className="admin-confirm-icon"><Trash2 size={21} /></div>
        <h2 id="admin-confirm-title">{title}</h2>
        <p>{message}</p>
        {error && <p className="admin-alert error" role="alert">{error}</p>}
        <div className="admin-confirm-actions">
          <button className="detail-button" disabled={isBusy} onClick={onCancel} type="button">Batal</button>
          <button className="admin-danger-button" disabled={isBusy} onClick={onConfirm} type="button">
            {isBusy ? 'Menghapus...' : 'Delete'}
          </button>
        </div>
      </section>
    </div>
  )
}

function JobEditor({ job, onClose, onSave, organization, jobTypes }) {
  const [form, setForm] = useState(() => job ? {
    id: job.id,
    title: job.title,
    division_id: String(organization.departments.find((department) =>
      department.id === organization.bureaus.find((bureau) => bureau.id === job.bureau_id)?.department_id,
    )?.division_id ?? ''),
    department_id: String(organization.bureaus.find((bureau) => bureau.id === job.bureau_id)?.department_id ?? ''),
    bureau_id: String(job.bureau_id),
    location: job.location,
    quota: job.quota,
    posted: job.posted,
    job_type: job.type || job.job_type,
    summary: job.summary,
    is_open: job.is_open,
  } : {
    id: '',
    title: '',
    division_id: '',
    department_id: '',
    bureau_id: '',
    location: '',
    quota: 1,
    posted: '',
    job_type: jobTypes[0]?.name || '',
    summary: '',
    is_open: true,
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
        bureau_id: Number(form.bureau_id),
        location: form.location,
        quota: Number(form.quota),
        posted: form.posted,
        job_type: form.job_type,
        summary: form.summary,
        skills: lines(internalSpecsText),
        responsibilities: lines(responsibilitiesText),
        is_open: form.is_open,
      })
      onClose()
    } catch (saveError) {
      setError(saveError.message)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <section aria-labelledby="job-editor-title" aria-modal="true" className="detail-modal admin-editor-modal" onClick={(event) => event.stopPropagation()} role="dialog">
        <div className="modal-heading">
          <h2 id="job-editor-title">{editing ? 'Edit lowongan' : 'Tambah lowongan'}</h2>
          <button aria-label="Tutup form" className="icon-button" onClick={onClose} type="button"><X size={20} /></button>
        </div>
        <form className="admin-job-form" onSubmit={handleSubmit}>
          <label>Kode posisi <em>*</em><input disabled={editing} maxLength={64} name="id" onChange={updateField} required value={form.id} /></label>
          <label>Nama posisi <em>*</em><input name="title" onChange={updateField} required value={form.title} /></label>
          <label>Divisi <em>*</em>
            <select onChange={(event) => setForm((current) => ({ ...current, division_id: event.target.value, department_id: '', bureau_id: '' }))} required value={form.division_id}>
              <option value="">Pilih divisi</option>
              {organization.divisions.map((division) => <option key={division.id} value={division.id}>{division.name}</option>)}
            </select>
          </label>
          <label>Departemen <em>*</em>
            <select disabled={!form.division_id} onChange={(event) => setForm((current) => ({ ...current, department_id: event.target.value, bureau_id: '' }))} required value={form.department_id}>
              <option value="">Pilih departemen</option>
              {organization.departments.filter((department) => String(department.division_id) === form.division_id).map((department) => (
                <option key={department.id} value={department.id}>{department.name}</option>
              ))}
            </select>
          </label>
          <label>Biro / bengkel <em>*</em>
            <select disabled={!form.department_id} name="bureau_id" onChange={updateField} required value={form.bureau_id}>
              <option value="">Pilih biro / bengkel</option>
              {organization.bureaus.filter((bureau) => String(bureau.department_id) === form.department_id).map((bureau) => (
                <option key={bureau.id} value={bureau.id}>{bureau.name}</option>
              ))}
            </select>
          </label>
          <p className="organization-help admin-form-wide">Lowongan ini ditautkan ke Biro / Bengkel yang dipilih di bawah Divisi dan Departemennya. Pelamar akan mendaftar ke lowongan pada unit tersebut.</p>
          <label>Lokasi penempatan <em>*</em>
            <input name="location" onChange={updateField} placeholder="Contoh: Surabaya / area galangan" required value={form.location} />
            <small className="admin-field-help">Kota atau area kerja unit tujuan; informasi ini ditampilkan kepada pelamar.</small>
          </label>
          <label>Kuota <em>*</em><input min="0" name="quota" onChange={updateField} required type="number" value={form.quota} /></label>
          <label>Tanggal / waktu tayang <em>*</em><input name="posted" onChange={updateField} required value={form.posted} /></label>
          <label>Jenis pekerjaan <em>*</em>
            <select name="job_type" onChange={updateField} required value={form.job_type}>
              <option value="">Pilih jenis pekerjaan</option>
              {jobTypes.map((jobType) => (
                <option key={jobType.id} value={jobType.name}>{jobType.name}</option>
              ))}
            </select>
          </label>
          <label className="admin-form-wide">Ringkasan tugas <em>*</em><textarea name="summary" onChange={updateField} placeholder="Ringkas tujuan posisi dan hasil utama yang diharapkan." required rows="3" value={form.summary} /></label>
          <label>Spesifikasi internal <em>*</em><textarea onChange={(event) => setInternalSpecsText(event.target.value)} placeholder="Satu kebutuhan per baris: pengalaman proses kerja, kompetensi, atau sertifikasi internal." required rows="3" value={internalSpecsText} /></label>
          <label>Tanggung jawab &amp; deskripsi tugas <em>*</em><textarea onChange={(event) => setResponsibilitiesText(event.target.value)} placeholder="Satu tugas spesifik per baris sesuai pekerjaan di unit tujuan." required rows="3" value={responsibilitiesText} /></label>
          <label className="admin-open-toggle"><input checked={form.is_open} name="is_open" onChange={updateField} type="checkbox" /> Lowongan langsung dibuka</label>
          {error && <p className="login-error admin-form-wide" role="alert">{error}</p>}
          <div className="admin-form-actions admin-form-wide">
            <button className="detail-button" onClick={onClose} type="button">Batal</button>
            <button className="apply-button" disabled={isSaving} type="submit"><Save size={16} /> {isSaving ? 'Menyimpan...' : 'Simpan lowongan'}</button>
          </div>
        </form>
      </section>
    </div>
  )
}

function OrganizationManager({ level, organization, isLoading, sessionToken, onRefresh }) {
  const definitions = {
    divisions: { label: 'Divisi', collection: 'divisions', path: '/admin/divisions' },
    departments: {
      label: 'Departemen',
      collection: 'departments',
      path: '/admin/departments',
      parentCollection: 'divisions',
      parentField: 'division_id',
      parentLabel: 'Divisi',
    },
    bureaus: {
      label: 'Biro / bengkel',
      collection: 'bureaus',
      path: '/admin/bureaus',
      parentCollection: 'departments',
      parentField: 'department_id',
      parentLabel: 'Departemen',
    },
  }
  const definition = definitions[level]
  const items = organization[definition.collection]
  const parents = definition.parentCollection ? organization[definition.parentCollection] : []
  const [name, setName] = useState('')
  const [parentId, setParentId] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [pendingDelete, setPendingDelete] = useState(null)
  const [isDeleting, setIsDeleting] = useState(false)

  function resetForm() {
    setName('')
    setParentId('')
    setEditingId(null)
  }

  function getParentName(item) {
    if (level === 'departments') {
      return organization.divisions.find((division) => division.id === item.division_id)?.name || 'Divisi tidak ditemukan'
    }
    if (level === 'bureaus') {
      const department = organization.departments.find((entry) => entry.id === item.department_id)
      const division = organization.divisions.find((entry) => entry.id === department?.division_id)
      return `${division?.name || 'Divisi'} / ${department?.name || 'Departemen'}`
    }
    return '—'
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    setNotice('')
    setIsSaving(true)
    const body = { name: name.trim() }
    if (!editingId && definition.parentField) {
      body[definition.parentField] = Number(parentId)
    }
    try {
      await apiRequest(editingId ? `${definition.path}/${editingId}` : definition.path, {
        method: editingId ? 'PUT' : 'POST',
        token: sessionToken,
        body: JSON.stringify(body),
      })
      setNotice(editingId ? `${definition.label} berhasil disimpan.` : `${definition.label} berhasil ditambahkan.`)
      resetForm()
      onRefresh()
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setIsSaving(false)
    }
  }

  async function deleteItem() {
    if (!pendingDelete) return
    setError('')
    setIsDeleting(true)
    try {
      await apiRequest(`${definition.path}/${pendingDelete.id}`, { method: 'DELETE', token: sessionToken })
      if (editingId === pendingDelete.id) resetForm()
      setPendingDelete(null)
      setNotice(`${definition.label} berhasil dihapus.`)
      onRefresh()
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setIsDeleting(false)
    }
  }

  function editItem(item) {
    setEditingId(item.id)
    setName(item.name)
    setParentId('')
    setError('')
    setNotice('')
  }

  return (
    <section className="admin-organization-view">
      <div className="admin-table-heading">
        <div>
          <h2>Kelola {definition.label.toLocaleLowerCase('id')}</h2>
          <p>{items.length} {definition.label.toLocaleLowerCase('id')} terdaftar</p>
        </div>
      </div>
      <form className="organization-form" onSubmit={handleSubmit}>
        <label>
          {definition.label}
          <input maxLength={160} onChange={(event) => setName(event.target.value)} required value={name} />
        </label>
        {definition.parentField && (
          <label>
            {definition.parentLabel}
            <select
              disabled={Boolean(editingId) || !parents.length}
              onChange={(event) => setParentId(event.target.value)}
              required={!editingId}
              value={editingId ? getParentName(items.find((item) => item.id === editingId)) : parentId}
            >
              {editingId ? (
                <option>{getParentName(items.find((item) => item.id === editingId))}</option>
              ) : (
                <>
                  <option value="">Pilih {definition.parentLabel.toLocaleLowerCase('id')}</option>
                  {parents.map((parent) => (
                    <option key={parent.id} value={parent.id}>{parent.name}</option>
                  ))}
                </>
              )}
            </select>
          </label>
        )}
        {definition.parentField && !parents.length && (
          <p className="organization-help">Tambahkan {definition.parentLabel.toLocaleLowerCase('id')} terlebih dahulu agar dapat menghubungkan data ini.</p>
        )}
        {error && <p className="admin-alert error" role="alert">{error}</p>}
        <div className="organization-form-actions">
          {editingId && <button className="detail-button" onClick={resetForm} type="button">Batal edit</button>}
          <button className="apply-button" disabled={isSaving || (definition.parentField && !editingId && !parents.length)} type="submit">
            {isSaving ? 'Menyimpan...' : editingId ? 'Simpan perubahan' : `Tambah ${definition.label.toLocaleLowerCase('id')}`}
          </button>
        </div>
      </form>
      <div className="admin-table-scroll">
        {isLoading ? (
          <div className="admin-loading">Memuat struktur organisasi...</div>
        ) : items.length ? (
          <table className="admin-table organization-table">
            <thead>
              <tr><th>NAMA</th>{definition.parentField && <th>{definition.parentLabel.toUpperCase()}</th>}<th>AKSI</th></tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td className="position-name">{item.name}</td>
                  {definition.parentField && <td>{getParentName(item)}</td>}
                  <td className="admin-row-actions">
                    <button className="admin-small-button" onClick={() => editItem(item)} type="button">Edit</button>
                    <button className="admin-small-button danger" onClick={() => { setError(''); setPendingDelete(item) }} type="button">Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="admin-loading">Belum ada {definition.label.toLocaleLowerCase('id')}.</div>
        )}
      </div>
      <AdminToast message={notice} onClose={setNotice} />
      {pendingDelete && (
        <ConfirmDialog
          error={error}
          isBusy={isDeleting}
          message={`Data ${definition.label.toLocaleLowerCase('id')} "${pendingDelete.name}" akan dihapus permanen. Penghapusan hanya berhasil jika data ini tidak sedang digunakan.`}
          onCancel={() => { setPendingDelete(null); setError('') }}
          onConfirm={() => void deleteItem()}
          title={`Delete ${definition.label.toLocaleLowerCase('id')}?`}
        />
      )}
    </section>
  )
}

function JobTypeManager({ jobTypes, isLoading, sessionToken, onRefresh }) {
  const [name, setName] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [pendingDelete, setPendingDelete] = useState(null)
  const [isDeleting, setIsDeleting] = useState(false)

  function resetForm() {
    setName('')
    setEditingId(null)
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    setNotice('')
    setIsSaving(true)
    try {
      await apiRequest(editingId ? `/admin/job-types/${editingId}` : '/admin/job-types', {
        method: editingId ? 'PUT' : 'POST',
        token: sessionToken,
        body: JSON.stringify({ name: name.trim() }),
      })
      setNotice(editingId ? 'Jenis pekerjaan berhasil disimpan.' : 'Jenis pekerjaan berhasil ditambahkan.')
      resetForm()
      onRefresh()
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setIsSaving(false)
    }
  }

  async function deleteItem() {
    if (!pendingDelete) return
    setError('')
    setIsDeleting(true)
    try {
      await apiRequest(`/admin/job-types/${pendingDelete.id}`, { method: 'DELETE', token: sessionToken })
      if (editingId === pendingDelete.id) resetForm()
      setPendingDelete(null)
      setNotice('Jenis pekerjaan berhasil dihapus.')
      onRefresh()
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setIsDeleting(false)
    }
  }

  function editItem(jobType) {
    setEditingId(jobType.id)
    setName(jobType.name)
    setError('')
    setNotice('')
  }

  return (
    <section className="admin-organization-view">
      <div className="admin-table-heading">
        <div>
          <h2>Kelola jenis pekerjaan</h2>
          <p>{jobTypes.length} jenis pekerjaan terdaftar</p>
        </div>
      </div>
      <form className="organization-form job-type-form" onSubmit={handleSubmit}>
        <label>
          Jenis pekerjaan <em>*</em>
          <input maxLength={80} onChange={(event) => setName(event.target.value)} required value={name} />
        </label>
        <p className="organization-help">Daftar ini menjadi pilihan pada formulir tambah dan edit lowongan. Jenis yang sudah dipakai lowongan tidak dapat dihapus.</p>
        {error && !pendingDelete && <p className="admin-alert error" role="alert">{error}</p>}
        <div className="organization-form-actions">
          {editingId && <button className="detail-button" onClick={resetForm} type="button">Batal edit</button>}
          <button className="apply-button" disabled={isSaving || isLoading} type="submit">
            {isSaving ? 'Menyimpan...' : editingId ? 'Simpan perubahan' : 'Tambah jenis pekerjaan'}
          </button>
        </div>
      </form>
      <div className="admin-table-scroll">
        {isLoading ? (
          <div className="admin-loading">Memuat jenis pekerjaan...</div>
        ) : jobTypes.length ? (
          <table className="admin-table organization-table">
            <thead><tr><th>JENIS PEKERJAAN</th><th>LOWONGAN TERKAIT</th><th>AKSI</th></tr></thead>
            <tbody>
              {jobTypes.map((jobType) => (
                <tr key={jobType.id}>
                  <td className="position-name">{jobType.name}</td>
                  <td>{jobType.job_count}</td>
                  <td className="admin-row-actions">
                    <button className="admin-small-button" onClick={() => editItem(jobType)} type="button">Edit</button>
                    <button
                      className="admin-small-button danger"
                      disabled={jobType.job_count > 0}
                      onClick={() => { setError(''); setPendingDelete(jobType) }}
                      title={jobType.job_count > 0 ? 'Masih digunakan oleh lowongan' : undefined}
                      type="button"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="admin-loading">Belum ada jenis pekerjaan.</div>
        )}
      </div>
      <AdminToast message={notice} onClose={setNotice} />
      {pendingDelete && (
        <ConfirmDialog
          error={error}
          isBusy={isDeleting}
          message={`Jenis pekerjaan "${pendingDelete.name}" akan dihapus permanen.`}
          onCancel={() => { setPendingDelete(null); setError('') }}
          onConfirm={() => void deleteItem()}
          title="Delete jenis pekerjaan?"
        />
      )}
    </section>
  )
}

function AccountListManager({ accountType, sessionToken, currentAdminId }) {
  const isAdminAccount = accountType === 'admin'
  const accountsPath = isAdminAccount ? '/admin/admin-accounts' : '/admin/accounts'
  const accountKind = isAdminAccount ? 'admin' : 'pelamar'
  const minimumPasswordLength = isAdminAccount ? 12 : 8
  const [accounts, setAccounts] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')
  const [loadError, setLoadError] = useState('')
  const [notice, setNotice] = useState('')
  const [search, setSearch] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [form, setForm] = useState({ name: '', email: '', password: '' })
  const [pendingDelete, setPendingDelete] = useState(null)
  const [isDeleting, setIsDeleting] = useState(false)

  useEffect(() => {
    let active = true
    apiRequest(accountsPath, { token: sessionToken })
      .then((response) => {
        if (active) {
          if (!Array.isArray(response.data)) {
            throw new Error(`Backend belum menyediakan daftar akun ${accountKind}. Jalankan backend versi terbaru dan terapkan migrasi database.`)
          }
          setAccounts(response.data)
          setLoadError('')
        }
      })
      .catch((requestError) => {
        if (active) setLoadError(requestError.message)
      })
      .finally(() => {
        if (active) setIsLoading(false)
      })
    return () => { active = false }
  }, [accountKind, accountsPath, sessionToken, refreshKey])

  function refreshAccounts() {
    setLoadError('')
    setIsLoading(true)
    setRefreshKey((current) => current + 1)
  }

  function resetForm() {
    setForm({ name: '', email: '', password: '' })
    setEditingId(null)
  }

  async function submitAccount(event) {
    event.preventDefault()
    setError('')
    setNotice('')
    setIsSaving(true)
    const body = { name: form.name.trim(), email: form.email.trim() }
    if (form.password) body.password = form.password
    try {
      await apiRequest(editingId ? `${accountsPath}/${editingId}` : accountsPath, {
        method: editingId ? 'PUT' : 'POST',
        token: sessionToken,
        body: JSON.stringify(body),
      })
      setNotice(editingId
        ? `Perubahan akun ${accountKind} berhasil disimpan. Sesi aktifnya telah diakhiri.`
        : `Akun ${accountKind} berhasil ditambahkan.`)
      resetForm()
      refreshAccounts()
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setIsSaving(false)
    }
  }

  function editAccount(account) {
    setEditingId(account.id)
    setForm({ name: account.name, email: account.email, password: '' })
    setError('')
    setNotice('')
  }

  async function setAccountActive(account, isActive) {
    if (!isActive) {
      setError('')
      setPendingDelete(account)
      return
    }
    setError('')
    setNotice('')
    try {
      await apiRequest(
        `${accountsPath}/${account.id}/status`,
        {
          method: 'PATCH',
          token: sessionToken,
          body: JSON.stringify({ is_active: true }),
        },
      )
      setNotice(`Akun ${accountKind} berhasil diaktifkan kembali.`)
      refreshAccounts()
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  async function deleteAccount() {
    if (!pendingDelete) return
    setError('')
    setIsDeleting(true)
    try {
      await apiRequest(`${accountsPath}/${pendingDelete.id}`, { method: 'DELETE', token: sessionToken })
      setPendingDelete(null)
      setNotice(`Akun ${accountKind} berhasil dihapus. Riwayat dan dokumen tetap tersimpan.`)
      refreshAccounts()
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setIsDeleting(false)
    }
  }

  const filteredAccounts = accounts.filter((account) => (
    `${account.name} ${account.email}`.toLocaleLowerCase('id').includes(search.toLocaleLowerCase('id'))
  ))
  const activeCount = accounts.filter((account) => account.is_active).length

  return (
    <section className="account-manager">
      <div className="admin-table-heading">
        <div><h2>Monitoring akun {accountKind}</h2><p>{accounts.length} akun terdaftar · {activeCount} aktif</p></div>
        {isAdminAccount ? <Shield size={22} /> : <Users size={22} />}
      </div>
      <form className="organization-form account-manager-form" onSubmit={submitAccount}>
        <label>Nama lengkap
          <input autoComplete="name" maxLength={200} onChange={(event) => setForm({ ...form, name: event.target.value })} required value={form.name} />
        </label>
        <label>Email
          <input autoComplete="email" maxLength={254} onChange={(event) => setForm({ ...form, email: event.target.value })} required type="email" value={form.email} />
        </label>
        <label>Kata sandi {editingId ? '(opsional untuk reset)' : 'awal'}
          <input
            autoComplete="new-password"
            maxLength={128}
            minLength={editingId && !form.password ? undefined : minimumPasswordLength}
            onChange={(event) => setForm({ ...form, password: event.target.value })}
            placeholder={editingId ? 'Kosongkan jika tidak diubah' : `Minimal ${minimumPasswordLength} karakter`}
            required={!editingId}
            type="password"
            value={form.password}
          />
        </label>
        <p className="organization-help account-form-help">
          {editingId
            ? 'Menyimpan perubahan akan mengakhiri semua sesi aktif akun.'
            : `Gunakan kata sandi awal yang aman dan sampaikan kepada pemilik akun melalui jalur privat. Minimal ${minimumPasswordLength} karakter.`}
        </p>
        {error && <p className="admin-alert error" role="alert">{error}</p>}
        <div className="organization-form-actions">
          {editingId && <button className="detail-button" onClick={resetForm} type="button">Batal edit</button>}
          <button className="apply-button" disabled={isSaving} type="submit">
            {isSaving ? 'Menyimpan...' : editingId ? 'Simpan perubahan' : <><Plus size={16} /> Tambah akun</>}
          </button>
        </div>
      </form>
      <div className="account-list-toolbar">
        <label><Search size={16} /><input onChange={(event) => setSearch(event.target.value)} placeholder="Cari nama atau email" value={search} /></label>
        <span>{filteredAccounts.length} akun ditampilkan</span>
      </div>
      <div className="admin-table-scroll">
        {isLoading ? (
          <div className="admin-loading">Memuat akun {accountKind}...</div>
        ) : loadError ? (
          <div className="admin-loading account-load-error" role="alert">
            <p>{loadError}</p>
            <button className="admin-small-button" onClick={refreshAccounts} type="button">Coba lagi</button>
          </div>
        ) : filteredAccounts.length ? (
          <table className="admin-table account-table">
            <thead><tr><th>AKUN</th>{!isAdminAccount && <th>LAMARAN</th>}<th>TERDAFTAR</th><th>STATUS</th><th>AKSI</th></tr></thead>
            <tbody>
              {filteredAccounts.map((account) => {
                const isCurrentAdmin = isAdminAccount && account.id === currentAdminId
                const isLastActiveAdmin = isAdminAccount && account.is_active && activeCount <= 1
                return (
                <tr key={account.id}>
                  <td className="position-name">{account.name}<span className="admin-table-subtext">{account.email}</span></td>
                  {!isAdminAccount && <td>{account.applications_count}</td>}
                  <td>{new Date(account.created_at).toLocaleDateString('id-ID')}</td>
                  <td><span className={account.is_active ? 'account-status active' : 'account-status inactive'}>{account.is_active ? 'Aktif' : 'Nonaktif'}</span></td>
                  <td className="admin-row-actions">
                    {isCurrentAdmin ? (
                      <span className="admin-table-subtext">Akun admin Anda</span>
                    ) : (
                      <>
                        <button className="admin-small-button" onClick={() => editAccount(account)} type="button">Edit</button>
                        <button
                          className={account.is_active ? 'admin-small-button danger' : 'admin-small-button'}
                          disabled={isLastActiveAdmin}
                          onClick={() => void setAccountActive(account, !account.is_active)}
                          title={isLastActiveAdmin ? 'Admin aktif terakhir tidak dapat dinonaktifkan' : undefined}
                          type="button"
                        >
                          {account.is_active ? 'Delete' : 'Aktifkan'}
                        </button>
                      </>
                    )}
                  </td>
                </tr>
                )
              })}
            </tbody>
          </table>
        ) : (
          <div className="admin-loading">{search ? 'Akun tidak ditemukan.' : `Belum ada akun ${accountKind}.`}</div>
        )}
      </div>
      <p className="admin-table-note">
        {isAdminAccount
          ? 'Admin yang sedang digunakan tidak dapat diubah atau dinonaktifkan. Admin aktif terakhir juga tidak dapat dinonaktifkan. Perubahan akun mengakhiri sesi aktifnya.'
          : 'Akun yang dinonaktifkan tidak dapat masuk, tetapi data lamaran dan dokumen tetap dipertahankan. Reset kata sandi akan mengakhiri sesi aktif pelamar.'}
      </p>
      <AdminToast message={notice} onClose={setNotice} />
      {pendingDelete && (
        <ConfirmDialog
          error={error}
          isBusy={isDeleting}
          message={`Akun ${pendingDelete.email} akan dinonaktifkan. Riwayat lamaran dan dokumen tetap tersimpan.`}
          onCancel={() => { setPendingDelete(null); setError('') }}
          onConfirm={() => void deleteAccount()}
          title={`Delete akun ${accountKind}?`}
        />
      )}
    </section>
  )
}

function AccountManager({ session }) {
  const [accountType, setAccountType] = useState('applicant')
  return (
    <section className="account-management-page">
      <nav aria-label="Jenis akun" className="account-type-tabs">
        <button
          aria-pressed={accountType === 'applicant'}
          className={accountType === 'applicant' ? 'account-type-tab active' : 'account-type-tab'}
          onClick={() => setAccountType('applicant')}
          type="button"
        >
          <Users size={17} /> Akun Pelamar
        </button>
        <button
          aria-pressed={accountType === 'admin'}
          className={accountType === 'admin' ? 'account-type-tab active' : 'account-type-tab'}
          onClick={() => setAccountType('admin')}
          type="button"
        >
          <Shield size={17} /> Akun Admin
        </button>
      </nav>
      <AccountListManager
        accountType={accountType}
        currentAdminId={session.admin.id}
        key={accountType}
        sessionToken={session.token}
      />
    </section>
  )
}

function ApplicationReview({ application, onClose, onSave, isSaving, sessionToken }) {
  const [status, setStatus] = useState(application.status)
  const [error, setError] = useState('')
  const [downloadingDocumentId, setDownloadingDocumentId] = useState(null)

  async function downloadDocument(file) {
    setError('')
    setDownloadingDocumentId(file.id)
    try {
      const blob = await apiDownload(
        `/admin/applications/${application.id}/documents/${file.id}`,
        { token: sessionToken },
      )
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = file.file_name
      document.body.append(link)
      link.click()
      link.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (downloadError) {
      setError(downloadError.message)
    } finally {
      setDownloadingDocumentId(null)
    }
  }

  async function handleSave() {
    setError('')
    try {
      await onSave(status)
      onClose()
    } catch (saveError) {
      setError(saveError.message)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <section aria-labelledby="application-review-title" aria-modal="true" className="detail-modal application-review-modal" onClick={(event) => event.stopPropagation()} role="dialog">
        <div className="modal-heading">
          <span className="division-tag"><FileText size={14} /> Detail lamaran</span>
          <button aria-label="Tutup detail lamaran" className="icon-button" onClick={onClose} type="button"><X size={20} /></button>
        </div>
        <h2 id="application-review-title">{application.job_title}</h2>
        <dl className="application-detail-list">
          <div><dt>Nama sesuai ID</dt><dd>{application.applicant_name}</dd></div>
          <div><dt>Email</dt><dd><a href={`mailto:${application.applicant_email}`}>{application.applicant_email}</a></dd></div>
          {application.employee_number ? (
            <>
              <div><dt>NIP</dt><dd>{application.employee_number}</dd></div>
              <div><dt>Divisi asal</dt><dd>{application.origin_division}</dd></div>
              <div><dt>Departemen / unit asal</dt><dd>{application.origin_unit}</dd></div>
              <div><dt>Pendidikan</dt><dd>{application.education_level}</dd></div>
              <div><dt>Jurusan</dt><dd>{application.study_field}</dd></div>
            </>
          ) : (
            <>
              <div><dt>Nomor HP</dt><dd>{application.phone_number || 'Belum diisi'}</dd></div>
              <div><dt>Posisi saat ini</dt><dd>{application.current_position || 'Belum diisi'}</dd></div>
              <div><dt>Unit / divisi</dt><dd>{application.current_unit || 'Belum diisi'}</dd></div>
            </>
          )}
          <div><dt>Kode posisi</dt><dd>{application.job_id}</dd></div>
          <div><dt>Dikirim</dt><dd>{application.created_at}</dd></div>
        </dl>
        <section className="application-review-motivation">
          <h3>Motivasi &amp; rencana kontribusi</h3>
          <p>{application.motivation || 'Belum diisi.'}</p>
        </section>
        <section className="application-review-documents">
          <h3>Dokumen lamaran</h3>
          {application.documents.length ? application.documents.map((file) => (
            <div className="application-document-row" key={file.id}>
              <span>{({
                cv: 'CV',
                cover_letter: 'Surat pengantar',
                certificate: 'Sertifikat pendukung',
                supporting_document: 'Berkas pendukung',
              })[file.document_type] || 'Dokumen'} <small>{file.file_name}</small></span>
              <button
                className="admin-small-button"
                disabled={downloadingDocumentId === file.id}
                onClick={() => void downloadDocument(file)}
                type="button"
              >
                <Download size={15} /> {downloadingDocumentId === file.id ? 'Mengunduh...' : 'Unduh'}
              </button>
            </div>
          )) : <p className="application-document-empty">Belum ada dokumen.</p>}
        </section>
        <label className="application-status-select">Status proses
          <select onChange={(event) => setStatus(event.target.value)} value={status}>
            {applicationStatusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        {error && <p className="login-error" role="alert">{error}</p>}
        <div className="detail-actions">
          <button className="detail-button" onClick={onClose} type="button">Tutup</button>
          <button className="apply-button" disabled={isSaving || status === application.status} onClick={handleSave} type="button">
            <Save size={16} /> {isSaving ? 'Menyimpan...' : 'Simpan status'}
          </button>
        </div>
      </section>
    </div>
  )
}

function AdminDashboard({ session, onLogout }) {
  const [activeView, setActiveView] = useState('dashboard')
  const [metrics, setMetrics] = useState(null)
  const [jobs, setJobs] = useState([])
  const [applications, setApplications] = useState([])
  const [organization, setOrganization] = useState({ divisions: [], departments: [], bureaus: [] })
  const [jobTypes, setJobTypes] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSavingStatus, setIsSavingStatus] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)
  const [editorJob, setEditorJob] = useState(null)
  const [isCreatingJob, setIsCreatingJob] = useState(false)
  const [pendingJobDelete, setPendingJobDelete] = useState(null)
  const [jobDeleteError, setJobDeleteError] = useState('')
  const [isDeletingJob, setIsDeletingJob] = useState(false)
  const [selectedApplication, setSelectedApplication] = useState(null)
  const [logoutError, setLogoutError] = useState('')
  const sessionToken = session.token

  useEffect(() => {
    let active = true
    Promise.all([
      apiRequest('/admin/dashboard', { token: sessionToken }),
      apiRequest('/admin/jobs', { token: sessionToken }),
      apiRequest('/admin/applications', { token: sessionToken }),
      apiRequest('/admin/organization', { token: sessionToken }),
      apiRequest('/admin/job-types', { token: sessionToken }),
    ])
      .then(([dashboard, jobResponse, applicationResponse, organizationResponse, jobTypeResponse]) => {
        if (!active) return
        setMetrics(dashboard)
        setJobs(jobResponse.data)
        setApplications(applicationResponse.data)
        setOrganization(organizationResponse)
        setJobTypes(jobTypeResponse.data)
        setError('')
      })
      .catch((requestError) => {
        if (active) setError(requestError.message)
      })
      .finally(() => {
        if (active) setIsLoading(false)
      })
    return () => { active = false }
  }, [sessionToken, refreshKey])

  function refresh() {
    setIsLoading(true)
    setRefreshKey((current) => current + 1)
  }

  async function saveJob(form) {
    const { id, ...fields } = form
    if (editorJob) {
      await apiRequest(`/admin/jobs/${encodeURIComponent(id)}`, {
        method: 'PUT',
        token: sessionToken,
        body: JSON.stringify(fields),
      })
      setNotice('Lowongan berhasil disimpan.')
    } else {
      await apiRequest('/admin/jobs', {
        method: 'POST',
        token: sessionToken,
        body: JSON.stringify({ id, ...fields }),
      })
      setNotice('Lowongan berhasil ditambahkan.')
    }
    setError('')
    refresh()
  }

  async function toggleJob(job) {
    setError('')
    setNotice('')
    try {
      await apiRequest(`/admin/jobs/${encodeURIComponent(job.id)}/status`, {
        method: 'PATCH',
        token: sessionToken,
        body: JSON.stringify({ is_open: !job.is_open }),
      })
      setNotice(job.is_open ? 'Lowongan ditutup.' : 'Lowongan dibuka.')
      refresh()
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  async function deleteJob() {
    if (!pendingJobDelete) return
    setJobDeleteError('')
    setIsDeletingJob(true)
    try {
      await apiRequest(`/admin/jobs/${encodeURIComponent(pendingJobDelete.id)}`, {
        method: 'DELETE',
        token: sessionToken,
      })
      setPendingJobDelete(null)
      setNotice('Lowongan berhasil dihapus.')
      setError('')
      refresh()
    } catch (requestError) {
      setJobDeleteError(requestError.message)
    } finally {
      setIsDeletingJob(false)
    }
  }

  async function openApplication(applicationId) {
    setError('')
    try {
      const application = await apiRequest(`/admin/applications/${applicationId}`, { token: sessionToken })
      setSelectedApplication(application)
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  async function saveApplicationStatus(status) {
    setIsSavingStatus(true)
    try {
      await apiRequest(`/admin/applications/${selectedApplication.id}/status`, {
        method: 'PATCH',
        token: sessionToken,
        body: JSON.stringify({ status }),
      })
      setNotice('Status lamaran berhasil diperbarui.')
      setError('')
      refresh()
    } finally {
      setIsSavingStatus(false)
    }
  }

  async function handleLogout() {
    setLogoutError('')
    try {
      await onLogout()
    } catch (requestError) {
      setLogoutError(requestError.message)
    }
  }

  const views = [
    { id: 'dashboard', label: 'Dashboard', icon: <Database size={17} /> },
    { id: 'jobs', label: 'Lowongan', icon: <BriefcaseBusiness size={17} /> },
    { id: 'job-types', label: 'Jenis Pekerjaan', icon: <SlidersHorizontal size={17} /> },
    { id: 'applications', label: 'Lamaran', icon: <FileText size={17} /> },
    { id: 'accounts', label: 'Manajemen Akun', icon: <Users size={17} /> },
    { id: 'divisions', label: 'Divisi', icon: <Building2 size={17} /> },
    { id: 'departments', label: 'Departemen', icon: <Users size={17} /> },
    { id: 'bureaus', label: 'Biro', icon: <Wrench size={17} /> },
    { id: 'monitoring', label: 'Monitoring Dataset', icon: <Search size={17} /> },
  ]

  return (
    <main className="admin-shell">
      <header className="admin-header">
        <div className="admin-header-inner">
          <Brand />
          <div className="admin-header-user">
            <span>{session.admin.name}<strong>{session.admin.email}</strong></span>
            <button className="signed-in-user-button" onClick={handleLogout} title="Keluar dari admin"><LogOut size={17} /></button>
          </div>
        </div>
      </header>
      <div className="admin-content">
        <div className="admin-page-heading">
          <div><span className="section-kicker">PANEL ADMINISTRATOR</span><h1>Dashboard Rekrutmen</h1></div>
        </div>
        <div className="admin-workspace">
          <nav aria-label="Navigasi dashboard admin" className="admin-tabs">
            {views.map((view) => (
              <button className={activeView === view.id ? 'admin-tab active' : 'admin-tab'} key={view.id} onClick={() => setActiveView(view.id)}>
                {view.icon} {view.label}
              </button>
            ))}
          </nav>
          <div className="admin-main-content">
        {error && <p className="admin-alert error" role="alert">{error}</p>}
        {logoutError && <p className="admin-alert error" role="alert">{logoutError}</p>}
        {activeView === 'dashboard' && (
          isLoading ? <section className="admin-loading">Memuat dashboard...</section> : metrics && (
            <section className="admin-dashboard-view">
              <div className="admin-metric-grid">
                <article className="admin-metric-card"><span>Total posisi</span><strong>{metrics.positions_total}</strong></article>
                <article className="admin-metric-card"><span>Lowongan aktif</span><strong>{metrics.positions_open}</strong></article>
                <article className="admin-metric-card"><span>Total lamaran</span><strong>{metrics.applications_total}</strong></article>
                <article className="admin-metric-card"><span>Lamaran masuk</span><strong>{metrics.applications_submitted}</strong></article>
              </div>
              <section className="admin-status-panel">
                <h2>Proses seleksi</h2>
                <div className="admin-status-grid">
                  {applicationStatusOptions.map((status) => (
                    <div className="admin-status-item" key={status.value}>
                      <span>{status.label}</span>
                      <strong>{metrics[`applications_${status.value}`]}</strong>
                    </div>
                  ))}
                </div>
              </section>
            </section>
          )
        )}
        {activeView === 'jobs' && (
          <section className="admin-table-panel">
            <div className="admin-table-heading">
              <div><h2>Kelola lowongan</h2><p>{jobs.length} posisi terdaftar</p></div>
              <button className="apply-button" disabled={isLoading || !jobTypes.length} onClick={() => setIsCreatingJob(true)} type="button"><Plus size={17} /> Tambah lowongan</button>
            </div>
            <div className="admin-table-scroll">
              <table className="admin-table">
                <thead><tr><th>KODE</th><th>POSISI</th><th>DIVISI / UNIT</th><th>KUOTA</th><th>STATUS</th><th>AKSI</th></tr></thead>
                <tbody>
                  {jobs.map((job) => {
                    const hasApplications = applications.some((application) => application.job_id === job.id)
                    return (
                      <tr key={job.id}>
                        <td className="position-code">{job.id}</td>
                        <td className="position-name">{job.title}</td>
                        <td>{job.division}<span className="admin-table-subtext">{job.unit}</span></td>
                        <td>{job.quota}</td>
                        <td><span className={job.is_open ? 'status-pill open' : 'status-pill closed'}>{job.is_open ? 'OPEN' : 'CLOSED'}</span></td>
                        <td className="admin-row-actions">
                          <button className="admin-small-button" onClick={() => setEditorJob(job)} type="button">Edit</button>
                          <button className="admin-small-button" onClick={() => void toggleJob(job)} type="button">{job.is_open ? 'Tutup' : 'Buka'}</button>
                          <button
                            className="admin-small-button danger"
                            disabled={isLoading || hasApplications}
                            onClick={() => { setJobDeleteError(''); setPendingJobDelete(job) }}
                            title={hasApplications ? 'Lowongan yang sudah memiliki lamaran hanya dapat ditutup' : undefined}
                            type="button"
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <p className="admin-table-note">Lowongan yang sudah memiliki lamaran hanya dapat ditutup agar riwayat lamaran tetap terjaga.</p>
          </section>
        )}
        {activeView === 'job-types' && (
          <JobTypeManager
            isLoading={isLoading}
            jobTypes={jobTypes}
            onRefresh={refresh}
            sessionToken={sessionToken}
          />
        )}
        {activeView === 'applications' && (
          <section className="admin-table-panel">
            <div className="admin-table-heading"><div><h2>Lamaran masuk</h2><p>{applications.length} lamaran</p></div></div>
            {isLoading ? <div className="admin-loading">Memuat lamaran...</div> : applications.length ? (
              <div className="admin-table-scroll">
                <table className="admin-table application-table">
                  <thead><tr><th>PELAMAR</th><th>NIP</th><th>POSISI</th><th>TANGGAL MASUK</th><th>STATUS</th><th>AKSI</th></tr></thead>
                  <tbody>
                    {applications.map((application) => (
                      <tr key={application.id}>
                        <td className="position-name">{application.applicant_name}<span className="admin-table-subtext">{application.applicant_email}</span></td>
                        <td>{application.employee_number || '—'}</td>
                        <td>{application.job_title}</td>
                        <td>{application.created_at}</td>
                        <td><span className={`status-pill status-${application.status}`}>{applicationStatusOptions.find((status) => status.value === application.status)?.label || application.status}</span></td>
                        <td><button className="admin-small-button" onClick={() => void openApplication(application.id)} type="button">Tinjau</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <div className="admin-loading">Belum ada lamaran masuk.</div>}
          </section>
        )}
        {activeView === 'accounts' && <AccountManager key={sessionToken} session={session} />}
        {['divisions', 'departments', 'bureaus'].includes(activeView) && (
          <OrganizationManager
            isLoading={isLoading}
            level={activeView}
            onRefresh={refresh}
            organization={organization}
            sessionToken={sessionToken}
          />
        )}
        {activeView === 'monitoring' && <DatasetMonitor sessionToken={sessionToken} />}
          </div>
        </div>
      </div>
      <AdminToast message={notice} onClose={setNotice} />
      {isCreatingJob && <JobEditor jobTypes={jobTypes} key="new" onClose={() => setIsCreatingJob(false)} onSave={saveJob} organization={organization} />}
      {editorJob && <JobEditor job={editorJob} jobTypes={jobTypes} key={editorJob.id} onClose={() => setEditorJob(null)} onSave={saveJob} organization={organization} />}
      {pendingJobDelete && (
        <ConfirmDialog
          error={jobDeleteError}
          isBusy={isDeletingJob}
          message={`Lowongan "${pendingJobDelete.title}" akan dihapus permanen. Aksi ini hanya tersedia jika belum ada lamaran.`}
          onCancel={() => { setPendingJobDelete(null); setJobDeleteError('') }}
          onConfirm={() => void deleteJob()}
          title="Delete lowongan?"
        />
      )}
      {selectedApplication && (
        <ApplicationReview
          application={selectedApplication}
          isSaving={isSavingStatus}
          onClose={() => setSelectedApplication(null)}
          onSave={saveApplicationStatus}
          sessionToken={sessionToken}
        />
      )}
    </main>
  )
}

export default function App() {
  const [session, setSession] = useState(null)
  const [adminSession, setAdminSession] = useState(null)

  function handleLogin(newSession) {
    if (newSession.role === 'admin' || newSession.admin) {
      setAdminSession(newSession)
      return
    }
    setSession(newSession)
  }

  async function handleLogout() {
    await apiRequest('/logout', { method: 'POST', token: session.token })
    setSession(null)
  }

  async function handleAdminLogout() {
    await apiRequest('/admin/logout', { method: 'POST', token: adminSession.token })
    setAdminSession(null)
  }

  if (adminSession) {
    return <AdminDashboard onLogout={handleAdminLogout} session={adminSession} />
  }

  return <JobCatalog onLogin={handleLogin} onLogout={handleLogout} session={session} />
}
