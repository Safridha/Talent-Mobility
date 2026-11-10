import { useEffect, useMemo, useState } from 'react'
import {
  ArrowRight,
  BriefcaseBusiness,
  Building2,
  ChevronRight,
  Database,
  Eye,
  EyeOff,
  FileText,
  LogIn,
  LogOut,
  Plus,
  Save,
  RotateCcw,
  Search,
  Shield,
  SlidersHorizontal,
  Users,
  UserPlus,
  Wrench,
  X,
} from 'lucide-react'
import { apiRequest } from './api'
import '../css/App.css'

function Brand() {
  return (
    <a className="brand" href="#home" aria-label="HR Talent Mobility">
      <span className="brand-icon"><ArrowRight size={25} strokeWidth={3} /></span>
      <span className="brand-copy">
        <span className="brand-title">HR Talent Mobility <span className="brand-pill">Lintas Divisi</span></span>
        <span className="brand-subtitle">Sistem Mutasi &amp; Rotasi Karier Internal Terintegrasi</span>
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
    <div className="modal-backdrop auth-backdrop" onClick={onClose} role="presentation">
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
          <h2 id="auth-title">{mode === 'register' ? 'Buat akun pelamar' : 'Masuk untuk melamar'}</h2>
          <p className="login-description">
            {mode === 'register'
              ? 'Buat akun dengan email untuk mengirim lamaran dan memantau prosesnya.'
              : 'Masuk ke akun pelamar untuk melanjutkan proses lamaran.'}
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
                : (mode === 'register' ? 'Buat akun & lanjutkan' : 'Masuk & lanjutkan')}
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
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <section
        aria-labelledby="job-detail-title"
        aria-modal="true"
        className="detail-modal"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className="modal-heading">
          <span className="division-tag"><Building2 size={14} /> {job.division}</span>
          <button aria-label="Tutup detail" className="icon-button" onClick={onClose}><X size={20} /></button>
        </div>
        <span className="detail-id">{job.id}</span>
        <h2 id="job-detail-title">{job.title}</h2>
        <div className="detail-meta">
          <span><Users size={16} />{job.department}</span>
          <span><Wrench size={16} />{job.unit}</span>
          <span><BriefcaseBusiness size={16} />Kuota {job.quota} posisi</span>
        </div>
        <div className="detail-divider" />
        <h3>Tentang posisi</h3>
        <p>{job.summary}</p>
        <h3>Keahlian terkait</h3>
        <div className="skill-list">{job.skills.map((skill) => <span key={skill}>{skill}</span>)}</div>
        <div className="detail-actions">
          <button className="detail-button" onClick={onClose}>Tutup detail</button>
          <button className="apply-button" disabled={isApplying || hasApplied} onClick={() => onApply(job)}>
            {isApplying ? 'Mengirim...' : hasApplied ? 'Sudah melamar' : 'Lamar posisi'}
            <ArrowRight size={16} />
          </button>
        </div>
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
      <p className="job-summary">{job.summary}</p>
      <div className="card-footer">
        <span className="job-id">{job.id}</span>
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

function DatasetMonitor() {
  const [activeDataset, setActiveDataset] = useState('positions')
  const [positions, setPositions] = useState([])
  const [applicationRows, setApplicationRows] = useState([])
  const [totalApplications, setTotalApplications] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    Promise.all([
      apiRequest('/monitoring/positions'),
      apiRequest('/monitoring/applications'),
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
  }, [])

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
            <table className="monitoring-table">
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
            <table className="monitoring-table">
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

function JobCatalog({ session, onLogin, onLogout, onAdminClick }) {
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
  const [query, setQuery] = useState('')
  const [selectedJob, setSelectedJob] = useState(null)
  const [authMode, setAuthMode] = useState(null)
  const [pendingJob, setPendingJob] = useState(null)
  const [applyingJobId, setApplyingJobId] = useState('')
  const [appliedJobIds, setAppliedJobIds] = useState(() => new Set())
  const sessionToken = session?.token

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
        if (active) setAppliedJobIds(new Set(response.data.map((application) => application.job_id)))
      })
      .catch((requestError) => {
        if (active) setApplicationsError(requestError.message)
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
    const searchTerm = query.trim().toLocaleLowerCase('id')
    return jobs.filter((job) => {
      const matchesQuery = !searchTerm || [job.title, job.division, job.department, job.unit, job.summary, ...job.skills]
        .some((value) => value.toLocaleLowerCase('id').includes(searchTerm))
      return matchesQuery && (!division || job.division === division) && (!department || job.department === department) && (!unit || job.unit === unit)
    })
  }, [jobs, query, division, department, unit])

  function resetFilters() {
    setDivision('')
    setDepartment('')
    setUnit('')
    setQuery('')
  }

  async function submitApplication(job, token) {
    setApplicationNotice('')
    setApplicationsError('')
    setApplyingJobId(job.id)
    try {
      await apiRequest('/applications', {
        method: 'POST',
        token,
        body: JSON.stringify({ job_id: job.id }),
      })
      setAppliedJobIds((current) => new Set([...current, job.id]))
      setApplicationNotice(`Lamaran untuk ${job.title} berhasil dikirim.`)
      setSelectedJob(null)
    } catch (requestError) {
      setApplicationsError(requestError.message)
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
      void submitApplication(job, session.token)
    }
  }

  function handleAuthSuccess(newSession) {
    onLogin(newSession)
    setAuthMode(null)
    setAppliedJobIds(new Set())
    setApplicationsError('')
    const job = pendingJob
    setPendingJob(null)
    if (job) void submitApplication(job, newSession.token)
  }

  async function handleLogout() {
    setLogoutError('')
    try {
      await onLogout()
      setAppliedJobIds(new Set())
      setApplicationsError('')
    } catch (requestError) {
      setLogoutError(requestError.message)
    }
  }

  return (
    <main className="app-shell" id="home">
      <header className="site-header">
        <div className="header-inner">
          <Brand />
          <nav className="main-nav" aria-label="Navigasi utama">
            <button className={activeTab === 'jobs' ? 'nav-button active' : 'nav-button'} onClick={() => setActiveTab('jobs')}>
              <BriefcaseBusiness size={19} fill="currentColor" /> Lowongan Aktif
            </button>
            <button className={activeTab === 'datasets' ? 'nav-button active' : 'nav-button'} onClick={() => setActiveTab('datasets')}>
              <Database size={19} fill="currentColor" /> Monitoring Dataset <span className="nav-count">2</span>
            </button>
          </nav>
          <div className="header-account">
            <button className="header-admin-button" onClick={onAdminClick}><Shield size={15} /> Admin</button>
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
                <div><strong>3</strong><span>Pendaftar</span></div>
              </div>
            </section>

            <section className="filter-panel" aria-label="Pencarian dan filter lowongan">
              <div className="filter-heading">
                <h2><SlidersHorizontal size={21} /> Pencarian &amp; Filter Penempatan Lintas Divisi</h2>
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
                <label className="search-label">Cari Posisi / Keahlian
                  <span className="search-input"><Search size={18} /><input onChange={(event) => setQuery(event.target.value)} placeholder="Contoh: Drafter, Piping..." value={query} /></span>
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
              <section className="empty-state"><Search size={24} /><h2>Lowongan tidak ditemukan</h2><p>Coba ubah kata kunci atau filter pencarian Anda.</p><button className="reset-button" onClick={resetFilters}>Reset Filter</button></section>
            )}
          </>
        ) : <DatasetMonitor />}
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

function AdminLogin({ onBack, onLogin }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    setIsSubmitting(true)
    try {
      const session = await apiRequest('/admin/login', {
        method: 'POST',
        body: JSON.stringify({ email: email.trim(), password }),
      })
      onLogin(session)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="admin-login-page">
      <section className="admin-login-card">
        <Brand />
        <span className="section-kicker">AREA ADMINISTRATOR</span>
        <h1>Masuk ke dashboard admin</h1>
        <p>Kelola lowongan dan proses lamaran secara aman.</p>
        <form className="login-form" onSubmit={handleSubmit}>
          <label htmlFor="admin-email">Email admin</label>
          <input autoComplete="username" id="admin-email" onChange={(event) => setEmail(event.target.value)} required type="email" value={email} />
          <label htmlFor="admin-password">Kata sandi</label>
          <div className="password-field">
            <input autoComplete="current-password" id="admin-password" onChange={(event) => setPassword(event.target.value)} required type={showPassword ? 'text' : 'password'} value={password} />
            <button aria-label={showPassword ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'} onClick={() => setShowPassword((shown) => !shown)} type="button">
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
          {error && <p className="login-error" role="alert">{error}</p>}
          <button className="primary-button login-submit" disabled={isSubmitting} type="submit">
            {isSubmitting ? 'Memeriksa akun...' : 'Masuk sebagai admin'} <ArrowRight size={17} />
          </button>
        </form>
        <button className="admin-back-button" onClick={onBack} type="button">Kembali ke portal lowongan</button>
      </section>
    </main>
  )
}

function JobEditor({ job, onClose, onSave }) {
  const [form, setForm] = useState(() => job ? {
    id: job.id,
    title: job.title,
    division: job.division,
    department: job.department,
    unit: job.unit,
    location: job.location,
    quota: job.quota,
    posted: job.posted,
    job_type: job.type || job.job_type,
    summary: job.summary,
    is_open: job.is_open,
  } : {
    id: '',
    title: '',
    division: '',
    department: '',
    unit: '',
    location: '',
    quota: 1,
    posted: '',
    job_type: 'Full-time',
    summary: '',
    is_open: true,
  })
  const [skillsText, setSkillsText] = useState((job?.skills || []).join('\n'))
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
        ...form,
        id: form.id.trim(),
        quota: Number(form.quota),
        skills: lines(skillsText),
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
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <section aria-labelledby="job-editor-title" aria-modal="true" className="detail-modal admin-editor-modal" onClick={(event) => event.stopPropagation()} role="dialog">
        <div className="modal-heading">
          <h2 id="job-editor-title">{editing ? 'Ubah lowongan' : 'Tambah lowongan'}</h2>
          <button aria-label="Tutup form" className="icon-button" onClick={onClose} type="button"><X size={20} /></button>
        </div>
        <form className="admin-job-form" onSubmit={handleSubmit}>
          <label>Kode posisi<input disabled={editing} maxLength={64} name="id" onChange={updateField} required value={form.id} /></label>
          <label>Nama posisi<input name="title" onChange={updateField} required value={form.title} /></label>
          <label>Divisi<input name="division" onChange={updateField} required value={form.division} /></label>
          <label>Departemen<input name="department" onChange={updateField} required value={form.department} /></label>
          <label>Biro / bengkel<input name="unit" onChange={updateField} required value={form.unit} /></label>
          <label>Lokasi<input name="location" onChange={updateField} required value={form.location} /></label>
          <label>Kuota<input min="0" name="quota" onChange={updateField} required type="number" value={form.quota} /></label>
          <label>Tanggal / waktu tayang<input name="posted" onChange={updateField} required value={form.posted} /></label>
          <label>Jenis pekerjaan
            <select name="job_type" onChange={updateField} value={form.job_type}>
              <option>Full-time</option>
              <option>Contract</option>
              <option>Internship</option>
            </select>
          </label>
          <label className="admin-form-wide">Ringkasan<textarea name="summary" onChange={updateField} required rows="3" value={form.summary} /></label>
          <label>Keahlian terkait<textarea onChange={(event) => setSkillsText(event.target.value)} placeholder="Satu keahlian per baris" rows="3" value={skillsText} /></label>
          <label>Tanggung jawab<textarea onChange={(event) => setResponsibilitiesText(event.target.value)} placeholder="Satu tanggung jawab per baris" rows="3" value={responsibilitiesText} /></label>
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

function ApplicationReview({ application, onClose, onSave, isSaving }) {
  const [status, setStatus] = useState(application.status)
  const [error, setError] = useState('')

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
          <div><dt>Pelamar</dt><dd>{application.applicant_name}</dd></div>
          <div><dt>Email</dt><dd><a href={`mailto:${application.applicant_email}`}>{application.applicant_email}</a></dd></div>
          <div><dt>Kode posisi</dt><dd>{application.job_id}</dd></div>
          <div><dt>Dikirim</dt><dd>{application.created_at}</dd></div>
        </dl>
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

function AdminDashboard({ session, onBack, onLogout }) {
  const [activeView, setActiveView] = useState('dashboard')
  const [metrics, setMetrics] = useState(null)
  const [jobs, setJobs] = useState([])
  const [applications, setApplications] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSavingStatus, setIsSavingStatus] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)
  const [editorJob, setEditorJob] = useState(null)
  const [isCreatingJob, setIsCreatingJob] = useState(false)
  const [selectedApplication, setSelectedApplication] = useState(null)
  const [logoutError, setLogoutError] = useState('')
  const sessionToken = session.token

  useEffect(() => {
    let active = true
    Promise.all([
      apiRequest('/admin/dashboard', { token: sessionToken }),
      apiRequest('/admin/jobs', { token: sessionToken }),
      apiRequest('/admin/applications', { token: sessionToken }),
    ])
      .then(([dashboard, jobResponse, applicationResponse]) => {
        if (!active) return
        setMetrics(dashboard)
        setJobs(jobResponse.data)
        setApplications(applicationResponse.data)
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
      setNotice('Lowongan berhasil diperbarui.')
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
    { id: 'applications', label: 'Lamaran', icon: <FileText size={17} /> },
    { id: 'monitoring', label: 'Monitoring Dataset', icon: <Search size={17} /> },
  ]

  return (
    <main className="admin-shell">
      <header className="admin-header">
        <div className="admin-header-inner">
          <Brand />
          <div className="admin-header-user">
            <span>{session.admin.name}<strong>{session.admin.email}</strong></span>
            <button className="admin-logout" onClick={onBack} type="button">Portal</button>
            <button className="signed-in-user-button" onClick={handleLogout} title="Keluar dari admin"><LogOut size={17} /></button>
          </div>
        </div>
      </header>
      <div className="admin-content">
        <div className="admin-page-heading">
          <div><span className="section-kicker">PANEL ADMINISTRATOR</span><h1>Dashboard Rekrutmen</h1></div>
          <p>Kelola lowongan, tinjau lamaran, dan pantau proses seleksi.</p>
        </div>
        <nav aria-label="Navigasi dashboard admin" className="admin-tabs">
          {views.map((view) => (
            <button className={activeView === view.id ? 'admin-tab active' : 'admin-tab'} key={view.id} onClick={() => setActiveView(view.id)}>
              {view.icon} {view.label}
            </button>
          ))}
        </nav>
        {error && <p className="admin-alert error" role="alert">{error}</p>}
        {logoutError && <p className="admin-alert error" role="alert">{logoutError}</p>}
        {notice && <p className="admin-alert success" role="status">{notice}</p>}
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
              <button className="apply-button" onClick={() => setIsCreatingJob(true)} type="button"><Plus size={17} /> Tambah lowongan</button>
            </div>
            <div className="admin-table-scroll">
              <table className="admin-table">
                <thead><tr><th>KODE</th><th>POSISI</th><th>DIVISI / UNIT</th><th>KUOTA</th><th>STATUS</th><th>AKSI</th></tr></thead>
                <tbody>
                  {jobs.map((job) => (
                    <tr key={job.id}>
                      <td className="position-code">{job.id}</td>
                      <td className="position-name">{job.title}</td>
                      <td>{job.division}<span className="admin-table-subtext">{job.unit}</span></td>
                      <td>{job.quota}</td>
                      <td><span className={job.is_open ? 'status-pill open' : 'status-pill closed'}>{job.is_open ? 'OPEN' : 'CLOSED'}</span></td>
                      <td className="admin-row-actions">
                        <button className="admin-small-button" onClick={() => setEditorJob(job)} type="button">Ubah</button>
                        <button className="admin-small-button" onClick={() => void toggleJob(job)} type="button">{job.is_open ? 'Tutup' : 'Buka'}</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="admin-table-note">Posisi yang sudah memiliki lamaran tidak dihapus permanen; gunakan aksi Tutup.</p>
          </section>
        )}
        {activeView === 'applications' && (
          <section className="admin-table-panel">
            <div className="admin-table-heading"><div><h2>Lamaran masuk</h2><p>{applications.length} lamaran</p></div></div>
            {isLoading ? <div className="admin-loading">Memuat lamaran...</div> : applications.length ? (
              <div className="admin-table-scroll">
                <table className="admin-table">
                  <thead><tr><th>PELAMAR</th><th>EMAIL</th><th>POSISI</th><th>DITERIMA</th><th>STATUS</th><th>DETAIL</th></tr></thead>
                  <tbody>
                    {applications.map((application) => (
                      <tr key={application.id}>
                        <td className="position-name">{application.applicant_name}</td>
                        <td>{application.applicant_email}</td>
                        <td>{application.job_title}</td>
                        <td>{application.created_at}</td>
                        <td>{applicationStatusOptions.find((status) => status.value === application.status)?.label || application.status}</td>
                        <td><button className="admin-small-button" onClick={() => void openApplication(application.id)} type="button">Tinjau</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <div className="admin-loading">Belum ada lamaran masuk.</div>}
          </section>
        )}
        {activeView === 'monitoring' && <DatasetMonitor />}
      </div>
      {isCreatingJob && <JobEditor key="new" onClose={() => setIsCreatingJob(false)} onSave={saveJob} />}
      {editorJob && <JobEditor job={editorJob} key={editorJob.id} onClose={() => setEditorJob(null)} onSave={saveJob} />}
      {selectedApplication && (
        <ApplicationReview
          application={selectedApplication}
          isSaving={isSavingStatus}
          onClose={() => setSelectedApplication(null)}
          onSave={saveApplicationStatus}
        />
      )}
    </main>
  )
}

export default function App() {
  const [session, setSession] = useState(null)
  const [adminSession, setAdminSession] = useState(null)
  const [adminView, setAdminView] = useState(false)

  async function handleLogout() {
    await apiRequest('/logout', { method: 'POST', token: session.token })
    setSession(null)
  }

  async function handleAdminLogout() {
    await apiRequest('/admin/logout', { method: 'POST', token: adminSession.token })
    setAdminSession(null)
    setAdminView(false)
  }

  if (adminView) {
    return adminSession
      ? <AdminDashboard onBack={() => setAdminView(false)} onLogout={handleAdminLogout} session={adminSession} />
      : <AdminLogin onBack={() => setAdminView(false)} onLogin={setAdminSession} />
  }

  return <JobCatalog onAdminClick={() => setAdminView(true)} onLogin={setSession} onLogout={handleLogout} session={session} />
}
