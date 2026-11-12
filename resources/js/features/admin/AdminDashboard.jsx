import { useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Bell, Building2, Database, Download, FileText, Menu, Shield, Users, X } from 'lucide-react'
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
import { UnitWorkManager } from './OrganizationManagers'
import ApplicationLimitManager from './ApplicationLimitManager'
import { AccountManager } from './AccountManagers'
import { ApplicationReview } from './ApplicationReview'
import { AdminAuditLog } from './AdminAuditLog'
import { queryKeys } from '../../query/queryKeys'
import { usePathRoute } from '../../usePathRoute'

const ADMIN_VIEW_ROUTES = {
  dashboard: 'dashboard',
  applications: 'lamaran',
  accounts: 'manajemen-akun',
  units: 'unit-kerja',
  'application-limit': 'batas-lamaran',
  audit: 'audit-log',
}
const ADMIN_VIEW_PRESENTATION = {
  dashboard: { label: 'Dashboard', icon: Database },
  applications: { label: 'Lamaran Masuk', icon: FileText },
  accounts: { label: 'Manajemen Akun', icon: Users },
  units: { label: 'Unit Kerja', icon: Building2 },
  'application-limit': { label: 'Batas Lamaran', icon: Users },
  audit: { label: 'Riwayat Audit', icon: Shield },
}
const LEGACY_ADMIN_ROUTE_ALIASES = {
  'admin/divisi': 'units',
  'admin/departemen': 'units',
  'admin/biro': 'units',
}
const ADMIN_ROUTES = [
  ...Object.values(ADMIN_VIEW_ROUTES).map((view) => `admin/${view}`),
  ...Object.keys(LEGACY_ADMIN_ROUTE_ALIASES),
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
  const [route, navigate] = usePathRoute('admin/dashboard', ADMIN_ROUTES)
  const routeView = Object.entries(ADMIN_VIEW_ROUTES)
    .find(([, view]) => route === `admin/${view}`)?.[0]
    || LEGACY_ADMIN_ROUTE_ALIASES[route]
    || 'dashboard'
  const accountSection = route === 'admin/account/profile' ? 'profile' : route === 'admin/account/security' ? 'security' : null
  const [accountReturnView, setAccountReturnView] = useState(routeView)
  const activeView = accountSection ? accountReturnView : routeView
  const [isSavingStatus, setIsSavingStatus] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [applicationSearch, setApplicationSearch] = useState('')
  const [applicationStatusFilter, setApplicationStatusFilter] = useState('all')
  const [applicationTargetFilter, setApplicationTargetFilter] = useState('all')
  const [selectedApplication, setSelectedApplication] = useState(null)
  const [downloadingApplicationId, setDownloadingApplicationId] = useState(null)
  const [exportingApplicationId, setExportingApplicationId] = useState(null)
  const [logoutError, setLogoutError] = useState('')
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false)
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const isAuthenticated = Boolean(session)
  const adminRole = session.admin.admin_role || 'super_admin'
  const isSuperAdmin = adminRole === 'super_admin'
  const grantedPermissions = new Set(session.admin.permissions || [])
  const hasPermission = (permission) => isSuperAdmin || grantedPermissions.has(permission)
  const canViewApplications = hasPermission('applications.view')
  const canChangeApplicationStatus = hasPermission('applications.change_status')
  const canDownloadApplicationDocuments = hasPermission('applications.download_documents')
  const canManageApplicantAccounts = hasPermission('applicant_accounts.manage')
  const canViewOrganizationOptions = isSuperAdmin || canManageApplicantAccounts
  const adminRoleLabel = {
    super_admin: 'Super Admin',
    admin: 'Admin Operasional',
    division_head: 'Kepala Divisi (Kadiv)',
    department_head: 'Kepala Departemen (Kadep)',
  }[adminRole] || 'Administrator'
  const [avatarUrl, refreshAvatar] = useAccountAvatar(isAuthenticated)
  const adminSessionQuery = useQuery({
    queryKey: queryKeys.adminSession,
    queryFn: () => apiRequest('/admin/session'),
    enabled: isAuthenticated,
    refetchInterval: 30000,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
    retry: false,
  })
  const dashboardQuery = useQuery({
    queryKey: queryKeys.adminDashboard,
    queryFn: () => apiRequest('/admin/dashboard'),
    enabled: canViewApplications,
  })
  const applicationsQuery = useQuery({
    queryKey: queryKeys.adminApplications,
    queryFn: () => apiRequest('/admin/applications'),
    enabled: canViewApplications,
  })
  const organizationQuery = useQuery({
    queryKey: queryKeys.adminOrganization,
    queryFn: () => apiRequest('/admin/organization'),
    enabled: canViewOrganizationOptions,
  })
  const adminNotificationsQuery = useQuery({
    queryKey: queryKeys.adminNotifications,
    queryFn: () => apiRequest('/admin/notifications'),
    refetchInterval: 30000,
    enabled: canViewApplications,
  })
  const metrics = dashboardQuery.data
  const applications = applicationsQuery.data?.data ?? []
  const organization = organizationQuery.data ?? { divisions: [], departments: [], bureaus: [] }
  const adminNotifications = adminNotificationsQuery.data?.data ?? []
  const unreadNotificationCount = adminNotificationsQuery.data?.unread_count ?? 0
  const isLoading = activeView === 'dashboard'
    ? dashboardQuery.isPending
    : activeView === 'applications' && applicationsQuery.isPending
  const queryError = [
    adminSessionQuery,
    dashboardQuery,
    ...(canViewApplications ? [applicationsQuery, adminNotificationsQuery] : []),
    ...(canViewOrganizationOptions ? [organizationQuery] : []),
  ]
    .find((query) => query.error)?.error?.message ?? ''

  function refresh() {
    setError('')
    return queryClient.invalidateQueries({ queryKey: queryKeys.admin })
  }

  async function openApplication(applicationId) {
    setError('')
    try {
      const application = await apiRequest(`/admin/applications/${applicationId}`)
      setSelectedApplication(application)
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  async function downloadPrimaryApplicationDocument(application) {
    setError('')
    setDownloadingApplicationId(application.id)
    try {
      const details = await apiRequest(`/admin/applications/${application.id}`)
      const file = details.documents.find((document) => document.document_type === 'cv')
        || details.documents[0]
      if (!file) throw new Error('Lamaran ini belum memiliki CV atau berkas pendukung.')
      const blob = await apiDownload(
        `/admin/applications/${application.id}/documents/${file.id}`,
        {},
      )
      const safeName = file.file_name.replace(/[\\/:*?"<>|]/g, '_')
      saveDownload(blob, `lamaran-${application.id}-${safeName}`)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setDownloadingApplicationId(null)
    }
  }

  async function downloadApplicantData(application) {
    setError('')
    setExportingApplicationId(application.id)
    try {
      const details = await apiRequest(`/admin/applications/${application.id}`)
      const submittedAt = new Date(details.created_at)
      const rows = [
        ['ID lamaran', details.id],
        ['Nama pelamar', details.applicant_name],
        ['Email', details.applicant_email],
        ['Nomor telepon', details.phone_number],
        ['NIP', details.employee_number],
        ['Divisi asal', details.origin_division],
        ['Unit asal', details.origin_unit],
        ['Posisi saat ini', details.current_position],
        ['Unit saat ini', details.current_unit],
        ['Pendidikan terakhir', details.education_level],
        ['Bidang studi', details.study_field],
        ['Unit / lowongan tujuan', details.target_label || details.job_title],
        ['Jenis lamaran', details.job_id ? 'Lowongan' : 'Lamar langsung'],
        ['Status', applicationStatusOptions.find((status) => status.value === details.status)?.label || details.status],
        ['Tanggal lamaran', Number.isNaN(submittedAt.getTime()) ? details.created_at : submittedAt.toLocaleString('id-ID')],
        ['Deskripsi posisi', details.position_description],
        ['Motivasi dan rencana kontribusi', details.motivation],
        ['Dokumen', details.documents.map((document) => document.file_name).join('\n')],
      ].map(([label, value]) => [label, value || '—'])
      const safeName = details.applicant_name.toLocaleLowerCase('id').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
      await downloadTablePdf(
        `data-pelamar-${safeName || details.id}`,
        `Data Pelamar · ${details.applicant_name}`,
        ['Informasi', 'Data'],
        rows,
      )
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setExportingApplicationId(null)
    }
  }

  async function openAdminNotification(notification) {
    setError('')
    try {
      if (!notification.read_at) {
        await apiRequest(`/admin/notifications/${notification.id}/read`, {
          method: 'PATCH',
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

  const applicationTargetOptions = [...new Map(applications.map((application) => [
    application.target_key || (application.job_id ? `job:${application.job_id}` : `direct:${application.id}`),
    {
      value: application.target_key || (application.job_id ? `job:${application.job_id}` : `direct:${application.id}`),
      label: application.target_label || application.job_title,
    },
  ])).values()].sort((left, right) => left.label.localeCompare(right.label, 'id'))
  const filteredApplications = applications.filter((application) => {
    const query = applicationSearch.trim().toLocaleLowerCase('id')
    const matchesSearch = `${application.applicant_name} ${application.applicant_email} ${application.employee_number || ''} ${application.job_title} ${application.target_label || ''} ${application.job_id || ''} ${application.created_at}`
      .toLocaleLowerCase('id')
      .includes(query)
    const matchesStatus = applicationStatusFilter === 'all' || application.status === applicationStatusFilter
    const targetKey = application.target_key || (application.job_id ? `job:${application.job_id}` : `direct:${application.id}`)
    const matchesTarget = applicationTargetFilter === 'all' || targetKey === applicationTargetFilter
    return matchesSearch && matchesStatus && matchesTarget
  })
  const { items: pageApplications, page: applicationsPage, setPage: setApplicationsPage } = useAdminPagination(filteredApplications)

  const availableViews = useMemo(() => {
    const access = {
      dashboard: canViewApplications,
      applications: canViewApplications,
      accounts: canManageApplicantAccounts || isSuperAdmin,
      units: isSuperAdmin,
      'application-limit': isSuperAdmin,
      audit: isSuperAdmin,
    }
    return Object.keys(ADMIN_VIEW_ROUTES).filter((view) => access[view])
  }, [canManageApplicantAccounts, canViewApplications, isSuperAdmin])
  const views = availableViews.map((id) => {
    const { label, icon: Icon } = ADMIN_VIEW_PRESENTATION[id]
    return { id, label, icon: <Icon size={17} /> }
  })
  useEffect(() => {
    if (availableViews.length && !availableViews.includes(activeView) && !accountSection) {
      navigate(`admin/${ADMIN_VIEW_ROUTES[availableViews[0]] || 'dashboard'}`)
    }
  }, [activeView, accountSection, availableViews, navigate])

  function navigateView(view) {
    setAccountReturnView(view)
    setIsMobileMenuOpen(false)
    navigate(`admin/${ADMIN_VIEW_ROUTES[view]}`)
  }

  function navigateAccountSection(section) {
    if (section) setAccountReturnView(activeView)
    navigate(section ? `admin/account/${section}` : `admin/${ADMIN_VIEW_ROUTES[activeView]}`)
  }

  const activeViewDescription = {
    dashboard: 'Pantau lamaran langsung dan tindak lanjuti proses seleksi pada unit kerja Anda.',
    applications: 'Tinjau lamaran langsung, unduh dokumen, dan perbarui tahapan seleksi.',
    accounts: 'Kelola akun pelamar dan akses portal.',
    units: 'Kelola hierarki Divisi, Departemen, dan Biro/Bengkel beserta deskripsinya.',
    'application-limit': 'Atur jumlah maksimal lamaran yang dapat dikirim setiap pelamar.',
    audit: 'Tinjau perubahan akun, izin akses, dan data master.',
  }[activeView]
  const activeViewLabel = views.find((view) => view.id === activeView)?.label || 'Dashboard Lamar Langsung'

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
                    <div><strong>Lamaran baru</strong><span>Lamaran langsung untuk unit dalam lingkup Anda · {unreadNotificationCount} belum dibaca</span></div>
                    <button aria-label="Tutup notifikasi" className="admin-notification-close" onClick={() => setIsNotificationsOpen(false)} type="button"><X size={17} /></button>
                  </div>
                  <PushNotificationControl />
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
                          <span>{notification.job_id ? `${notification.target_label || notification.job_title} · Riwayat lowongan lama` : notification.target_label || notification.job_title}</span>
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
      <div className={accountSection ? 'admin-content admin-account-content' : 'admin-content'}>
        {logoutError && <p className="admin-alert error" role="alert">{logoutError}</p>}
        {accountSection ? (
          <AccountSettingsPage
            avatarUrl={avatarUrl}
            onAvatarChanged={refreshAvatar}
            onBack={() => navigateAccountSection(null)}
            onProfileUpdated={onProfileUpdated}
            onSectionChange={navigateAccountSection}
            section={accountSection}
            session={{ role: session.role, user: session.admin }}
          />
        ) : (
          <>
            <div className="admin-page-heading">
              <div>
                <span className="admin-heading-kicker">PANEL ADMINISTRATOR · {adminRoleLabel.toLocaleUpperCase('id')}</span>
                <h1>{activeView === 'dashboard' ? 'Dashboard Lamar Langsung' : activeViewLabel}</h1>
                <p>{activeViewDescription}</p>
              </div>
              <span aria-hidden="true" className="admin-heading-mark"><Shield size={30} /></span>
            </div>
            <div className="admin-workspace">
              <nav aria-label="Navigasi dashboard admin" className={`admin-tabs${isMobileMenuOpen ? ' is-open' : ''}`}>
                <button
                  aria-controls="admin-navigation-menu-items"
                  aria-expanded={isMobileMenuOpen}
                  aria-label={isMobileMenuOpen ? 'Tutup navigasi admin' : 'Buka navigasi admin'}
                  className="admin-mobile-nav-toggle"
                  onClick={() => setIsMobileMenuOpen((open) => !open)}
                  type="button"
                >
                  {isMobileMenuOpen ? <X aria-hidden="true" size={19} /> : <Menu aria-hidden="true" size={19} />}
                  <span>Menu admin</span>
                </button>
                <div className="admin-tab-list" id="admin-navigation-menu-items">
                  {views.map((view) => (
                    <button aria-current={activeView === view.id ? 'page' : undefined} className={activeView === view.id ? 'admin-tab active' : 'admin-tab'} key={view.id} onClick={() => navigateView(view.id)} type="button">
                      {view.icon} {view.label}
                    </button>
                  ))}
                </div>
              </nav>
              <div className="admin-main-content">
        {!availableViews.length ? (
          <section aria-live="polite" className="admin-loading">
            Akun ini belum memiliki izin untuk fitur admin yang aktif. Hubungi Super Admin untuk memperbarui akses.
          </section>
        ) : <>
        {(error || queryError) && <p className="admin-alert error" role="alert">{error || queryError}</p>}
        {activeView === 'dashboard' && (
          isLoading ? <section className="admin-loading">Memuat dashboard...</section> : metrics && (
            <section className="admin-dashboard-view">
              <div className="admin-dashboard-summary">
                {canViewApplications && (
                  <>
                    <section aria-label="Total lamaran langsung" className="admin-summary-card admin-summary-total">
                      <span>Total lamaran langsung</span>
                      <strong>{metrics.applications_total}</strong>
                      <small>Semua tahap seleksi</small>
                    </section>
                    {applicationStatusOptions.map((status) => (
                      <button
                        aria-label={`Lihat ${metrics[`applications_${status.value}`]} lamaran dengan status ${status.label}`}
                        className={`admin-summary-card admin-summary-status status-${status.value}`}
                        key={status.value}
                        onClick={() => {
                          setApplicationStatusFilter(status.value)
                          navigateView('applications')
                        }}
                        type="button"
                      >
                        <span>{status.label}</span>
                        <strong>{metrics[`applications_${status.value}`]}</strong>
                        <small>Lihat lamaran</small>
                      </button>
                    ))}
                  </>
                )}
              </div>
            </section>
          )
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
                    label: 'Unit tujuan',
                    value: applicationTargetFilter,
                    onChange: setApplicationTargetFilter,
                    options: applicationTargetOptions,
                  },
                ]}
                onSearchChange={setApplicationSearch}
                search={applicationSearch}
                searchPlaceholder="Cari pelamar, email, NIP, posisi..."
                onDownloadPdf={() => downloadTablePdf(
                  'lamaran',
                  'Daftar Lamaran',
                  ['ID lamaran', 'Nama pelamar', 'Email', 'NIP', 'Divisi asal', 'Unit asal', 'Unit tujuan', 'Pendidikan', 'Bidang studi', 'Jumlah berkas', 'Status', 'Tanggal lamaran'],
                  filteredApplications.map((application) => [
                    application.id,
                    application.applicant_name,
                    application.applicant_email,
                    application.employee_number,
                    application.origin_division || application.current_unit,
                    application.origin_unit || application.current_position,
                    application.target_label || application.job_title,
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
                  <thead><tr><th>REG ID / WAKTU</th><th>NIP &amp; NAMA</th><th>UNIT ASAL</th><th>UNIT DITUJU</th><th>PENDIDIKAN</th><th>FILE DOKUMEN</th><th>STATUS TAHAPAN</th><th>AKSI</th></tr></thead>
                  <tbody>
                    {pageApplications.map((application) => {
                      const createdAt = new Date(application.created_at)
                      const registrationId = `REG-${createdAt.getFullYear()}-${String(application.id).padStart(4, '0')}`
                      return (
                        <tr key={application.id}>
                          <td className="position-code">{registrationId}<span className="admin-table-subtext">{createdAt.toLocaleString('id-ID')}</span></td>
                          <td className="position-name">{application.applicant_name}<span className="admin-table-subtext">NIP: {application.employee_number || '—'} · {application.applicant_email}</span></td>
                          <td>{application.origin_division || application.current_unit || '—'}<span className="admin-table-subtext">{application.origin_unit || application.current_position || ''}</span></td>
                          <td className="position-name">{application.target_label || application.job_title}<span className="admin-table-subtext">{application.job_id ? 'Riwayat lowongan lama' : 'Lamar langsung'}</span></td>
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
                          <td>
                            <div className="application-row-actions">
                              <button
                                aria-label={`Unduh data pelamar ${application.applicant_name}`}
                                className="admin-small-button"
                                disabled={exportingApplicationId === application.id}
                                onClick={() => void downloadApplicantData(application)}
                                type="button"
                              >
                                <Download size={14} />
                                {exportingApplicationId === application.id ? 'Menyiapkan...' : 'Unduh data'}
                              </button>
                              <button className="admin-small-button" onClick={() => void openApplication(application.id)} type="button">Tinjau</button>
                            </div>
                          </td>
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
        {activeView === 'accounts' && <AccountManager organization={organization} session={session} />}
        {activeView === 'audit' && isSuperAdmin && <AdminAuditLog />}
        {activeView === 'units' && (
          <UnitWorkManager
            isLoading={organizationQuery.isPending}
            onRefresh={refresh}
            organization={organization}
          />
        )}
        {activeView === 'application-limit' && isSuperAdmin && (
          <ApplicationLimitManager />
        )}
        </>}
              </div>
            </div>
          </>
        )}
      </div>
      <SuccessPopup message={notice} onClose={setNotice} />
      {selectedApplication && (
        <ApplicationReview
          application={selectedApplication}
          canChangeStatus={canChangeApplicationStatus}
          canDownloadDocuments={canDownloadApplicationDocuments}
          isSaving={isSavingStatus}
          onClose={() => setSelectedApplication(null)}
          onSave={saveApplicationStatus}
        />
      )}
    </main>
  )
}
