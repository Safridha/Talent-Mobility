import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '../../query/queryKeys'
import ApplicationForm from './ApplicationForm'
import { JobCard, JobDetail } from './JobCards'
import { ArrowLeft, Bell, Building2, FileText, LogIn, Megaphone, RotateCcw, Search, Shield, SlidersHorizontal, Users, UserPlus, Wrench, X } from 'lucide-react'
import { apiRequest } from '../../api'
import Brand from '../../components/Brand'
import SuccessPopup from '../../components/SuccessPopup'
import AccountSettingsMenu from '../../components/account/AccountSettingsMenu'
import { AccountSettingsPage } from '../account/AccountSettings'
import { useAccountAvatar } from '../account/useAccountAvatar.ts'
import AuthDialog from '../auth/AuthDialog'
import { applicationStatusOptions, getApplicationStatusDescription } from '../applications/status'
import { useHashRoute } from '../../useHashRoute'

const PUBLIC_JOBS_PER_PAGE = 12
const EMPTY_JOBS = []
const APPLICANT_ROUTES = ['lowongan', 'lamaran', 'akun/profil', 'akun/keamanan']

export default function JobCatalog({ session, onLogin, onLogout, onProfileUpdated }) {
  const queryClient = useQueryClient()
  const [route, navigate] = useHashRoute('lowongan', APPLICANT_ROUTES)
  const accountSection = route === 'akun/profil' ? 'profile' : route === 'akun/keamanan' ? 'security' : null
  const [accountReturnTab, setAccountReturnTab] = useState(route === 'lamaran' ? 'applications' : 'jobs')
  const activeTab = accountSection
    ? accountReturnTab
    : route === 'lamaran' ? 'applications' : 'jobs'
  const jobsQuery = useQuery({
    queryKey: queryKeys.publicJobs,
    queryFn: async () => (await apiRequest('/jobs')).data,
  })
  const organizationQuery = useQuery({
    queryKey: queryKeys.publicOrganization,
    queryFn: async () => apiRequest('/organization'),
  })
  const jobs = jobsQuery.data ?? EMPTY_JOBS
  const organization = organizationQuery.data ?? { divisions: [], departments: [], bureaus: [] }
  const isLoading = jobsQuery.isPending || organizationQuery.isPending
  const jobsError = jobsQuery.error?.message || organizationQuery.error?.message || ''
  const [logoutError, setLogoutError] = useState('')
  const [applicationActionError, setApplicationActionError] = useState('')
  const [applicationNotice, setApplicationNotice] = useState('')
  const [divisionId, setDivisionId] = useState('')
  const [departmentId, setDepartmentId] = useState('')
  const [unitTarget, setUnitTarget] = useState('')
  const [jobPage, setJobPage] = useState(1)
  const [selectedJob, setSelectedJob] = useState(null)
  const [authMode, setAuthMode] = useState(null)
  const [applicationFormOpen, setApplicationFormOpen] = useState(false)
  const [pendingJob, setPendingJob] = useState(null)
  const [applyingJobId, setApplyingJobId] = useState('')
  const [notificationActionError, setNotificationActionError] = useState('')
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false)
  const [markingNotificationId, setMarkingNotificationId] = useState(null)
  const sessionToken = session?.token
  const [avatarUrl, refreshAvatar] = useAccountAvatar(sessionToken)
  const applicationsQuery = useQuery({
    queryKey: queryKeys.applicantApplications,
    queryFn: () => apiRequest('/applications', { token: sessionToken }),
    enabled: Boolean(sessionToken),
    refetchInterval: 15_000,
  })
  const notificationsQuery = useQuery({
    queryKey: queryKeys.applicantNotifications,
    queryFn: () => apiRequest('/notifications', { token: sessionToken }),
    enabled: Boolean(sessionToken),
    refetchInterval: 15_000,
  })
  const currentUserApplications = applicationsQuery.data?.data ?? []
  const appliedJobIds = new Set(
    currentUserApplications
      .filter((application) => application.status !== 'rejected')
      .map((application) => application.job_id),
  )
  const isApplicationsLoading = Boolean(sessionToken && applicationsQuery.isPending)
  const currentUserNotifications = notificationsQuery.data?.data ?? []
  const currentUnreadNotificationCount = notificationsQuery.data?.unread_count ?? 0
  const applicationsError = applicationActionError || applicationsQuery.error?.message || ''
  const notificationsError = notificationActionError || notificationsQuery.error?.message || ''
  const submitApplicationMutation = useMutation({
    mutationFn: ({ token, body }) => apiRequest('/applications', {
      method: 'POST',
      token,
      body,
    }),
    onSuccess: (application, { job }) => {
      queryClient.setQueryData(queryKeys.applicantApplications, (current) => {
        const data = current?.data ?? []
        if (data.some((item) => item.id === application.application_id)) return current
        return {
          ...current,
          data: [...data, {
            id: application.application_id,
            job_id: application.job_id,
            status: application.status,
            created_at: application.created_at,
          }],
        }
      })
      void queryClient.invalidateQueries({ queryKey: queryKeys.applicantNotifications })
      setApplicationNotice(`Lamaran untuk ${job.title} berhasil dikirim.`)
      setSelectedJob(null)
    },
  })
  const markNotificationMutation = useMutation({
    mutationFn: (notification) => apiRequest(`/notifications/${notification.id}/read`, {
      method: 'PATCH',
      token: sessionToken,
    }),
    onSuccess: (_, notification) => {
      queryClient.setQueryData(queryKeys.applicantNotifications, (current) => {
        if (!current) return current
        const wasUnread = current.data.some((item) => item.id === notification.id && !item.read_at)
        return {
          ...current,
          data: current.data.map((item) => (
            item.id === notification.id ? { ...item, read_at: new Date().toISOString() } : item
          )),
          unread_count: Math.max(0, current.unread_count - Number(wasUnread)),
        }
      })
    },
  })

  useEffect(() => {
    if (!session && (route === 'lamaran' || route.startsWith('akun/'))) {
      navigate('lowongan')
    }
  }, [navigate, route, session])

  function navigateTab(tab) {
    navigate(tab === 'applications' ? 'lamaran' : 'lowongan')
  }

  function navigateAccountSection(section) {
    if (section) setAccountReturnTab(activeTab)
    navigate(section ? `akun/${section}` : activeTab === 'applications' ? 'lamaran' : 'lowongan')
  }

  const divisions = organization.divisions
  const departments = useMemo(
    () => organization.departments.filter((department) => !divisionId || String(department.division_id) === divisionId),
    [divisionId, organization.departments],
  )
  const units = useMemo(() => {
    const secretariats = organization.divisions
      .filter((division) => !departmentId && division.secretariat_name && (!divisionId || String(division.id) === divisionId))
      .map((division) => ({
        key: `secretariat:${division.id}`,
        label: `Sekretariat Divisi — ${division.name}`,
      }))
    const bureaus = organization.bureaus
      .filter((bureau) => {
        const department = organization.departments.find((item) => item.id === bureau.department_id)
        return (!divisionId || String(department?.division_id) === divisionId)
          && (!departmentId || String(bureau.department_id) === departmentId)
      })
      .map((bureau) => ({
        key: `bureau:${bureau.id}`,
        label: `${bureau.unit_type === 'bengkel' ? 'Bengkel' : 'Biro'} — ${bureau.name}`,
      }))
    return [...secretariats, ...bureaus]
  }, [departmentId, divisionId, organization.bureaus, organization.departments, organization.divisions])
  const filteredJobs = useMemo(() => {
    return jobs.filter((job) => (
      (!divisionId || String(job.division_id) === divisionId)
      && (!departmentId || String(job.department_id) === departmentId)
      && (!unitTarget
        || (unitTarget.startsWith('secretariat:')
          && job.target_level === 'secretariat'
          && String(job.division_id) === unitTarget.slice('secretariat:'.length))
        || (unitTarget.startsWith('bureau:')
          && job.target_level === 'bureau'
          && String(job.bureau_id) === unitTarget.slice('bureau:'.length)))
    ))
  }, [departmentId, divisionId, jobs, unitTarget])
  const jobPageCount = Math.ceil(filteredJobs.length / PUBLIC_JOBS_PER_PAGE)
  const currentJobPage = Math.min(jobPage, Math.max(1, jobPageCount))
  const visibleJobs = filteredJobs.slice(
    (currentJobPage - 1) * PUBLIC_JOBS_PER_PAGE,
    currentJobPage * PUBLIC_JOBS_PER_PAGE,
  )

  function resetFilters() {
    setDivisionId('')
    setDepartmentId('')
    setUnitTarget('')
    setJobPage(1)
  }

  async function submitApplication(job, token, body) {
    setApplicationNotice('')
    setApplicationActionError('')
    setApplyingJobId(job.id)
    try {
      await submitApplicationMutation.mutateAsync({ job, token, body })
    } catch (requestError) {
      setApplicationActionError(requestError.message)
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
    setApplicationActionError('')
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

  async function openApplicantNotification(notification) {
    navigateTab('applications')
    setIsNotificationsOpen(false)
    if (notification.read_at) return
    setMarkingNotificationId(notification.id)
    setNotificationActionError('')
    try {
      await markNotificationMutation.mutateAsync(notification)
    } catch (requestError) {
      setNotificationActionError(requestError.message)
    } finally {
      setMarkingNotificationId(null)
    }
  }

  async function handleLogout() {
    setLogoutError('')
    try {
      await onLogout()
      setApplicationActionError('')
      setNotificationActionError('')
      setIsNotificationsOpen(false)
      navigateTab('jobs')
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
                <div className="applicant-notification-menu">
                  <button
                    aria-expanded={isNotificationsOpen}
                    aria-haspopup="dialog"
                    aria-label={`Notifikasi, ${currentUnreadNotificationCount} belum dibaca`}
                    className="applicant-notification-button"
                    onClick={() => setIsNotificationsOpen((current) => !current)}
                    title="Notifikasi"
                    type="button"
                  >
                    <Bell size={18} />
                    {currentUnreadNotificationCount > 0 && (
                      <span className="applicant-notification-count">
                        {currentUnreadNotificationCount > 99 ? '99+' : currentUnreadNotificationCount}
                      </span>
                    )}
                  </button>
                  {isNotificationsOpen && (
                    <section aria-label="Notifikasi status lamaran" className="applicant-notification-panel" role="dialog">
                      <header>
                        <strong>Notifikasi</strong>
                        <button aria-label="Tutup notifikasi" onClick={() => setIsNotificationsOpen(false)} type="button"><X size={17} /></button>
                      </header>
                      {notificationsError ? (
                        <p className="applicant-notification-error" role="alert">{notificationsError}</p>
                      ) : notificationsQuery.isPending ? (
                        <p className="applicant-notification-empty">Memuat notifikasi...</p>
                      ) : currentUserNotifications.length ? (
                        <ul>
                          {currentUserNotifications.map((notification) => {
                            const previousStatus = applicationStatusOptions.find((status) => status.value === notification.previous_status)?.label || notification.previous_status
                            const newStatus = applicationStatusOptions.find((status) => status.value === notification.new_status)?.label || notification.new_status
                            return (
                              <li className={notification.read_at ? '' : 'unread'} key={notification.id}>
                                <span className="applicant-notification-status">{newStatus}</span>
                                <strong>{notification.job_title}</strong>
                                <p>Status berubah dari {previousStatus} menjadi {newStatus}.</p>
                                {notification.reason && <p>Alasan: {notification.reason}</p>}
                                <time dateTime={notification.created_at}>{new Date(notification.created_at).toLocaleString('id-ID')}</time>
                                <button
                                  className="applicant-notification-open"
                                  disabled={markingNotificationId === notification.id}
                                  onClick={() => void openApplicantNotification(notification)}
                                  type="button"
                                >
                                  {markingNotificationId === notification.id ? 'Membuka...' : 'Lihat lamaran'}
                                </button>
                              </li>
                            )
                          })}
                        </ul>
                      ) : (
                        <p className="applicant-notification-empty">Belum ada notifikasi status lamaran.</p>
                      )}
                    </section>
                  )}
                </div>
                <AccountSettingsMenu
                  applicationCount={currentUserApplications.length}
                  avatarUrl={avatarUrl}
                  email={session.applicant.email}
                  name={session.applicant.name}
                  onApplications={() => navigateTab('applications')}
                  onLogout={handleLogout}
                  onSelect={navigateAccountSection}
                />
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
        {logoutError && <p className="login-error" role="alert">{logoutError}</p>}
        {accountSection ? (
          <AccountSettingsPage
            avatarUrl={avatarUrl}
            onAvatarChanged={refreshAvatar}
            onBack={() => navigateAccountSection(null)}
            onProfileUpdated={onProfileUpdated}
            onSectionChange={navigateAccountSection}
            section={accountSection}
            session={{ role: session.role, token: session.token, user: session.applicant }}
          />
        ) : activeTab === 'jobs' ? (
          <>
            <section className="hero-panel">
              <div className="hero-copy">
                <span className="hero-badge"><span><Megaphone aria-hidden="true" size={12} /></span> Program Internal Mobility Periode 2026</span>
                <h1>Kembangkan Karier Anda di Unit &amp; Divisi Baru</h1>
                <p>Fasilitasi perpindahan internal transparan antardivisi, biro, dan bengkel produksi. Perluas keahlian teknis dan manajerial Anda untuk kemajuan bersama perusahaan.</p>
              </div>
              <div className="hero-stats" aria-label="Ringkasan lowongan">
                <div><strong>{jobs.length}</strong><span>Posisi Aktif</span></div>
                <div><strong>{new Set(jobs.map((job) => job.unit).filter(Boolean)).size}</strong><span>Biro/Bengkel</span></div>
              </div>
            </section>

            <section className="filter-panel" aria-label="Filter struktur organisasi lowongan">
              <div className="filter-heading">
                <h2><SlidersHorizontal size={21} /> Filter berdasarkan struktur organisasi</h2>
                <button className="reset-button" onClick={resetFilters}><RotateCcw size={15} /> Reset Filter</button>
              </div>
              <div className="filter-grid">
                <label>Divisi Tujuan
                  <select onChange={(event) => { setDivisionId(event.target.value); setDepartmentId(''); setUnitTarget(''); setJobPage(1) }} value={divisionId}>
                    <option value="">Semua Divisi</option>
                    {divisions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                  </select>
                </label>
                <label>Departemen Tujuan
                  <select onChange={(event) => { setDepartmentId(event.target.value); setUnitTarget(''); setJobPage(1) }} value={departmentId}>
                    <option value="">Semua Departemen</option>
                    {departments.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                  </select>
                </label>
                <label>Sekretariat / Biro / Bengkel
                  <select onChange={(event) => { setUnitTarget(event.target.value); setJobPage(1) }} value={unitTarget}>
                    <option value="">Semua Sekretariat, Biro &amp; Bengkel</option>
                    {units.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
                  </select>
                </label>
              </div>
            </section>

            <div className="results-bar">
              <span>Menampilkan <strong>{filteredJobs.length}</strong> lowongan pekerjaan aktif</span>
            </div>
            {applicationsError && <p className="login-error" role="alert">{applicationsError}</p>}
            <SuccessPopup message={applicationNotice} onClose={setApplicationNotice} />
            {isLoading ? (
              <section className="empty-state"><h2>Memuat lowongan...</h2></section>
            ) : jobsError ? (
              <section className="empty-state"><h2>Lowongan belum dapat dimuat</h2><p role="alert">{jobsError}</p></section>
            ) : filteredJobs.length ? (
              <section className="job-grid public-job-grid" aria-label="Daftar lowongan aktif">
                {visibleJobs.map((job) => (
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
            {jobPageCount > 1 && (
              <nav aria-label="Halaman daftar lowongan" className="job-pagination">
                <button
                  aria-label="Halaman sebelumnya"
                  className="job-pagination-control"
                  disabled={currentJobPage === 1}
                  onClick={() => setJobPage(currentJobPage - 1)}
                  type="button"
                >
                  Sebelumnya
                </button>
                {Array.from({ length: jobPageCount }, (_, index) => index + 1).map((page) => (
                  <button
                    aria-current={currentJobPage === page ? 'page' : undefined}
                    aria-label={`Halaman ${page}`}
                    className={`job-pagination-page${currentJobPage === page ? ' active' : ''}`}
                    key={page}
                    onClick={() => setJobPage(page)}
                    type="button"
                  >
                    {page}
                  </button>
                ))}
                <button
                  aria-label="Halaman berikutnya"
                  className="job-pagination-control"
                  disabled={currentJobPage === jobPageCount}
                  onClick={() => setJobPage(currentJobPage + 1)}
                  type="button"
                >
                  Berikutnya
                </button>
              </nav>
            )}
          </>
        ) : activeTab === 'applications' && session ? (
          <section aria-labelledby="my-applications-title" className="applications-page">
            <section className="hero-panel applications-hero">
              <div className="hero-copy">
                <span className="hero-badge"><FileText size={14} /> Perkembangan proses</span>
                <h1 id="my-applications-title">Lamaran Saya</h1>
                <p>Pantau status dan informasi terbaru dari tim Human Capital untuk setiap posisi yang Anda lamar.</p>
              </div>
              <div className="hero-stats">
                <div><strong>{currentUserApplications.length}</strong><span>Total lamaran</span></div>
                <div>
                  <strong>{currentUserApplications.filter((application) => ['submitted', 'screening', 'interview'].includes(application.status)).length}</strong>
                  <span>Dalam proses</span>
                </div>
                <div>
                  <strong>{currentUserApplications.filter((application) => ['accepted', 'rejected'].includes(application.status)).length}</strong>
                  <span>Selesai</span>
                </div>
              </div>
            </section>
            <button className="back-button application-back-button" onClick={() => navigateTab('jobs')} type="button">
              <ArrowLeft aria-hidden="true" size={16} /> Kembali ke lowongan
            </button>
            {(applicationActionError || applicationsQuery.isError) && applicationsError ? (
              <section className="applications-page-state"><h2>Riwayat belum dapat dimuat</h2><p role="alert">{applicationsError}</p></section>
            ) : isApplicationsLoading ? (
              <section className="applications-page-state"><h2>Memuat riwayat lamaran...</h2></section>
            ) : currentUserApplications.length ? (
              <section aria-label="Riwayat lamaran" className="applications-card-grid">
                {currentUserApplications.map((application) => {
                  const job = jobs.find((item) => item.id === application.job_id)
                  const status = applicationStatusOptions.find((item) => item.value === application.status)
                  const submittedAt = new Date(application.created_at)
                  const submittedAtLabel = Number.isNaN(submittedAt.getTime())
                    ? 'Tanggal tidak tersedia'
                    : submittedAt.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
                  return (
                    <article className="application-card" key={application.id}>
                      <div className="application-card-top">
                        <span className={`status-pill status-${application.status}`}>{status?.label || application.status}</span>
                        <time dateTime={Number.isNaN(submittedAt.getTime()) ? undefined : application.created_at}>{submittedAtLabel}</time>
                      </div>
                      <h2>{job?.title || 'Posisi tidak lagi tersedia'}</h2>
                      {job ? (
                        <div className="application-card-organization">
                          <span><Building2 size={15} />{job.division}</span>
                          <span><Users size={15} />{job.department}</span>
                          <span><Wrench size={15} />{job.unit}</span>
                        </div>
                      ) : <p className="application-card-unavailable">Detail posisi sudah tidak tersedia.</p>}
                      <p className="application-card-summary">{getApplicationStatusDescription(application.status) || 'Status lamaran sedang diperbarui.'}</p>
                      <footer><span>ID lamaran</span><code>{application.id || 'ID belum tersedia'}</code></footer>
                    </article>
                  )
                })}
              </section>
            ) : (
              <section className="applications-page-state">
                <FileText size={24} />
                <h2>Belum ada lamaran</h2>
                <p>Temukan posisi yang sesuai dengan pengalaman Anda, lalu kirim lamaran untuk mulai mengikuti proses seleksi.</p>
              </section>
            )}
          </section>
        ) : null}
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
