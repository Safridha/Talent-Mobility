import { useEffect, useState } from 'react'
import { Plus, Shield, Users } from 'lucide-react'
import { apiRequest } from '../../api'
import { AdminTableToolbar, ConfirmDialog, AdminFormDialog } from './AdminPrimitives'
import { downloadTablePdf } from './downloadPdf'
import SuccessPopup from '../../components/SuccessPopup'

const adminRoles = [
  { value: 'admin', label: 'Admin Operasional' },
  { value: 'division_head', label: 'Kepala Divisi (Kadiv)' },
  { value: 'department_head', label: 'Kepala Departemen (Kadep)' },
]

const adminPermissionGroups = [
  {
    title: 'Lowongan',
    permissions: [
      ['jobs.view', 'Lihat lowongan'],
      ['jobs.create', 'Buat lowongan'],
      ['jobs.update', 'Edit lowongan'],
      ['jobs.delete', 'Hapus lowongan'],
      ['jobs.change_status', 'Buka / tutup lowongan'],
    ],
  },
  {
    title: 'Lamaran',
    permissions: [
      ['applications.view', 'Lihat data pelamar'],
      ['applications.change_status', 'Ubah tahapan seleksi'],
      ['applications.download_documents', 'Unduh dokumen pelamar'],
    ],
  },
  {
    title: 'Pengaturan',
    permissions: [
      ['job_types.manage', 'Kelola jenis pekerjaan'],
      ['applicant_accounts.manage', 'Kelola akun pelamar'],
    ],
  },
  {
    title: 'Karyawan',
    permissions: [
      ['employees.view', 'Lihat direktori karyawan'],
      ['employees.manage', 'Tambah, edit, dan nonaktifkan karyawan'],
    ],
  },
]

const defaultAdminPermissions = {
  admin: adminPermissionGroups.flatMap((group) => group.permissions.map(([permission]) => permission)),
  division_head: adminPermissionGroups.slice(0, 2).flatMap((group) => group.permissions.map(([permission]) => permission)),
  department_head: adminPermissionGroups.slice(0, 2).flatMap((group) => group.permissions.map(([permission]) => permission)),
  super_admin: [],
}
const optionalScopedPermissions = new Set(['employees.view', 'employees.manage'])

function permissionsForRole(role) {
  return (defaultAdminPermissions[role] || []).filter((permission) => !optionalScopedPermissions.has(permission))
}

function emptyAccountForm() {
  return {
    name: '',
    email: '',
    password: '',
    passwordConfirmation: '',
    admin_role: '',
    division_id: '',
    department_id: '',
    bureau_id: '',
    permissions: [],
  }
}

export function AccountListManager({ accountType, sessionToken, currentAdminId, organization }) {
  const isAdminAccount = accountType === 'admin'
  const accountsPath = isAdminAccount ? '/admin/admin-accounts' : '/admin/accounts'
  const accountKind = isAdminAccount ? 'admin' : 'pelamar'
  const minimumPasswordLength = 8
  const [accounts, setAccounts] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')
  const [loadError, setLoadError] = useState('')
  const [notice, setNotice] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [editingId, setEditingId] = useState(null)
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const [form, setForm] = useState(emptyAccountForm)
  const [pendingDelete, setPendingDelete] = useState(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [updatingStatusId, setUpdatingStatusId] = useState(null)
  const divisions = organization?.divisions ?? []
  const departments = organization?.departments ?? []

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
    setForm(emptyAccountForm())
    setEditingId(null)
    setIsCreateModalOpen(false)
  }

  async function submitAccount(event) {
    event.preventDefault()
    setError('')
    setNotice('')
    if (form.password && form.password !== form.passwordConfirmation) {
      setError('Konfirmasi kata sandi tidak sama.')
      return
    }
    if (isAdminAccount && form.admin_role !== 'super_admin' && form.permissions.length === 0) {
      setError('Pilih minimal satu hak akses untuk akun admin ini.')
      return
    }
    setIsSaving(true)
    const body = { name: form.name.trim(), email: form.email.trim() }
    if (form.password) body.password = form.password
    if (isAdminAccount) {
      body.admin_role = form.admin_role
      body.division_id = form.admin_role === 'division_head' ? Number(form.division_id) : null
      body.department_id = form.admin_role === 'department_head' ? Number(form.department_id) : null
      body.bureau_id = null
      body.permissions = form.permissions
    }
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
    setIsCreateModalOpen(false)
    setEditingId(account.id)
    setForm({
      ...emptyAccountForm(),
      name: account.name,
      email: account.email,
      admin_role: account.admin_role || 'division_head',
      division_id: account.division_id ? String(account.division_id) : '',
      department_id: account.department_id ? String(account.department_id) : '',
      bureau_id: account.bureau_id ? String(account.bureau_id) : '',
      permissions: account.permissions || permissionsForRole(account.admin_role || 'division_head'),
    })
    setError('')
    setNotice('')
  }

  function openCreateForm() {
    resetForm()
    setError('')
    setNotice('')
    setIsCreateModalOpen(true)
  }

  function togglePermission(permission, checked) {
    setForm((current) => {
      const permissions = new Set(current.permissions)
      if (checked) {
        permissions.add(permission)
        if (permission.startsWith('jobs.') && permission !== 'jobs.view') permissions.add('jobs.view')
        if (permission.startsWith('applications.') && permission !== 'applications.view') permissions.add('applications.view')
        if (permission === 'employees.manage') permissions.add('employees.view')
      } else {
        permissions.delete(permission)
        if (permission === 'jobs.view') {
          for (const key of ['jobs.create', 'jobs.update', 'jobs.delete', 'jobs.change_status']) permissions.delete(key)
        }
        if (permission === 'applications.view') {
          for (const key of ['applications.change_status', 'applications.download_documents']) permissions.delete(key)
        }
        if (permission === 'employees.view') permissions.delete('employees.manage')
      }
      return { ...current, permissions: [...permissions] }
    })
  }

  async function setAccountActive(account, isActive) {
    if (!isActive) {
      setError('')
      setPendingDelete(account)
      return
    }
    setError('')
    setNotice('')
    setUpdatingStatusId(account.id)
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
    } finally {
      setUpdatingStatusId(null)
    }
  }

  async function deleteAccount() {
    if (!pendingDelete) return
    setError('')
    setIsDeleting(true)
    try {
      await apiRequest(`${accountsPath}/${pendingDelete.id}`, { method: 'DELETE', token: sessionToken })
      setPendingDelete(null)
      setNotice(`Akun ${accountKind} berhasil dinonaktifkan. Riwayat dan dokumen tetap tersimpan.`)
      refreshAccounts()
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setIsDeleting(false)
    }
  }

  const filteredAccounts = accounts.filter((account) => (
    `${account.name} ${account.email} ${account.admin_role || ''} ${account.scope_label || ''}`.toLocaleLowerCase('id').includes(search.trim().toLocaleLowerCase('id'))
    && (statusFilter === 'all' || (account.is_active ? 'active' : 'inactive') === statusFilter)
  ))
  const activeCount = accounts.filter((account) => account.is_active).length
  const activeSuperAdminCount = accounts.filter((account) => account.is_active && account.admin_role === 'super_admin').length
  const accountForm = (
    <form className="organization-form account-manager-form" onSubmit={submitAccount}>
      <p className="organization-help account-form-help">
        <em>*</em> Wajib diisi. Saat edit, kata sandi boleh dikosongkan jika tidak ingin menggantinya.
      </p>
      <label><span>Nama lengkap <em>*</em></span>
        <input autoComplete="name" maxLength={200} onChange={(event) => setForm({ ...form, name: event.target.value })} required value={form.name} />
      </label>
      <label><span>Email <em>*</em></span>
        <input autoComplete="email" maxLength={254} onChange={(event) => setForm({ ...form, email: event.target.value })} required type="email" value={form.email} />
      </label>
      <label><span>Kata sandi {editingId ? '(opsional untuk reset)' : 'awal'} {!editingId && <em>*</em>}</span>
        <input
          autoComplete="new-password"
          maxLength={128}
          minLength={editingId && !form.password ? undefined : minimumPasswordLength}
          onChange={(event) => setForm({ ...form, password: event.target.value })}
          placeholder={editingId ? 'Kosongkan jika tidak diubah' : 'Min. 8 karakter: huruf besar/kecil, angka, simbol'}
          required={!editingId}
          type="password"
          value={form.password}
        />
      </label>
      <label><span>Konfirmasi kata sandi {!editingId && <em>*</em>}</span>
        <input
          autoComplete="new-password"
          maxLength={128}
          minLength={editingId && !form.password ? undefined : minimumPasswordLength}
          onChange={(event) => setForm({ ...form, passwordConfirmation: event.target.value })}
          placeholder={editingId && !form.password ? 'Isi jika kata sandi diubah' : 'Ulangi kata sandi'}
          required={!editingId || Boolean(form.password)}
          type="password"
          value={form.passwordConfirmation}
        />
      </label>
      {isAdminAccount && (
        <>
          {editingId && form.admin_role === 'super_admin' ? (
            <label><span>Peran admin</span>
              <input aria-readonly="true" readOnly value="Super Admin" />
            </label>
          ) : (
            <label><span>Peran admin <em>*</em></span>
              <select
                onChange={(event) => setForm((current) => ({
                  ...current,
                  admin_role: event.target.value,
                  division_id: '',
                  department_id: '',
                  bureau_id: '',
                  permissions: permissionsForRole(event.target.value),
                }))}
                required
                value={form.admin_role}
              >
                <option value="">Pilih peran admin</option>
                {adminRoles.map((role) => <option key={role.value} value={role.value}>{role.label}</option>)}
              </select>
            </label>
          )}
          {form.admin_role === 'division_head' && (
            <label><span>Divisi yang dikelola <em>*</em></span>
              <select onChange={(event) => setForm({ ...form, division_id: event.target.value })} required value={form.division_id}>
                <option value="">Pilih divisi</option>
                {divisions.map((division) => <option key={division.id} value={division.id}>{division.name}</option>)}
              </select>
            </label>
          )}
          {form.admin_role === 'department_head' && (
            <label><span>Departemen yang dikelola <em>*</em></span>
              <select onChange={(event) => setForm({ ...form, department_id: event.target.value })} required value={form.department_id}>
                <option value="">Pilih departemen</option>
                {departments.map((department) => {
                  const division = divisions.find((item) => item.id === department.division_id)
                  return <option key={department.id} value={department.id}>{division ? `${division.name} / ` : ''}{department.name}</option>
                })}
              </select>
            </label>
          )}
          {form.admin_role && form.admin_role !== 'super_admin' && (
            <fieldset className="account-permissions">
              <legend>Hak akses akun <em>*</em> pilih minimal satu</legend>
              <p className="organization-help">
                Izin di bawah hanya berlaku pada lingkup organisasi akun ini. Kepala divisi tetap terbatas pada divisinya; kepala departemen pada departemen dan biro/bengkelnya.
              </p>
              <div className="account-permission-groups">
                {adminPermissionGroups.map((group) => {
                  const availablePermissions = group.permissions.filter(([permission]) => (
                    form.admin_role === 'admin'
                    || !['job_types.manage', 'applicant_accounts.manage'].includes(permission)
                  ))
                  return availablePermissions.length ? (
                    <section className="account-permission-group" key={group.title}>
                      <h4>{group.title}</h4>
                      {availablePermissions.map(([permission, label]) => (
                        <label className="account-permission-option" key={permission}>
                          <input
                            checked={form.permissions.includes(permission)}
                            onChange={(event) => togglePermission(permission, event.target.checked)}
                            type="checkbox"
                          />
                          <span>{label}</span>
                        </label>
                      ))}
                    </section>
                  ) : null
                })}
              </div>
            </fieldset>
          )}
          {form.admin_role === 'admin' && (
            <p className="organization-help account-form-help">Admin Operasional dapat melihat dan memproses seluruh lamaran serta mengelola lowongan, tetapi tidak dapat mengelola akun admin atau struktur organisasi.</p>
          )}
          {form.admin_role === 'super_admin' && (
            <p className="organization-help account-form-help">Super Admin adalah akun sistem dan tidak dapat dibuat atau diubah perannya dari Kelola Akun.</p>
          )}
          {form.admin_role === 'division_head' && (
            <p className="organization-help account-form-help">Kepala Divisi dapat melihat dan memproses lamaran untuk semua lowongan di divisi ini, termasuk departemen dan biro di bawahnya.</p>
          )}
          {form.admin_role === 'department_head' && (
            <p className="organization-help account-form-help">Kepala Departemen dapat melihat dan memproses lamaran untuk departemen ini serta biro/bengkel di bawahnya. Biro tidak memiliki akun login tersendiri.</p>
          )}
        </>
      )}
      <p className="organization-help account-form-help">
        {editingId
          ? 'Menyimpan perubahan akan mengakhiri semua sesi aktif akun.'
          : `Gunakan minimal ${minimumPasswordLength} karakter, dengan huruf besar, huruf kecil, angka, dan simbol. Sampaikan melalui jalur privat. Akun baru langsung Aktif setelah disimpan.`}
      </p>
      {error && <p className="admin-alert error" role="alert">{error}</p>}
      <div className="organization-form-actions">
        {editingId && <button className="detail-button" onClick={resetForm} type="button">Batal edit</button>}
        {!editingId && isCreateModalOpen && <button className="detail-button" onClick={resetForm} type="button">Batal</button>}
        <button className="apply-button" disabled={isSaving} type="submit">
          {isSaving ? 'Menyimpan...' : editingId ? 'Simpan perubahan' : <><Plus size={16} /> Tambah akun</>}
        </button>
      </div>
    </form>
  )

  return (
    <section className="account-manager">
      <div className="admin-table-heading">
        <div><h2>Monitoring akun {accountKind}</h2><p>{accounts.length} akun terdaftar · {activeCount} aktif</p></div>
        <button className="apply-button" onClick={openCreateForm} type="button"><Plus size={16} /> Tambah akun {accountKind}</button>
      </div>
      {editingId && (
        <AdminFormDialog className="admin-account-editor-modal" onClose={resetForm} title={`Edit akun ${accountKind}`}>
          {accountForm}
        </AdminFormDialog>
      )}
      <AdminTableToolbar
        filters={[{
          label: 'Status akun',
          value: statusFilter,
          onChange: setStatusFilter,
          options: [{ value: 'active', label: 'Aktif' }, { value: 'inactive', label: 'Nonaktif' }],
        }]}
        onSearchChange={setSearch}
        resultCount={filteredAccounts.length}
        search={search}
        searchPlaceholder="Cari nama atau email..."
        totalCount={accounts.length}
        onDownloadPdf={() => downloadTablePdf(
          isAdminAccount ? 'akun-admin' : 'akun-pelamar',
          isAdminAccount ? 'Daftar Akun Admin' : 'Daftar Akun Pelamar',
          isAdminAccount
            ? ['Nama', 'Email', 'Peran', 'Lingkup organisasi', 'Izin aktif', 'Terdaftar', 'Status']
            : ['Nama', 'Email', 'Jumlah lamaran', 'Terdaftar', 'Status'],
          filteredAccounts.map((account) => isAdminAccount
            ? [
                account.name,
                account.email,
                adminRoles.find((role) => role.value === account.admin_role)?.label || account.admin_role,
                account.scope_label,
                (account.permissions || []).length,
                new Date(account.created_at).toLocaleDateString('id-ID'),
                account.is_active ? 'Aktif' : 'Nonaktif',
              ]
            : [
                account.name,
                account.email,
                account.applications_count,
                new Date(account.created_at).toLocaleDateString('id-ID'),
                account.is_active ? 'Aktif' : 'Nonaktif',
              ]),
        )}
        downloadDisabled={isLoading || Boolean(loadError) || !filteredAccounts.length}
      />
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
            <thead><tr><th>AKUN</th>{isAdminAccount && <th>PERAN / LINGKUP</th>}{!isAdminAccount && <th>LAMARAN</th>}<th>TERDAFTAR</th><th>STATUS</th><th>AKSI</th></tr></thead>
            <tbody>
              {filteredAccounts.map((account) => {
                const isCurrentAdmin = isAdminAccount && account.id === currentAdminId
                const isLastActiveAdmin = isAdminAccount && account.is_active && account.admin_role === 'super_admin' && activeSuperAdminCount <= 1
                return (
                <tr key={account.id}>
                  <td className="position-name">{account.name}<span className="admin-table-subtext">{account.email}</span></td>
                  {isAdminAccount && <td>
                    {adminRoles.find((role) => role.value === account.admin_role)?.label || account.admin_role}
                    <span className="admin-table-subtext">{account.scope_label}</span>
                    <span className="admin-table-subtext">{account.admin_role === 'super_admin' ? 'Hak akses penuh' : `${(account.permissions || []).length} izin aktif`}</span>
                  </td>}
                  {!isAdminAccount && <td>{account.applications_count}</td>}
                  <td>{new Date(account.created_at).toLocaleDateString('id-ID')}</td>
                  <td>
                    <div className="account-status-control">
                      <span className={account.is_active ? 'account-status active' : 'account-status inactive'}>{account.is_active ? 'Aktif' : 'Nonaktif'}</span>
                      <button
                        aria-checked={account.is_active}
                        aria-label={`${account.is_active ? 'Nonaktifkan' : 'Aktifkan'} akun ${account.email}`}
                        className={`admin-job-toggle account-status-toggle${account.is_active ? ' active' : ''}`}
                        disabled={updatingStatusId === account.id || isCurrentAdmin || isLastActiveAdmin}
                        onClick={() => void setAccountActive(account, !account.is_active)}
                        role="switch"
                        title={isCurrentAdmin ? 'Akun yang sedang digunakan tidak dapat dinonaktifkan' : isLastActiveAdmin ? 'Super Admin aktif terakhir tidak dapat dinonaktifkan' : undefined}
                        type="button"
                      >
                        <span aria-hidden="true" />
                      </button>
                    </div>
                  </td>
                  <td className="admin-row-actions">
                    {isCurrentAdmin
                      ? <span className="admin-table-subtext">Akun admin Anda</span>
                      : <button className="admin-small-button" onClick={() => editAccount(account)} type="button">Edit</button>}
                  </td>
                </tr>
                )
              })}
            </tbody>
          </table>
        ) : (
          <div className="admin-loading">{accounts.length ? 'Tidak ada akun yang cocok.' : `Belum ada akun ${accountKind}.`}</div>
        )}
      </div>
      <p className="admin-table-note">
        {isAdminAccount
          ? 'Admin yang sedang digunakan tidak dapat diubah atau dinonaktifkan. Super Admin aktif terakhir tidak dapat dinonaktifkan atau diturunkan perannya. Perubahan akun mengakhiri sesi aktifnya.'
          : 'Akun yang dinonaktifkan tidak dapat masuk, tetapi data lamaran dan dokumen tetap dipertahankan. Reset kata sandi akan mengakhiri sesi aktif pelamar.'}
      </p>
      <SuccessPopup message={notice} onClose={setNotice} />
      {isCreateModalOpen && (
        <AdminFormDialog onClose={resetForm} title={`Tambah akun ${accountKind}`}>
          {accountForm}
        </AdminFormDialog>
      )}
      {pendingDelete && (
        <ConfirmDialog
          error={error}
          isBusy={isDeleting}
          message={`Akun ${pendingDelete.email} akan dinonaktifkan. Riwayat lamaran dan dokumen tetap tersimpan.`}
          onCancel={() => { setPendingDelete(null); setError('') }}
          onConfirm={() => void deleteAccount()}
          title={`Nonaktifkan akun ${accountKind}?`}
        />
      )}
    </section>
  )
}

export function AccountManager({ session, organization }) {
  const canManageAdminAccounts = session.admin.admin_role === 'super_admin'
  const [accountType, setAccountType] = useState(canManageAdminAccounts ? 'admin' : 'applicant')
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
        {canManageAdminAccounts && (
          <button
            aria-pressed={accountType === 'admin'}
            className={accountType === 'admin' ? 'account-type-tab active' : 'account-type-tab'}
            onClick={() => setAccountType('admin')}
            type="button"
          >
            <Shield size={17} /> Akun Admin
          </button>
        )}
      </nav>
      {canManageAdminAccounts && accountType === 'admin' && (
          <p className="admin-table-note">Buat akun kepala divisi atau kepala departemen di sini, lalu tetapkan email dan kata sandi awal. Kepala divisi mencakup semua unit di divisinya; kepala departemen mencakup biro/bengkel dalam departemennya.</p>
      )}
      <AccountListManager
        accountType={accountType}
        currentAdminId={session.admin.id}
        key={accountType}
        organization={organization}
        sessionToken={session.token}
      />
    </section>
  )
}
