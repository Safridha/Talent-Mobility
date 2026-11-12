import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '../../query/queryKeys'
import ApplicationForm from './ApplicationForm'
import { ArrowLeft, Bell, Building2, ChevronLeft, ChevronRight, Eye, FileText, LogIn, Megaphone, RotateCcw, Search, Users, Wrench, X } from 'lucide-react'
import { apiRequest } from '../../api'
import Brand from '../../components/Brand'
import ModalBackdrop from '../../components/ModalBackdrop'
import SuccessPopup from '../../components/SuccessPopup'
import SearchableSelect from '../../components/SearchableSelect'
import PushNotificationControl from '../../components/PushNotificationControl'
import AccountSettingsMenu from '../../components/account/AccountSettingsMenu'
import { AccountSettingsPage } from '../account/AccountSettings'
import { useAccountAvatar } from '../account/useAccountAvatar.ts'
import ApplicantApplicationProgress from './ApplicantApplicationProgress'
import AuthDialog from '../auth/AuthDialog'
import { applicationStatusOptions, getApplicationStatusDescription } from '../applications/status'
import { usePathRoute } from '../../usePathRoute'
import { APPLICANT_ROUTES } from '../../routes'


const TARGETS_PER_PAGE = 12

// 1 2 3 ... 9 style page list: always first/last, the current page and its neighbours.
function pageNumbers(current, count) {
  if (count <= 7) return Array.from({ length: count }, (_, index) => index + 1)
  const pages = new Set([1, count, current - 1, current, current + 1])
  if (current <= 3) { pages.add(2); pages.add(3); pages.add(4) }
  if (current >= count - 2) { pages.add(count - 1); pages.add(count - 2); pages.add(count - 3) }
  const sorted = [...pages].filter((page) => page >= 1 && page <= count).sort((a, b) => a - b)
  const items = []
  sorted.forEach((page, index) => {
    if (index > 0 && page - sorted[index - 1] > 1) items.push('gap')
    items.push(page)
  })
  return items
}

function targetKind(target) {
  if (target.target_level === 'department') return { label: 'Departemen', tone: 'department' }
  return target.unit.startsWith('Bengkel') ? { label: 'Bengkel', tone: 'workshop' } : { label: 'Biro', tone: 'bureau' }
}

export default function JobCatalog({ session, onLogin, onLogout, onProfileUpdated, sessionNotice }) {
  const queryClient = useQueryClient()
  const [route, navigate] = usePathRoute('lowongan', APPLICANT_ROUTES)
  const accountSection = route === 'akun/profil' ? 'profile' : route === 'akun/keamanan' ? 'security' : null
  const [accountReturnTab, setAccountReturnTab] = useState(route === 'lamaran' ? 'applications' : 'jobs')
  const activeTab = accountSection
    ? accountReturnTab
    : route === 'lamaran' ? 'applications' : 'jobs'
  const organizationQuery = useQuery({
    queryKey: queryKeys.publicOrganization,
    queryFn: async () => apiRequest('/organization'),
  })
  const organization = organizationQuery.data ?? { divisions: [], departments: [], bureaus: [] }
  const isLoading = organizationQuery.isPending
  const organizationError = organizationQuery.error?.message || ''
  const [logoutError, setLogoutError] = useState('')
  const [applicationActionError, setApplicationActionError] = useState('')
  const [applicationNotice, setApplicationNotice] = useState('')
  const [divisionId, setDivisionId] = useState('')
  const [departmentId, setDepartmentId] = useState('')
  const [unitTarget, setUnitTarget] = useState('')
  const [targetPage, setTargetPage] = useState(1)
  const resultsRef = useRef(null)
  const [selectedApplicationId, setSelectedApplicationId] = useState(null)
  const [selectedDirectTarget, setSelectedDirectTarget] = useState(null)
  const [authMode, setAuthMode] = useState(null)
  const [applicationFormOpen, setApplicationFormOpen] = useState(false)
  const [pendingDirectTarget, setPendingDirectTarget] = useState(null)
  const [applyingJobId, setApplyingJobId] = useState('')
  const [notificationActionError, setNotificationActionError] = useState('')
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false)
  const [markingNotificationId, setMarkingNotificationId] = useState(null)
  const isAuthenticated = Boolean(session)
  const [avatarUrl, refreshAvatar] = useAccountAvatar(isAuthenticated)
  const applicationsQuery = useQuery({
    queryKey: queryKeys.applicantApplications,
    queryFn: () => apiRequest('/applications'),
    enabled: isAuthenticated,
    refetchInterval: 15_000,
  })
  const notificationsQuery = useQuery({
    queryKey: queryKeys.applicantNotifications,
    queryFn: () => apiRequest('/notifications'),
    enabled: isAuthenticated,
    refetchInterval: 15_000,
  })
  const currentUserApplications = applicationsQuery.data?.data ?? []
  const selectedApplication = currentUserApplications.find((application) => application.id === selectedApplicationId)
  const selectedApplicationJob = selectedApplication ? {
    id: selectedApplication.job_id,
    title: selectedApplication.job_title || selectedApplication.position_title,
    division: selectedApplication.division,
    department: selectedApplication.department,
    unit: selectedApplication.unit,
  } : null
  const isApplicationsLoading = Boolean(isAuthenticated && applicationsQuery.isPending)
  const currentUserNotifications = notificationsQuery.data?.data ?? []
  const currentUnreadNotificationCount = notificationsQuery.data?.unread_count ?? 0
  const applicationsError = applicationActionError || applicationsQuery.error?.message || ''
  const notificationsError = notificationActionError || notificationsQuery.error?.message || ''
  const submitApplicationMutation = useMutation({
    mutationFn: ({ body }) => apiRequest('/applications', {
      method: 'POST',
      body,
    }),
    onSuccess: (application, { position }) => {
      queryClient.setQueryData(queryKeys.applicantApplications, (current) => {
        const data = current?.data ?? []
        if (data.some((item) => item.id === application.application_id)) return current
        return {
          ...current,
          data: [...data, {
            id: application.application_id,
            job_id: application.job_id,
            target_department_id: application.target_department_id,
            target_bureau_id: application.target_bureau_id,
            job_title: position.title,
            target_level: position.target_level,
            division: position.division,
            department: position.department,
            unit: position.unit,
            position_description: position.description || null,
            status: application.status,
            created_at: application.created_at,
          }],
        }
      })
      void queryClient.invalidateQueries({ queryKey: queryKeys.applicantNotifications })
      setApplicationNotice(`Lamaran untuk ${position.title} berhasil dikirim.`)
    },
  })
  const markNotificationMutation = useMutation({
    mutationFn: (notification) => apiRequest(`/notifications/${notification.id}/read`, {
      method: 'PATCH',
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
    navigate(section ? `akun/${section === 'profile' ? 'profil' : 'keamanan'}` : activeTab === 'applications' ? 'lamaran' : 'lowongan')
  }

  const divisions = organization.divisions
  const departments = useMemo(
    () => organization.departments.filter((department) => !divisionId || String(department.division_id) === divisionId),
    [divisionId, organization.departments],
  )
  const units = useMemo(() => organization.bureaus
    .filter((bureau) => {
      const department = organization.departments.find((item) => String(item.id) === String(bureau.department_id))
      return (!divisionId || String(department?.division_id) === divisionId)
        && (!departmentId || String(bureau.department_id) === departmentId)
    })
    .map((bureau) => ({
      key: `bureau:${bureau.id}`,
      label: `${bureau.unit_type === 'bengkel' ? 'Bengkel' : 'Biro'} - ${bureau.name}`,
    })), [departmentId, divisionId, organization.bureaus, organization.departments])
  const directTargets = useMemo(() => {
    const matchedDepartments = organization.departments.filter((department) => (
      (!divisionId || String(department.division_id) === divisionId)
      && (!departmentId || String(department.id) === departmentId)
    ))
    const matchedDepartmentIds = new Set(matchedDepartments.map((department) => String(department.id)))
    const matchedBureaus = organization.bureaus.filter((bureau) => (
      matchedDepartmentIds.has(String(bureau.department_id))
    ))

    if (unitTarget.startsWith('bureau:')) {
      const bureauId = unitTarget.slice('bureau:'.length)
      return matchedBureaus
        .filter((bureau) => String(bureau.id) === bureauId)
        .map((bureau) => {
          const department = matchedDepartments.find((item) => String(item.id) === String(bureau.department_id))
          const division = organization.divisions.find((item) => String(item.id) === String(department?.division_id))
          return {
            key: `direct:${bureau.department_id}:${bureau.id}`,
            title: bureau.name,
            target_department_id: bureau.department_id,
            target_bureau_id: bureau.id,
            target_level: 'bureau',
            division: division?.name || '',
            department: department?.name || '',
            unit: `${bureau.unit_type === 'bengkel' ? 'Bengkel' : 'Biro'} - ${bureau.name}`,
            description: (bureau.description || '').trim(),
          }
        })
    }

    return matchedDepartments.flatMap((department) => {
      const division = organization.divisions.find((item) => String(item.id) === String(department.division_id))
      const departmentTarget = {
        key: `direct:${department.id}:`,
        title: department.name,
        target_department_id: department.id,
        target_bureau_id: null,
        target_level: 'department',
        division: division?.name || '',
        department: department.name,
        unit: '',
        description: (department.description || '').trim(),
      }
      const bureauTargets = matchedBureaus
        .filter((bureau) => String(bureau.department_id) === String(department.id))
        .map((bureau) => ({
          key: `direct:${department.id}:${bureau.id}`,
          title: bureau.name,
          target_department_id: department.id,
          target_bureau_id: bureau.id,
          target_level: 'bureau',
          division: division?.name || '',
          department: department.name,
          unit: `${bureau.unit_type === 'bengkel' ? 'Bengkel' : 'Biro'} - ${bureau.name}`,
          description: (bureau.description || '').trim(),
        }))
      return [departmentTarget, ...bureauTargets]
    })
  }, [departmentId, divisionId, organization.bureaus, organization.departments, organization.divisions, unitTarget])
  useEffect(() => { setTargetPage(1) }, [divisionId, departmentId, unitTarget])
  const targetPageCount = Math.max(1, Math.ceil(directTargets.length / TARGETS_PER_PAGE))
  const currentTargetPage = Math.min(targetPage, targetPageCount)
  const visibleTargets = directTargets.slice((currentTargetPage - 1) * TARGETS_PER_PAGE, currentTargetPage * TARGETS_PER_PAGE)

  function goToTargetPage(nextPage) {
    setTargetPage(Math.min(Math.max(1, nextPage), targetPageCount))
    resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const appliedDirectTargetKeys = new Set(currentUserApplications
    .filter((application) => !application.job_id && application.status !== 'rejected')
    .map((application) => `direct:${application.target_department_id}:${application.target_bureau_id ?? ''}`))

  function resetDirectTargetSelection() {
    setDivisionId('')
    setDepartmentId('')
    setUnitTarget('')
    setApplicationActionError('')
  }

  async function submitApplication(position, body) {
    setApplicationNotice('')
    setApplicationActionError('')
    setApplyingJobId(position.id || position.key)
    try {
      await submitApplicationMutation.mutateAsync({ position, body })
    } catch (requestError) {
      setApplicationActionError(requestError.message)
      throw requestError
    } finally {
      setApplyingJobId('')
    }
  }

  function handleDirectApply(directTarget) {
    setApplicationNotice('')
    if (!session) {
      setPendingDirectTarget(directTarget)
      setAuthMode('login')
      return
    }
    if (appliedDirectTargetKeys.has(directTarget.key)) {
      setApplicationActionError('Anda sudah melamar unit ini dan lamaran masih diproses.')
      return
    }
    setPendingDirectTarget(directTarget)
    setApplicationFormOpen(true)
  }

  function handleAuthSuccess(newSession) {
    onLogin(newSession)
    setAuthMode(null)
    setApplicationActionError('')
    if (pendingDirectTarget && newSession.role !== 'admin') {
      setApplicationFormOpen(true)
    } else {
      setPendingDirectTarget(null)
      setApplicationFormOpen(false)
    }
  }

  async function handleApplicationSubmit(body) {
    const position = pendingDirectTarget
    if (!position || !session) return
    await submitApplication(position, body)
    setApplicationFormOpen(false)
    setPendingDirectTarget(null)
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
                    aria-label={`Pembaruan status lamaran, ${currentUnreadNotificationCount} belum dibaca`}
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
                        <div><strong>Status lamaran</strong><span>Perubahan proses dari tim rekrutmen</span></div>
                        <button aria-label="Tutup notifikasi" onClick={() => setIsNotificationsOpen(false)} type="button"><X size={17} /></button>
                      </header>
                      <PushNotificationControl isAuthenticated={isAuthenticated} />
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
                        <p className="applicant-notification-empty">Belum ada pembaruan status lamaran.</p>
                      )}
                    </section>
                  )}
                </div>
                <AccountSettingsMenu
                  applicationCount={currentUserApplications.length}
                  avatarUrl={avatarUrl}
                  email={session.applicant.email || session.applicant.employee_number || ''}
                  name={session.applicant.name}
                  onApplications={() => navigateTab('applications')}
                  onLogout={handleLogout}
                  onSelect={navigateAccountSection}
                />
              </div>
            ) : (
              <div className="auth-actions">
                <button className="header-auth-button" onClick={() => setAuthMode('login')}><LogIn size={16} /> Masuk</button>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="page-content">
        {(logoutError || sessionNotice) && <p className="login-error" role="alert">{logoutError || sessionNotice}</p>}
        {accountSection ? (
          <AccountSettingsPage
            avatarUrl={avatarUrl}
            onAvatarChanged={refreshAvatar}
            onBack={() => navigateAccountSection(null)}
            onProfileUpdated={onProfileUpdated}
            onSectionChange={navigateAccountSection}
            section={accountSection}
            session={{ role: session.role, user: session.applicant }}
          />
        ) : activeTab === 'jobs' ? (
          <>
            <section className="hero-panel">
              <div className="hero-copy">
                <span className="hero-badge"><span><Megaphone aria-hidden="true" size={12} /></span> Program Internal Mobility Periode 2026</span>
                <h1>Reskilling, Upskilling, Mobility in Production</h1>
                <p>Program PAL Indonesia melalui reskilling, upskilling, dan mobilitas talenta lintas fungsi untuk memberdayakan karyawan menjadi kekuatan nyata dalam proses produksi.</p>
              </div>
              <div className="hero-stats organization-hero-stats" aria-label="Unit kerja yang tersedia untuk Lamar Langsung">
                <div><strong>{organization.divisions.length}</strong><span>Divisi</span></div>
                <div><strong>{organization.departments.length}</strong><span>Departemen</span></div>
                <div><strong>{organization.bureaus.length}</strong><span>Biro / Bengkel</span></div>
              </div>
            </section>

            <section aria-label="Pilih tujuan lamaran langsung" className="direct-application-picker">
              <header className="direct-application-picker-heading">
                <div>
                  <span className="direct-application-picker-kicker">TUJUAN LAMARAN</span>
                  <h2>Pilih unit tujuan</h2>
                  <p>Pilih Divisi dan Departemen. Biro atau Bengkel dapat dipilih jika ingin tujuan yang lebih spesifik.</p>
                </div>
                <button
                  className="reset-button"
                  disabled={!divisionId && !departmentId && !unitTarget}
                  onClick={resetDirectTargetSelection}
                  type="button"
                >
                  <RotateCcw size={14} /> Atur ulang
                </button>
              </header>
              <div className="direct-application-picker-grid">
                <label>
                  <span><b>1</b> Divisi</span>
                  <SearchableSelect
                    onChange={(value) => {
                      setDivisionId(value)
                      setDepartmentId('')
                      setUnitTarget('')
                      setApplicationActionError('')
                    }}
                    options={[
                      { value: '', label: 'Semua divisi' },
                      ...divisions.map((item) => ({ value: String(item.id), label: item.name })),
                    ]}
                    value={divisionId}
                  />
                </label>
                <label>
                  <span><b>2</b> Departemen</span>
                  <SearchableSelect
                    disabled={!divisionId}
                    onChange={(value) => {
                      setDepartmentId(value)
                      setUnitTarget('')
                      setApplicationActionError('')
                    }}
                    options={[
                      { value: '', label: 'Semua departemen' },
                      ...departments.map((item) => ({ value: String(item.id), label: item.name })),
                    ]}
                    value={departmentId}
                  />
                </label>
                <label>
                  <span><b>3</b> Biro / Bengkel <small>(opsional)</small></span>
                  <SearchableSelect
                    disabled={!divisionId}
                    onChange={(value) => {
                      setUnitTarget(value)
                      setApplicationActionError('')
                    }}
                    options={[
                      { value: '', label: 'Semua biro / bengkel' },
                      ...units.map((item) => ({ value: item.key, label: item.label })),
                    ]}
                    value={unitTarget}
                  />
                </label>
              </div>
            </section>

            {applicationsError && <p className="login-error" role="alert">{applicationsError}</p>}
            <SuccessPopup message={applicationNotice} onClose={setApplicationNotice} />
            {isLoading ? (
              <section className="empty-state"><h2>Memuat unit kerja...</h2></section>
            ) : organizationError ? (
              <section className="empty-state"><h2>Unit kerja belum dapat dimuat</h2><p role="alert">{organizationError}</p></section>
            ) : directTargets.length > 0 ? (
              <section aria-label="Pilihan unit kerja" className="direct-application-results" ref={resultsRef}>
                <div className="results-bar">
                  <span><strong>{directTargets.length}</strong> tujuan tersedia di {divisions.length} divisi.</span>
                  <span>Pilih unit untuk melihat cakupan tugas atau mengajukan lamaran.</span>
                </div>
                <div className="job-grid public-job-grid direct-application-grid">
                  {visibleTargets.map((target) => {
                    const hasApplied = appliedDirectTargetKeys.has(target.key)
                    const isApplying = applyingJobId === target.key
                    const kind = targetKind(target)
                    return (
                      <article className="job-card direct-application-card" key={target.key}>
                        <div className="card-top">
                          <span className="division-tag"><Building2 size={14} /> <span>{target.division}</span></span>
                          <span className={`target-kind target-kind-${kind.tone}`}>{kind.label}</span>
                        </div>
                        <h2 title={target.title}>{target.title}</h2>
                        {target.target_level === 'bureau' && (
                          <div className="job-organization">
                            <span><Users size={15} />{target.department}</span>
                          </div>
                        )}
                        <p className="job-summary direct-application-card-description">
                          {target.description || `Ajukan lamaran untuk ${target.target_level === 'department' ? 'seluruh departemen ini' : 'unit ini'}.`}
                        </p>
                        <div className="card-footer">
                          <button
                            className="detail-button"
                            onClick={() => setSelectedDirectTarget(target)}
                            type="button"
                          >
                            <Eye size={15} /> Lihat detail
                          </button>
                          <button
                            className="apply-button"
                            disabled={hasApplied || Boolean(applyingJobId)}
                            onClick={() => handleDirectApply(target)}
                            type="button"
                          >
                            {isApplying ? 'Mengirim...' : hasApplied ? 'Sudah melamar' : 'Apply'}
                          </button>
                        </div>
                      </article>
                    )
                  })}
                </div>
                {targetPageCount > 1 && (
                  <div className="job-pagination-bar">
                    <p className="job-pagination-summary">
                      Menampilkan {(currentTargetPage - 1) * TARGETS_PER_PAGE + 1}-{Math.min(currentTargetPage * TARGETS_PER_PAGE, directTargets.length)} dari {directTargets.length} unit
                    </p>
                    <nav aria-label="Halaman daftar unit" className="job-pagination">
                      <button aria-label="Halaman sebelumnya" className="job-pagination-control" disabled={currentTargetPage === 1} onClick={() => goToTargetPage(currentTargetPage - 1)} type="button">
                        <ChevronLeft aria-hidden="true" size={18} />
                      </button>
                      {pageNumbers(currentTargetPage, targetPageCount).map((item, index) => (
                        item === 'gap'
                          ? <span aria-hidden="true" className="job-pagination-gap" key={`gap-${index}`}>...</span>
                          : (
                            <button
                              aria-current={item === currentTargetPage ? 'page' : undefined}
                              aria-label={`Halaman ${item}`}
                              className={`job-pagination-page${item === currentTargetPage ? ' active' : ''}`}
                              key={item}
                              onClick={() => goToTargetPage(item)}
                              type="button"
                            >
                              {item}
                            </button>
                          )
                      ))}
                      <button aria-label="Halaman berikutnya" className="job-pagination-control" disabled={currentTargetPage === targetPageCount} onClick={() => goToTargetPage(currentTargetPage + 1)} type="button">
                        <ChevronRight aria-hidden="true" size={18} />
                      </button>
                    </nav>
                  </div>
                )}
              </section>
            ) : (
              <section className="empty-state">
                <Search size={24} />
                <h2>Tidak ada unit yang sesuai</h2>
                <p>Periksa kembali pilihan Divisi, Departemen, atau Biro/Bengkel yang tersedia.</p>
              </section>
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
                  const job = application.job_title || application.position_title ? {
                    title: application.job_title || application.position_title,
                    division: application.division,
                    department: application.department,
                    unit: application.unit,
                  } : null
                  const status = applicationStatusOptions.find((item) => item.value === application.status)
                  const submittedAt = new Date(application.created_at)
                  const submittedAtLabel = Number.isNaN(submittedAt.getTime())
                    ? 'Tanggal tidak tersedia'
                    : submittedAt.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
                  return (
                    <button
                      aria-label={`Lihat perkembangan lamaran untuk ${job?.title || 'posisi ini'}`}
                      className="application-card application-card-button"
                      key={application.id}
                      onClick={() => setSelectedApplicationId(application.id)}
                      type="button"
                    >
                      <div className="application-card-top">
                        <span className={`status-pill status-${application.status}`}>{status?.label || application.status}</span>
                        <time dateTime={Number.isNaN(submittedAt.getTime()) ? undefined : application.created_at}>{submittedAtLabel}</time>
                      </div>
                      <h2>{job?.title || application.job_title || application.position_title || 'Posisi tidak lagi tersedia'}</h2>
                      {job && (job.division || job.department || job.unit) ? (
                        <div className="application-card-organization">
                          {job.division && <span><Building2 size={15} />{job.division}</span>}
                          {job.department && <span><Users size={15} />{job.department}</span>}
                          {job.unit && <span><Wrench size={15} />{job.unit}</span>}
                        </div>
                      ) : !application.job_title && !application.position_title ? (
                        <p className="application-card-unavailable">Detail posisi sudah tidak tersedia.</p>
                      ) : null}
                      <p className="application-card-summary">{getApplicationStatusDescription(application.status) || 'Status lamaran sedang diperbarui.'}</p>
                      <footer><span>ID lamaran</span><code>{application.id || 'ID belum tersedia'}</code></footer>
                    </button>
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

      {selectedDirectTarget && (
        <ModalBackdrop onDismiss={() => setSelectedDirectTarget(null)}>
          <section
            aria-labelledby="direct-target-detail-title"
            aria-modal="true"
            className="detail-modal direct-target-detail-modal"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
          >
            <div className="modal-heading">
              <span className="division-tag"><Building2 size={14} /> {selectedDirectTarget.division}</span>
              <button
                aria-label="Tutup detail unit"
                className="icon-button"
                onClick={() => setSelectedDirectTarget(null)}
                type="button"
              >
                <X size={20} />
              </button>
            </div>
            <h2 id="direct-target-detail-title">{selectedDirectTarget.title}</h2>
            <div className="job-organization">
              <span><Users size={15} />{selectedDirectTarget.department}</span>
              {selectedDirectTarget.unit && <span><Wrench size={15} />{selectedDirectTarget.unit}</span>}
            </div>
            <section className="direct-target-detail-description">
              <h3>Deskripsi unit</h3>
              <p>{selectedDirectTarget.description || 'Deskripsi unit belum tersedia pada master data.'}</p>
            </section>
            <footer className="detail-actions">
              <button className="detail-button" onClick={() => setSelectedDirectTarget(null)} type="button">Tutup</button>
              <button
                className="apply-button"
                disabled={appliedDirectTargetKeys.has(selectedDirectTarget.key) || Boolean(applyingJobId)}
                onClick={() => {
                  const target = selectedDirectTarget
                  setSelectedDirectTarget(null)
                  handleDirectApply(target)
                }}
                type="button"
              >
                {appliedDirectTargetKeys.has(selectedDirectTarget.key) ? 'Sudah melamar' : 'Apply'}
              </button>
            </footer>
          </section>
        </ModalBackdrop>
      )}
      {authMode && (
        <AuthDialog initialMode={authMode} onClose={() => { setAuthMode(null); setPendingDirectTarget(null) }} onSuccess={handleAuthSuccess} />
      )}
      {applicationFormOpen && pendingDirectTarget && session && (
        <ApplicationForm
          directTarget={pendingDirectTarget}
          isSubmitting={applyingJobId === pendingDirectTarget.key}
          job={null}
          organization={organization}
          onClose={() => { setApplicationFormOpen(false); setPendingDirectTarget(null) }}
          onEditProfile={() => { setApplicationFormOpen(false); setPendingDirectTarget(null); navigateAccountSection('profile') }}
          onSubmit={handleApplicationSubmit}
          session={session}
        />
      )}
      {selectedApplication && (
        <ApplicantApplicationProgress
          application={selectedApplication}
          job={selectedApplicationJob}
          onClose={() => setSelectedApplicationId(null)}
        />
      )}
    </main>
  )
}
