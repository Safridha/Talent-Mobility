import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bell, BriefcaseBusiness, Building2, Database, Download, FileText, Plus, Shield, SlidersHorizontal, Users, Wrench, X } from 'lucide-react'
import { apiDownload, apiRequest } from '../../api'
import Brand from '../../components/Brand'
import AccountSettingsMenu from '../../components/account/AccountSettingsMenu'
import { applicationStatusOptions } from '../applications/status'
import { AccountSettingsPage } from '../account/AccountSettings'
import { useAccountAvatar } from '../account/useAccountAvatar.ts'
import { AdminTableToolbar } from './AdminPrimitives'
import { AdminTablePagination } from './AdminPagination'
import { useAdminPagination } from './useAdminPagination'
import { downloadTablePdf } from './downloadPdf'
import SuccessPopup from '../../components/SuccessPopup'
import PushNotificationControl from '../../components/PushNotificationControl'
import { JobEditor } from './JobEditor'
import { OrganizationManager, JobTypeManager } from './OrganizationManagers'
import { AccountManager } from './AccountManagers'
import { ApplicationReview } from './ApplicationReview'
import { EmployeeDirectoryManager } from './EmployeeDirectoryManager'
import { AdminAuditLog } from './AdminAuditLog'
import { queryKeys } from '../../query/queryKeys'
import { useHashRoute } from '../../useHashRoute'

const ADMIN_VIEW_ROUTES = {
  dashboard: 'dashboard',
  jobs: 'lowongan',
  applications: 'lamaran',
  'job-types': 'jenis-pekerjaan',
  accounts: 'manajemen-akun',
  employees: 'karyawan',
  divisions: 'divisi',
  departments: 'departemen',
  bureaus: 'biro',
  audit: 'audit-log',
}
const ADMIN_VIEW_PRESENTATION = {
  dashboard: { label: 'Dashboard', icon: Database },
  jobs: { label: 'Lowongan', icon: BriefcaseBusiness },
  applications: { label: 'Lamaran Masuk', icon: FileText },
  'job-types': { label: 'Jenis Pekerjaan', icon: SlidersHorizontal },
  accounts: { label: 'Manajemen Akun', icon: Users },
  employees: { label: 'Karyawan', icon: Users },
  divisions: { label: 'Divisi', icon: Building2 },
  departments: { label: 'Departemen', icon: Building2 },
  bureaus: { label: 'Biro', icon: Wrench },
  audit: { label: 'Riwayat Audit', icon: Shield },
}
const ADMIN_ROUTES = [
  ...Object.values(ADMIN_VIEW_ROUTES).map((view) => `admin/${view}`),
  'admin/account/profile', 'admin/account/security',
]

function saveDownload(blob, filename) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.append(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export default function AdminDashboard({ session, onLogout, onProfileUpdated }) {
  const queryClient = useQueryClient()
  const [route, navigate] = useHashRoute('admin/dashboard', ADMIN_ROUTES)
  const routeView = Object.entries(ADMIN_VIEW_ROUTES)
    .find(([, view]) => route === `admin/${view}`)?.[0] || 'dashboard'
  const accountSection = route === 'admin/account/profile' ? 'profile' : route === 'admin/account/security' ? 'security' : null
  const [accountReturnView, setAccountReturnView] = useState(routeView)
  const activeView = accountSection ? accountReturnView : routeView
  const [isSavingStatus, setIsSavingStatus] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [editorJob, setEditorJob] = useState(null)
  const [isCreatingJob, setIsCreatingJob] = useState(false)
  const [jobSearch, setJobSearch] = useState('')
  const [jobStatusFilter, setJobStatusFilter] = useState('all')
  const [jobTypeFilter, setJobTypeFilter] = useState('all')
  const [jobDivisionFilter, setJobDivisionFilter] = useState('all')
  const [applicationSearch, setApplicationSearch] = useState('')
  const [applicationStatusFilter, setApplicationStatusFilter] = useState('all')
  const [applicationJobFilter, setApplicationJobFilter] = useState('all')
  const [selectedApplication, setSelectedApplication] = useState(null)
  const [downloadingApplicationId, setDownloadingApplicationId] = useState(null)
  const [logoutError, setLogoutError] = useState('')
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false)
  const sessionToken = session.token
  const adminRole = session.admin.admin_role || 'super_admin'
  const isSuperAdmin = adminRole === 'super_admin'
  const grantedPermissions = new Set(session.admin.permissions || [])
  const hasPermission = (permission) => isSuperAdmin || grantedPermissions.has(permission)
  const canViewJobs = hasPermission('jobs.view')
  const canCreateJobs = hasPermission('jobs.create')
  const canUpdateJobs = hasPermission('jobs.update')
  const canChangeJobStatus = hasPermission('jobs.change_status')
  const canViewApplications = hasPermission('applications.view')
  const canChangeApplicationStatus = hasPermission('applications.change_status')
  const canDownloadApplicationDocuments = hasPermission('applications.download_documents')
  const canManageJobTypes = hasPermission('job_types.manage')
  const canManageApplicantAccounts = hasPermission('applicant_accounts.manage')
  const canViewEmployees = hasPermission('employees.view')
  const canManageEmployees = hasPermission('employees.manage')
  const canViewOrganizationOptions = isSuperAdmin || canCreateJobs || canUpdateJobs || canViewEmployees
  const adminRoleLabel = {
    super_admin: 'Super Admin',
    admin: 'Admin Operasional',
    division_head: 'Kepala Divisi (Kadiv)',
    department_head: 'Kepala Departemen (Kadep)',
  }[adminRole] || 'Administrator'
  const [avatarUrl, refreshAvatar] = useAccountAvatar(sessionToken)
  const adminSessionQuery = useQuery({
    queryKey: queryKeys.adminSession,
    queryFn: () => apiRequest('/admin/session', { token: sessionToken }),
    enabled: Boolean(sessionToken),
    refetchInterval: 30000,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
    retry: false,
  })
  const dashboardQuery = useQuery({
    queryKey: queryKeys.adminDashboard,
    queryFn: () => apiRequest('/admin/dashboard', { token: sessionToken }),
    enabled: canViewJobs || canViewApplications,
  })
  const jobsQuery = useQuery({
    queryKey: queryKeys.adminJobs,
    queryFn: () => apiRequest('/admin/jobs', { token: sessionToken }),
    enabled: canViewJobs,
  })
  const applicationsQuery = useQuery({
    queryKey: queryKeys.adminApplications,
    queryFn: () => apiRequest('/admin/applications', { token: sessionToken }),
    enabled: canViewApplications,
  })
  const organizationQuery = useQuery({
    queryKey: queryKeys.adminOrganization,
    queryFn: () => apiRequest('/admin/organization', { token: sessionToken }),
    enabled: canViewOrganizationOptions,
  })
  const jobTypesQuery = useQuery({
    queryKey: queryKeys.adminJobTypes,
    queryFn: async () => {
      const response = await apiRequest('/admin/job-types', { token: sessionToken })
      if (!Array.isArray(response.data)) {
        throw new Error('Daftar jenis pekerjaan dari server tidak valid.')
      }
      return response.data
    },
    enabled: canViewJobs || canManageJobTypes,
  })
  const adminNotificationsQuery = useQuery({
    queryKey: queryKeys.adminNotifications,
    queryFn: () => apiRequest('/admin/notifications', { token: sessionToken }),
    refetchInterval: 30000,
    enabled: canViewApplications,
  })
  const metrics = dashboardQuery.data
  const jobs = jobsQuery.data?.data ?? []
  const applications = applicationsQuery.data?.data ?? []
  const organization = organizationQuery.data ?? { divisions: [], departments: [], bureaus: [] }
  const jobTypes = jobTypesQuery.data ?? []
  const adminNotifications = adminNotificationsQuery.data?.data ?? []
  const unreadNotificationCount = adminNotificationsQuery.data?.unread_count ?? 0
  const isLoading = activeView === 'dashboard'
    ? dashboardQuery.isPending
    : activeView === 'jobs'
      ? jobsQuery.isPending || (canViewOrganizationOptions && organizationQuery.isPending)
      : activeView === 'applications' && applicationsQuery.isPending
  const isJobTypesLoading = jobTypesQuery.isPending
  const jobTypesError = jobTypesQuery.error?.message ?? ''
  const queryError = [
    adminSessionQuery,
    dashboardQuery,
    ...(canViewJobs ? [jobsQuery] : []),
    ...(canViewApplications ? [applicationsQuery, adminNotificationsQuery] : []),
    ...(canViewOrganizationOptions ? [organizationQuery] : []),
    ...(canViewJobs || canManageJobTypes ? [jobTypesQuery] : []),
  ]
    .find((query) => query.error)?.error?.message ?? ''

  const saveJobMutation = useMutation({
    mutationFn: ({ id, fields, isEditing }) => apiRequest(
      isEditing ? `/admin/jobs/${encodeURIComponent(id)}` : '/admin/jobs',
      {
        method: isEditing ? 'PUT' : 'POST',
        token: sessionToken,
        body: JSON.stringify(isEditing ? fields : { id, ...fields }),
      },
    ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.admin }),
  })
  const jobStatusMutation = useMutation({
    mutationFn: ({ id, status }) => apiRequest(`/admin/jobs/${encodeURIComponent(id)}/status`, {
      method: 'PATCH',
      token: sessionToken,
      body: JSON.stringify({ status }),
    }),
    onSuccess: async (_, { id, status }) => {
      queryClient.setQueryData(queryKeys.adminJobs, (current) => current && ({
        ...current,
        data: current.data.map((job) => job.id === id ? { ...job, status } : job),
      }))
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.admin }),
        queryClient.invalidateQueries({ queryKey: queryKeys.publicJobs }),
      ])
    },
  })

  function refresh() {
    setError('')
    return queryClient.invalidateQueries({ queryKey: queryKeys.admin })
  }

  async function saveJob(form) {
    const { id, ...fields } = form
    await saveJobMutation.mutateAsync({ id, fields, isEditing: Boolean(editorJob) })
    setNotice(editorJob ? 'Lowongan berhasil disimpan.' : 'Lowongan berhasil ditambahkan sebagai draft.')
    setError('')
  }

  async function toggleJob(job) {
    setError('')
    setNotice('')
    try {
      const status = job.status === 'open' ? 'closed' : 'open'
      await jobStatusMutation.mutateAsync({ id: job.id, status })
      setNotice(status === 'open' ? 'Lowongan dibuka.' : 'Lowongan ditutup.')
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

  async function downloadPrimaryApplicationDocument(application) {
    setError('')
    setDownloadingApplicationId(application.id)
    try {
      const details = await apiRequest(`/admin/applications/${application.id}`, { token: sessionToken })
      const file = details.documents.find((document) => document.document_type === 'cv')
        || details.documents[0]
      if (!file) throw new Error('Lamaran ini belum memiliki CV atau berkas pendukung.')
      const blob = await apiDownload(
        `/admin/applications/${application.id}/documents/${file.id}`,
        { token: sessionToken },
      )
      const safeName = file.file_name.replace(/[\\/:*?"<>|]/g, '_')
      saveDownload(blob, `lamaran-${application.id}-${safeName}`)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setDownloadingApplicationId(null)
    }
  }

  async function openAdminNotification(notification) {
    setError('')
    try {
      if (!notification.read_at) {
        await apiRequest(`/admin/notifications/${notification.id}/read`, {
          method: 'PATCH',
          token: sessionToken,
        })
        await queryClient.invalidateQueries({ queryKey: queryKeys.adminNotifications })
      }
      setIsNotificationsOpen(false)
      navigateView('applications')
      await openApplication(notification.application_id)
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  async function saveApplicationStatus(status, reason) {
    setIsSavingStatus(true)
    try {
      await apiRequest(`/admin/applications/${selectedApplication.id}/status`, {
        method: 'PATCH',
        token: sessionToken,
        body: JSON.stringify({ status, reason }),
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

  const jobTypeOptions = [...new Set(jobs.map((job) => job.type || job.job_type).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right, 'id'))
  const jobDivisionOptions = [...new Set(jobs.map((job) => job.division).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right, 'id'))
  const filteredJobs = jobs.filter((job) => {
    const query = jobSearch.trim().toLocaleLowerCase('id')
    const type = job.type || job.job_type || ''
    const matchesSearch = `${job.id} ${job.title} ${job.division} ${job.unit} ${job.location} ${type}`
      .toLocaleLowerCase('id')
      .includes(query)
    const matchesStatus = jobStatusFilter === 'all'
      || job.status === jobStatusFilter
    const matchesType = jobTypeFilter === 'all' || type === jobTypeFilter
    const matchesDivision = jobDivisionFilter === 'all' || job.division === jobDivisionFilter
    return matchesSearch && matchesStatus && matchesType && matchesDivision
  })
  const applicationJobOptions = [...new Map(applications.map((application) => [
    application.job_id,
    { value: String(application.job_id), label: `${application.job_title} (${application.job_id})` },
  ])).values()].sort((left, right) => left.label.localeCompare(right.label, 'id'))
  const filteredApplications = applications.filter((application) => {
    const query = applicationSearch.trim().toLocaleLowerCase('id')
    const matchesSearch = `${application.applicant_name} ${application.applicant_email} ${application.employee_number || ''} ${application.job_title} ${application.job_id} ${application.created_at}`
      .toLocaleLowerCase('id')
      .includes(query)
    const matchesStatus = applicationStatusFilter === 'all' || application.status === applicationStatusFilter
    const matchesJob = applicationJobFilter === 'all' || String(application.job_id) === applicationJobFilter
    return matchesSearch && matchesStatus && matchesJob
  })
  const { items: pageJobs, page: jobsPage, setPage: setJobsPage } = useAdminPagination(filteredJobs)
  const { items: pageApplications, page: applicationsPage, setPage: setApplicationsPage } = useAdminPagination(filteredApplications)

  const availableViews = useMemo(() => {
    const access = {
      dashboard: canViewJobs || canViewApplications,
      jobs: canViewJobs,
      applications: canViewApplications,
      'job-types': canManageJobTypes,
      accounts: canManageApplicantAccounts || isSuperAdmin,
      employees: canViewEmployees,
      divisions: isSuperAdmin,
      departments: isSuperAdmin,
      bureaus: isSuperAdmin,
      audit: isSuperAdmin,
    }
    return Object.keys(ADMIN_VIEW_ROUTES).filter((view) => access[view])
  }, [canManageApplicantAccounts, canManageJobTypes, canViewApplications, canViewEmployees, canViewJobs, isSuperAdmin])
  const views = availableViews.map((id) => {
    const { label, icon: Icon } = ADMIN_VIEW_PRESENTATION[id]
    return { id, label, icon: <Icon size={17} /> }
  })
  useEffect(() => {
    if (!availableViews.includes(activeView) && !accountSection) {
      navigate(`admin/${ADMIN_VIEW_ROUTES[availableViews[0]] || 'dashboard'}`)
    }
  }, [activeView, accountSection, availableViews, navigate])

  function navigateView(view) {
    setAccountReturnView(view)
    navigate(`admin/${ADMIN_VIEW_ROUTES[view]}`)
  }

  function navigateAccountSection(section) {
    if (section) setAccountReturnView(activeView)
    navigate(section ? `admin/account/${section}` : `admin/${ADMIN_VIEW_ROUTES[activeView]}`)
  }

  const activeViewDescription = {
    dashboard: 'Program PAL Indonesia melalui reskilling, upskilling, dan mobilitas talenta lintas fungsi untuk memberdayakan karyawan menjadi kekuatan nyata dalam proses produksi.',
    jobs: 'Kelola lowongan, kebutuhan posisi, dan status publikasi.',
    'job-types': 'Atur jenis pekerjaan yang digunakan pada lowongan.',
    applications: 'Tinjau data pelamar dan perbarui tahapan seleksi.',
    accounts: 'Kelola akun pelamar dan akses portal.',
    employees: 'Kelola direktori karyawan sesuai lingkup organisasi.',
    divisions: 'Kelola struktur organisasi tingkat divisi.',
    departments: 'Kelola struktur organisasi tingkat departemen.',
    bureaus: 'Kelola biro dan bengkel pada struktur organisasi.',
    audit: 'Tinjau perubahan akun, izin akses, dan data master.',
  }[activeView]
  const activeViewLabel = views.find((view) => view.id === activeView)?.label || 'Dashboard Rekrutmen'

  return (
    <main className="admin-shell">
      <header className="admin-header">
        <div className="admin-header-inner">
          <Brand />
          <div className="admin-header-user">
            {canViewApplications && <div className="admin-notification-wrap">
              <button
                aria-expanded={isNotificationsOpen}
                aria-label={`Notifikasi lamaran, ${unreadNotificationCount} belum dibaca`}
                className="admin-notification-button"
                onClick={() => setIsNotificationsOpen((open) => !open)}
                type="button"
              >
                <Bell size={20} />
                {unreadNotificationCount > 0 && <span className="admin-notification-badge">{unreadNotificationCount > 99 ? '99+' : unreadNotificationCount}</span>}
              </button>
              {isNotificationsOpen && (
                <section aria-label="Notifikasi lamaran baru" className="admin-notification-panel" role="dialog">
                  <div className="admin-notification-heading">
                    <div><strong>Lamaran baru</strong><span>Pelamar baru untuk lowongan dalam lingkup Anda · {unreadNotificationCount} belum dibaca</span></div>
                    <button aria-label="Tutup notifikasi" className="admin-notification-close" onClick={() => setIsNotificationsOpen(false)} type="button"><X size={17} /></button>
                  </div>
                  <PushNotificationControl sessionToken={sessionToken} />
                  {adminNotificationsQuery.isPending ? (
                    <p className="admin-notification-empty">Memuat notifikasi...</p>
                  ) : adminNotificationsQuery.error ? (
                    <p className="admin-notification-empty" role="alert">{adminNotificationsQuery.error.message}</p>
                  ) : adminNotifications.length ? (
                    <div className="admin-notification-list">
                      {adminNotifications.map((notification) => (
                        <button
                          className={`admin-notification-item${notification.read_at ? '' : ' unread'}`}
                          key={notification.id}
                          onClick={() => void openAdminNotification(notification)}
                          type="button"
                        >
                          <span className="admin-notification-item-title">{notification.applicant_name}</span>
                          <span>{notification.job_title} · {notification.job_id}</span>
                          <small>{new Date(notification.created_at).toLocaleString('id-ID')}</small>
                        </button>
                      ))}
                    </div>
                  ) : <p className="admin-notification-empty">Belum ada lamaran baru.</p>}
                </section>
              )}
            </div>}
            <AccountSettingsMenu
              avatarUrl={avatarUrl}
              email={session.admin.email}
              name={session.admin.name}
              onLogout={handleLogout}
              onSelect={navigateAccountSection}
            />
          </div>
        </div>
      </header>
      <div className="admin-content">
        {logoutError && <p className="admin-alert error" role="alert">{logoutError}</p>}
        {accountSection ? (
          <AccountSettingsPage
            avatarUrl={avatarUrl}
            onAvatarChanged={refreshAvatar}
            onBack={() => navigateAccountSection(null)}
            onProfileUpdated={onProfileUpdated}
            onSectionChange={navigateAccountSection}
            section={accountSection}
            session={{ role: session.role, token: session.token, user: session.admin }}
          />
        ) : (
          <>
            <div className="admin-page-heading">
              <div>
                <span className="admin-heading-kicker">PANEL ADMINISTRATOR · {adminRoleLabel.toLocaleUpperCase('id')}</span>
                <h1>{activeView === 'dashboard' ? 'Dashboard Rekrutmen' : activeViewLabel}</h1>
                <p>{activeViewDescription}</p>
              </div>
              <span aria-hidden="true" className="admin-heading-mark"><Shield size={30} /></span>
            </div>
            <div className="admin-workspace">
          <nav aria-label="Navigasi dashboard admin" className="admin-tabs">
            {views.map((view) => (
              <button aria-current={activeView === view.id ? 'page' : undefined} className={activeView === view.id ? 'admin-tab active' : 'admin-tab'} key={view.id} onClick={() => navigateView(view.id)} type="button">
                {view.icon} {view.label}
              </button>
            ))}
          </nav>
          <div className="admin-main-content">
        {(error || queryError) && <p className="admin-alert error" role="alert">{error || queryError}</p>}
        {activeView === 'dashboard' && (
          isLoading ? <section className="admin-loading">Memuat dashboard...</section> : metrics && (
            <section className="admin-dashboard-view">
              <div className="admin-metric-grid">
                {canViewJobs && <>
                  <article className="admin-metric-card"><span>Total posisi</span><strong>{metrics.positions_total}</strong></article>
                  <article className="admin-metric-card"><span>Lowongan draft</span><strong>{metrics.positions_draft}</strong></article>
                  <article className="admin-metric-card"><span>Lowongan aktif</span><strong>{metrics.positions_open}</strong></article>
                  <article className="admin-metric-card"><span>Lowongan ditutup</span><strong>{metrics.positions_closed}</strong></article>
                </>}
                {canViewApplications && <>
                  <article className="admin-metric-card"><span>Total lamaran</span><strong>{metrics.applications_total}</strong></article>
                  <article className="admin-metric-card"><span>Lamaran masuk</span><strong>{metrics.applications_submitted}</strong></article>
                </>}
              </div>
              {canViewApplications && <section className="admin-status-panel">
                <h2>Proses seleksi</h2>
                <div className="admin-status-grid">
                  {applicationStatusOptions.map((status) => (
                    <div className={`admin-status-item status-item-${status.value}`} key={status.value}>
                      <span>{status.label}</span>
                      <strong>{metrics[`applications_${status.value}`]}</strong>
                    </div>
                  ))}
                </div>
              </section>}
            </section>
          )
        )}
        {activeView === 'jobs' && (
          <section className="admin-table-panel">
            <div className="admin-table-heading">
              <div><h2>Kelola lowongan</h2><p>{jobs.length} posisi terdaftar</p></div>
              {canCreateJobs && <button className="apply-button" disabled={isLoading || isJobTypesLoading || !jobTypes.length} onClick={() => setIsCreatingJob(true)} type="button"><Plus size={17} /> Tambah lowongan</button>}
            </div>
            <AdminTableToolbar
              onPageChange={setJobsPage}
              filters={[
                {
                  label: 'Status',
                  value: jobStatusFilter,
                  onChange: setJobStatusFilter,
                  options: [
                    { value: 'draft', label: 'Draft' },
                    { value: 'open', label: 'Open' },
                    { value: 'closed', label: 'Closed' },
                  ],
                },
                {
                  label: 'Jenis pekerjaan',
                  value: jobTypeFilter,
                  onChange: setJobTypeFilter,
                  options: jobTypeOptions.map((type) => ({ value: type, label: type })),
                },
                {
                  label: 'Divisi',
                  value: jobDivisionFilter,
                  onChange: setJobDivisionFilter,
                  options: jobDivisionOptions.map((division) => ({ value: division, label: division })),
                },
              ]}
              onSearchChange={setJobSearch}
              search={jobSearch}
              searchPlaceholder="Cari kode, posisi, divisi, unit..."
              onDownloadPdf={() => downloadTablePdf(
                'lowongan',
                'Daftar Lowongan',
                ['Kode', 'Posisi', 'Divisi', 'Departemen', 'Unit', 'Lokasi', 'Kuota', 'Jenis pekerjaan', 'Status'],
                filteredJobs.map((job) => [
                  job.id,
                  job.title,
                  job.division,
                  job.department,
                  job.unit,
                  job.location,
                  job.quota,
                  job.type || job.job_type,
                  job.status,
                ]),
              )}
              downloadDisabled={!filteredJobs.length}
            />
            <div className="admin-table-scroll">
              <table className="admin-table">
                <thead><tr><th>KODE</th><th>POSISI</th><th>DIVISI / UNIT</th><th>KUOTA</th><th>STATUS</th><th>AKSI</th></tr></thead>
                <tbody>
                  {pageJobs.map((job) => {
                    return (
                      <tr key={job.id}>
                        <td className="position-code">{job.id}</td>
                        <td className="position-name">{job.title}</td>
                        <td>
                          {job.division}
                          <span className="admin-table-subtext">
                            {job.target_level === 'bureau'
                              ? `${job.department} / ${job.unit}`
                              : job.target_level === 'department'
                                ? job.department
                                : job.target_level === 'secretariat'
                                  ? job.unit
                                  : 'Seluruh divisi'}
                          </span>
                        </td>
                        <td>{job.quota}</td>
                        <td>
                          <div className="admin-job-status-control">
                            <span className={`status-pill ${job.status}`}>{job.status.toUpperCase()}</span>
                            {canChangeJobStatus && <button
                              aria-checked={job.status === 'open'}
                              aria-label={`${job.status === 'open' ? 'Tutup' : 'Buka'} lowongan ${job.id}`}
                              className={`admin-job-toggle${job.status === 'open' ? ' active' : ''}`}
                              disabled={jobStatusMutation.isPending}
                              onClick={() => void toggleJob(job)}
                              role="switch"
                              title={job.status === 'open' ? 'Tutup lowongan' : 'Buka lowongan'}
                              type="button"
                            >
                              <span aria-hidden="true" />
                            </button>}
                          </div>
                        </td>
                        <td className="admin-row-actions">
                          {canUpdateJobs && job.status !== 'open'
                            ? <button className="admin-small-button" onClick={() => setEditorJob(job)} type="button">Edit</button>
                            : canChangeJobStatus && job.status === 'open'
                              ? <span className="admin-table-subtext">Tutup untuk edit</span>
                              : '—'}
                        </td>
                      </tr>
                    )
                  })}
                  {!filteredJobs.length && <tr><td className="admin-table-empty" colSpan={6}>{jobs.length ? 'Tidak ada lowongan yang cocok.' : 'Belum ada lowongan.'}</td></tr>}
                </tbody>
              </table>
            </div>
            <AdminTablePagination onPageChange={setJobsPage} page={jobsPage} total={filteredJobs.length} />
            <p className="admin-table-note">Lowongan yang sudah memiliki lamaran hanya dapat ditutup agar riwayat lamaran tetap terjaga.</p>
          </section>
        )}
        {activeView === 'job-types' && (
          <JobTypeManager
            isLoading={isJobTypesLoading}
            jobTypes={jobTypes}
            loadError={jobTypesError}
            onRefresh={refresh}
            sessionToken={sessionToken}
          />
        )}
        {activeView === 'applications' && (
          <section className="admin-table-panel">
            <div className="admin-table-heading"><div><h2>Lamaran masuk</h2><p>{applications.length} lamaran</p></div></div>
            {!isLoading && (
              <AdminTableToolbar
                onPageChange={setApplicationsPage}
                filters={[
                  {
                    label: 'Status lamaran',
                    value: applicationStatusFilter,
                    onChange: setApplicationStatusFilter,
                    options: applicationStatusOptions.map((status) => ({ value: status.value, label: status.label })),
                  },
                  {
                    label: 'Lowongan',
                    value: applicationJobFilter,
                    onChange: setApplicationJobFilter,
                    options: applicationJobOptions,
                  },
                ]}
                onSearchChange={setApplicationSearch}
                search={applicationSearch}
                searchPlaceholder="Cari pelamar, email, NIP, posisi..."
                onDownloadPdf={() => downloadTablePdf(
                  'lamaran',
                  'Daftar Lamaran',
                  ['ID lamaran', 'Nama pelamar', 'Email', 'NIP', 'Divisi asal', 'Unit asal', 'Posisi', 'Kode posisi', 'Pendidikan', 'Bidang studi', 'Jumlah berkas', 'Status', 'Tanggal lamaran'],
                  filteredApplications.map((application) => [
                    application.id,
                    application.applicant_name,
                    application.applicant_email,
                    application.employee_number,
                    application.origin_division || application.current_unit,
                    application.origin_unit || application.current_position,
                    application.job_title,
                    application.job_id,
                    application.education_level,
                    application.study_field,
                    application.documents_count,
                    applicationStatusOptions.find((status) => status.value === application.status)?.label || application.status,
                    new Date(application.created_at).toLocaleString('id-ID'),
                  ]),
                )}
                downloadDisabled={!filteredApplications.length}
              />
            )}
            {isLoading ? <div className="admin-loading">Memuat lamaran...</div> : filteredApplications.length ? (
              <div className="admin-table-scroll">
                <table className="admin-table application-table">
                  <thead><tr><th>REG ID / WAKTU</th><th>NIP &amp; NAMA</th><th>UNIT ASAL</th><th>POSISI DILAMAR</th><th>PENDIDIKAN</th><th>FILE DOKUMEN</th><th>STATUS TAHAPAN</th><th>AKSI</th></tr></thead>
                  <tbody>
                    {pageApplications.map((application) => {
                      const createdAt = new Date(application.created_at)
                      const registrationId = `REG-${createdAt.getFullYear()}-${String(application.id).padStart(4, '0')}`
                      return (
                        <tr key={application.id}>
                          <td className="position-code">{registrationId}<span className="admin-table-subtext">{createdAt.toLocaleString('id-ID')}</span></td>
                          <td className="position-name">{application.applicant_name}<span className="admin-table-subtext">NIP: {application.employee_number || '—'} · {application.applicant_email}</span></td>
                          <td>{application.origin_division || application.current_unit || '—'}<span className="admin-table-subtext">{application.origin_unit || application.current_position || ''}</span></td>
                          <td className="position-name">{application.job_title}<span className="admin-table-subtext">{application.job_id}</span></td>
                          <td>{application.education_level || '—'}<span className="admin-table-subtext">{application.study_field || ''}</span></td>
                          <td>
                            {application.documents_count && canDownloadApplicationDocuments ? (
                              <button
                                aria-label={`Unduh CV atau berkas utama ${application.applicant_name}`}
                                className="admin-small-button admin-document-download"
                                disabled={downloadingApplicationId === application.id}
                                onClick={() => void downloadPrimaryApplicationDocument(application)}
                                type="button"
                              >
                                <Download size={14} />
                                {downloadingApplicationId === application.id ? 'Mengunduh...' : 'Unduh CV/berkas'}
                              </button>
                            ) : application.documents_count ? `${application.documents_count} berkas` : 'Belum ada'}
                          </td>
                          <td><span className={`status-pill status-${application.status}`}>{applicationStatusOptions.find((status) => status.value === application.status)?.label || application.status}</span></td>
                          <td><button className="admin-small-button" onClick={() => void openApplication(application.id)} type="button">Tinjau</button></td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            ) : <div className="admin-loading">{applications.length ? 'Tidak ada lamaran yang cocok.' : 'Belum ada lamaran masuk.'}</div>}
            {!isLoading && <AdminTablePagination onPageChange={setApplicationsPage} page={applicationsPage} total={filteredApplications.length} />}
          </section>
        )}
        {activeView === 'accounts' && <AccountManager key={sessionToken} organization={organization} session={session} />}
        {activeView === 'audit' && isSuperAdmin && <AdminAuditLog key={sessionToken} sessionToken={sessionToken} />}
        {activeView === 'employees' && (
          <EmployeeDirectoryManager
            adminRole={adminRole}
            canManage={canManageEmployees}
            organization={organization}
            organizationLoading={organizationQuery.isPending}
            sessionToken={sessionToken}
          />
        )}
        {['divisions', 'departments', 'bureaus'].includes(activeView) && (
          <OrganizationManager
            isLoading={isLoading}
            key={activeView}
            level={activeView}
            onRefresh={refresh}
            organization={organization}
            sessionToken={sessionToken}
          />
        )}
            </div>
            </div>
          </>
        )}
      </div>
      <SuccessPopup message={notice} onClose={setNotice} />
      {isCreatingJob && <JobEditor admin={session.admin} adminRole={adminRole} jobTypes={jobTypes} key="new" onClose={() => setIsCreatingJob(false)} onSave={saveJob} organization={organization} />}
      {editorJob && <JobEditor admin={session.admin} adminRole={adminRole} hasApplications={editorJob.has_applications ?? applications.some((application) => application.job_id === editorJob.id)} job={editorJob} jobTypes={jobTypes} key={editorJob.id} onClose={() => setEditorJob(null)} onSave={saveJob} organization={organization} />}
      {selectedApplication && (
        <ApplicationReview
          application={selectedApplication}
          canChangeStatus={canChangeApplicationStatus}
          canDownloadDocuments={canDownloadApplicationDocuments}
          isSaving={isSavingStatus}
          onClose={() => setSelectedApplication(null)}
          onSave={saveApplicationStatus}
          sessionToken={sessionToken}
        />
      )}
    </main>
  )
}
