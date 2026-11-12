import { useEffect, useState } from 'react'
import { Database, Eye, EyeOff, FileSpreadsheet, KeyRound, Plus, Shield, Users } from 'lucide-react'
import { apiRequest } from '../../api'
import PasswordRequirements from '../../components/PasswordRequirements'
import { meetsPasswordRequirements } from '../../components/passwordValidation'
import SearchableSelect from '../../components/SearchableSelect'
import { AdminTableToolbar, ConfirmDialog, AdminFormDialog } from './AdminPrimitives'
import { AdminTablePagination } from './AdminPagination'
import { useAdminPagination } from './useAdminPagination'
import { downloadTablePdf } from './downloadPdf'
import SuccessPopup from '../../components/SuccessPopup'
import ApplicantImportDialog from './ApplicantImportDialog'
import EmployeeMasterManager from './EmployeeMasterManager'
import { EDUCATION_OPTIONS } from '../account/employeeOptions'


const adminRoles = [
  { value: 'admin', label: 'Admin Operasional' },
  { value: 'division_head', label: 'Kepala Divisi (Kadiv)' },
  { value: 'department_head', label: 'Kepala Departemen (Kadep)' },
]

const adminPermissionGroups = [
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
      ['applicant_accounts.manage', 'Kelola akun pelamar'],
    ],
  },
]

const APPLICATION_PERMISSIONS = [
  'applications.view',
  'applications.change_status',
  'applications.download_documents',
]
const ADMIN_PERMISSIONS = [...APPLICATION_PERMISSIONS, 'applicant_accounts.manage']
const ACTIVE_ADMIN_PERMISSION_KEYS = new Set(ADMIN_PERMISSIONS)
const defaultAdminPermissions = {
  admin: ADMIN_PERMISSIONS,
  division_head: APPLICATION_PERMISSIONS,
  department_head: APPLICATION_PERMISSIONS,
  super_admin: [],
}

function permissionsForRole(role) {
  return defaultAdminPermissions[role] || []
}

function emptyAccountForm() {
  return {
    name: '',
    employee_number: '',
    division_id: '',
    department_id: '',
    position_title: '',
    last_education: '',
    email: '',
    reset_password: false,
    password: '',
    passwordConfirmation: '',
    admin_role: '',
    bureau_id: '',
    permissions: [],
  }
}

export function AccountListManager({ accountType, currentAdminId, organization }) {
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
  const [showPassword, setShowPassword] = useState(false)
  const [showPasswordConfirmation, setShowPasswordConfirmation] = useState(false)
  const [pendingDelete, setPendingDelete] = useState(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [updatingStatusId, setUpdatingStatusId] = useState(null)
  const [pendingReset, setPendingReset] = useState(null)
  const [isResetting, setIsResetting] = useState(false)
  const divisions = organization?.divisions ?? []
  const departments = organization?.departments ?? []
  const [employeeMaster, setEmployeeMaster] = useState({ divisions: [], departments: [] })
  const [isImportOpen, setIsImportOpen] = useState(false)

  function loadEmployeeMaster() {
    if (isAdminAccount) return
    apiRequest('/admin/employee-master')
      .then((response) => setEmployeeMaster(response))
      .catch(() => {})
  }

  useEffect(loadEmployeeMaster, [isAdminAccount])

  useEffect(() => {
    let active = true
    apiRequest(accountsPath)
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
  }, [accountKind, accountsPath, refreshKey])

  function refreshAccounts() {
    setLoadError('')
    setIsLoading(true)
    setRefreshKey((current) => current + 1)
  }

  function resetForm() {
    setForm(emptyAccountForm())
    setShowPassword(false)
    setShowPasswordConfirmation(false)
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
    if (form.password && !meetsPasswordRequirements(form.password)) {
      setError('Kata sandi belum memenuhi semua persyaratan.')
      return
    }
    if (isAdminAccount && form.admin_role !== 'super_admin' && form.permissions.length === 0) {
      setError('Akun admin harus memiliki setidaknya satu hak akses.')
      return
    }
    setIsSaving(true)
    const body = { name: form.name.trim(), email: form.email.trim() }
    if (!isAdminAccount) body.reset_password = form.reset_password
    if (form.password) body.password = form.password
    body.employee_number = form.employee_number.trim()
    if (!isAdminAccount) {
      body.division_id = form.division_id ? Number(form.division_id) : null
      body.department_id = form.department_id ? Number(form.department_id) : null
      body.position_title = form.position_title.trim()
      body.last_education = form.last_education
    }
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
        body: JSON.stringify(body),
      })
      setNotice(editingId
        ? !isAdminAccount && form.reset_password
          ? 'Kata sandi pelamar direset ke pal@123. Pelamar wajib menggantinya saat masuk berikutnya.'
          : `Perubahan akun ${accountKind} berhasil disimpan. Sesi aktifnya telah diakhiri.`
        : !isAdminAccount
          ? 'Akun pelamar dibuat. Pelamar masuk dengan NIP dan kata sandi awal pal@123, lalu wajib menggantinya saat masuk pertama.'
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
    setShowPassword(false)
    setShowPasswordConfirmation(false)
    const role = account.admin_role || 'division_head'
    const allowedPermissions = permissionsForRole(role)
    setForm({
      ...emptyAccountForm(),
      name: account.name,
      employee_number: account.employee_number || '',
      position_title: account.position_title || '',
      last_education: account.last_education || '',
      email: account.email || '',
      admin_role: role,
      division_id: account.division_id ? String(account.division_id) : '',
      department_id: account.department_id ? String(account.department_id) : '',
      bureau_id: account.bureau_id ? String(account.bureau_id) : '',
      permissions: account.permissions || allowedPermissions,
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
        if (permission.startsWith('applications.') && permission !== 'applications.view') permissions.add('applications.view')
      } else {
        permissions.delete(permission)
        if (permission === 'applications.view') {
          for (const key of ['applications.change_status', 'applications.download_documents']) permissions.delete(key)
        }
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

  async function resetPassword() {
    if (!pendingReset) return
    setError('')
    setIsResetting(true)
    try {
      const response = await apiRequest(`${accountsPath}/${pendingReset.id}/reset-password`, { method: 'POST' })
      setPendingReset(null)
      setNotice(response.message)
      refreshAccounts()
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setIsResetting(false)
    }
  }

  async function deleteAccount() {
    if (!pendingDelete) return
    setError('')
    setIsDeleting(true)
    try {
      await apiRequest(`${accountsPath}/${pendingDelete.id}`, { method: 'DELETE' })
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
    `${account.name} ${account.email} ${account.admin_role || ''} ${account.scope_label || ''} ${account.employee_number || ''} ${account.division_name || ''} ${account.department_name || ''} ${account.position_title || ''}`.toLocaleLowerCase('id').includes(search.trim().toLocaleLowerCase('id'))
    && (statusFilter === 'all' || (account.is_active ? 'active' : 'inactive') === statusFilter)
  ))
  const { items: pageAccounts, page, setPage } = useAdminPagination(filteredAccounts)
  const activeCount = accounts.filter((account) => account.is_active).length
  const activeSuperAdminCount = accounts.filter((account) => account.is_active && account.admin_role === 'super_admin').length
  const accountForm = (
    <form className="organization-form account-manager-form" onSubmit={submitAccount}>
      <p className="organization-help account-form-help">
        {!isAdminAccount && !editingId
          ? <>Akun dibuat dengan kata sandi awal <strong>pal@123</strong>. Pelamar masuk memakai NIP dan wajib menggantinya saat masuk pertama. Email tidak wajib.</>
          : isAdminAccount
            ? <><em>*</em> Wajib diisi. Saat edit, kata sandi boleh dikosongkan jika tidak ingin menggantinya.</>
            : <><em>*</em> Wajib diisi. Pelamar masuk memakai NIP.</>}
      </p>
      <label><span>Nama lengkap <em>*</em></span>
        <input autoComplete="name" maxLength={200} onChange={(event) => setForm({ ...form, name: event.target.value })} required value={form.name} />
      </label>
      {isAdminAccount && (
        <label><span>NIP (untuk login)</span>
          <input inputMode="numeric" maxLength={40} onChange={(event) => setForm({ ...form, employee_number: event.target.value })} value={form.employee_number} />
        </label>
      )}
      {!isAdminAccount && (
        <>
          <label><span>NIP <em>*</em></span>
            <input inputMode="numeric" maxLength={40} onChange={(event) => setForm({ ...form, employee_number: event.target.value })} required value={form.employee_number} />
          </label>
          <label><span>Divisi</span>
            <SearchableSelect
              onChange={(value) => setForm((current) => ({ ...current, division_id: value, department_id: '' }))}
              options={[{ value: '', label: 'Tanpa divisi' }, ...employeeMaster.divisions.map((item) => ({ value: String(item.id), label: item.name }))]}
              placeholder="Pilih divisi"
              value={form.division_id}
            />
          </label>
          {form.division_id && (
            <label><span>Departemen (Unit Kerja)</span>
              <SearchableSelect
                onChange={(value) => setForm((current) => ({ ...current, department_id: value }))}
                options={[
                  { value: '', label: 'Tanpa departemen' },
                  ...employeeMaster.departments
                    .filter((item) => String(item.division_id) === String(form.division_id))
                    .map((item) => ({ value: String(item.id), label: item.name })),
                ]}
                placeholder="Pilih departemen"
                value={form.department_id}
              />
            </label>
          )}
          <label><span>Jabatan</span>
            <input maxLength={200} onChange={(event) => setForm({ ...form, position_title: event.target.value })} value={form.position_title} />
          </label>
          <label><span>Pendidikan terakhir</span>
            <SearchableSelect
              onChange={(value) => setForm((current) => ({ ...current, last_education: value }))}
              options={[
                { value: '', label: 'Belum diisi' },
                ...[...new Set([...EDUCATION_OPTIONS, form.last_education].filter(Boolean))].map((item) => ({ value: item, label: item })),
              ]}
              placeholder="Pilih pendidikan"
              value={form.last_education}
            />
          </label>
        </>
      )}
      <label><span>Email {isAdminAccount ? <em>*</em> : '(opsional)'}</span>
        <input autoComplete="email" maxLength={254} onChange={(event) => setForm({ ...form, email: event.target.value })} required={isAdminAccount} type="email" value={form.email} />
      </label>
      {isAdminAccount ? (
        <>
      <label><span>Kata sandi {editingId ? '(opsional untuk reset)' : 'awal'} {!editingId && <em>*</em>}</span>
        <div className="password-field account-password-field">
          <input
            autoComplete="new-password"
            maxLength={128}
            minLength={editingId && !form.password ? undefined : minimumPasswordLength}
            onChange={(event) => setForm({ ...form, password: event.target.value })}
            placeholder={editingId ? 'Kosongkan jika tidak diubah' : 'Min. 8 karakter, huruf besar/kecil, dan angka'}
            required={!editingId}
            type={showPassword ? 'text' : 'password'}
            value={form.password}
          />
          <button
            aria-label={showPassword ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'}
            aria-pressed={showPassword}
            onClick={() => setShowPassword((shown) => !shown)}
            type="button"
          >
            {showPassword ? <EyeOff aria-hidden="true" size={17} /> : <Eye aria-hidden="true" size={17} />}
          </button>
        </div>
      </label>
      <label><span>Konfirmasi kata sandi {!editingId && <em>*</em>}</span>
        <div className="password-field account-password-field">
          <input
            autoComplete="new-password"
            maxLength={128}
            minLength={editingId && !form.password ? undefined : minimumPasswordLength}
            onChange={(event) => setForm({ ...form, passwordConfirmation: event.target.value })}
            placeholder={editingId && !form.password ? 'Isi jika kata sandi diubah' : 'Ulangi kata sandi'}
            required={!editingId || Boolean(form.password)}
            type={showPasswordConfirmation ? 'text' : 'password'}
            value={form.passwordConfirmation}
          />
          <button
            aria-label={showPasswordConfirmation ? 'Sembunyikan konfirmasi kata sandi' : 'Tampilkan konfirmasi kata sandi'}
            aria-pressed={showPasswordConfirmation}
            onClick={() => setShowPasswordConfirmation((shown) => !shown)}
            type="button"
          >
            {showPasswordConfirmation
              ? <EyeOff aria-hidden="true" size={17} />
              : <Eye aria-hidden="true" size={17} />}
          </button>
        </div>
      </label>
      {(!editingId || form.password) && (
        <PasswordRequirements confirmation={form.passwordConfirmation} password={form.password} />
      )}
        </>
      ) : editingId ? (
        <label className="account-permission-option">
          <input checked={form.reset_password} onChange={(event) => setForm({ ...form, reset_password: event.target.checked })} type="checkbox" />
          <span>Reset kata sandi ke default (pal@123). Pelamar wajib menggantinya saat masuk berikutnya.</span>
        </label>
      ) : null}
      {isAdminAccount && (
        <>
          {editingId && form.admin_role === 'super_admin' ? (
            <label><span>Peran admin</span>
              <input aria-readonly="true" readOnly value="Super Admin" />
            </label>
          ) : (
            <label><span>Peran admin <em>*</em></span>
              <SearchableSelect
                onChange={(adminRole) => setForm((current) => ({
                  ...current,
                  admin_role: adminRole,
                  division_id: '',
                  department_id: '',
                  bureau_id: '',
                  permissions: permissionsForRole(adminRole),
                }))}
                options={adminRoles}
                placeholder="Pilih peran admin"
                required
                value={form.admin_role}
              />
            </label>
          )}
          {form.admin_role === 'division_head' && (
            <label><span>Divisi yang dikelola <em>*</em></span>
              <SearchableSelect
                onChange={(value) => setForm((current) => ({ ...current, division_id: value }))}
                options={divisions.map((division) => ({ value: String(division.id), label: division.name }))}
                placeholder="Pilih divisi"
                required
                value={form.division_id}
              />
            </label>
          )}
          {form.admin_role === 'department_head' && (
            <label><span>Departemen yang dikelola <em>*</em></span>
              <SearchableSelect
                onChange={(value) => setForm((current) => ({ ...current, department_id: value }))}
                options={departments.map((department) => {
                  const division = divisions.find((item) => item.id === department.division_id)
                  return {
                    value: String(department.id),
                    label: `${division ? `${division.name} / ` : ''}${department.name}`,
                  }
                })}
                placeholder="Pilih departemen"
                required
                value={form.department_id}
              />
            </label>
          )}
          {form.admin_role && form.admin_role !== 'super_admin' && (
            <fieldset className="account-permissions">
              <legend>Hak akses akun <em>*</em></legend>
              <p className="organization-help">
                Izin di bawah hanya berlaku pada lingkup organisasi akun ini. Kepala divisi tetap terbatas pada divisinya; kepala departemen pada departemen dan biro/bengkelnya.
              </p>
              <div className="account-permission-groups">
                {adminPermissionGroups.map((group) => {
                  const availablePermissions = group.permissions.filter(([permission]) => (
                    form.admin_role === 'admin'
                    || permission !== 'applicant_accounts.manage'
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
          : isAdminAccount
            ? `Gunakan minimal ${minimumPasswordLength} karakter, dengan huruf besar, huruf kecil, dan angka. Sampaikan melalui jalur privat. Akun baru langsung Aktif setelah disimpan.`
            : 'Akun baru langsung Aktif setelah disimpan.'}
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
        <div className="account-heading-actions">
          {!isAdminAccount && (
            <>
              <button className="detail-button" onClick={() => setIsImportOpen(true)} type="button"><FileSpreadsheet size={16} /> Import Excel</button>
            </>
          )}
          <button className="apply-button" onClick={openCreateForm} type="button"><Plus size={16} /> Tambah akun {accountKind}</button>
        </div>
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
        onPageChange={setPage}
        onSearchChange={setSearch}
        search={search}
        searchPlaceholder={isAdminAccount ? 'Cari nama atau email...' : 'Cari nama, NIP, divisi, atau jabatan...'}
        onDownloadPdf={() => downloadTablePdf(
          isAdminAccount ? 'akun-admin' : 'akun-pelamar',
          isAdminAccount ? 'Daftar Akun Admin' : 'Daftar Akun Pelamar',
          isAdminAccount
            ? ['Nama', 'Email', 'Peran', 'Lingkup organisasi', 'Izin aktif', 'Terdaftar', 'Status']
            : ['NIP', 'Nama', 'Divisi', 'Departemen', 'Jabatan', 'Pendidikan', 'Email', 'Lamaran', 'Status'],
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
                account.employee_number || '-',
                account.name,
                account.division_name || '-',
                account.department_name || '-',
                account.position_title || '-',
                account.last_education || '-',
                account.email || '-',
                account.applications_count,
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
            <thead><tr><th>AKUN</th>{isAdminAccount && <th>PERAN / LINGKUP</th>}{!isAdminAccount && <><th>DATA KARYAWAN</th><th>LAMARAN</th><th>KATA SANDI</th></>}<th>TERDAFTAR</th><th>STATUS</th><th>AKSI</th></tr></thead>
            <tbody>
              {pageAccounts.map((account) => {
                const isCurrentAdmin = isAdminAccount && account.id === currentAdminId
                const isLastActiveAdmin = isAdminAccount && account.is_active && account.admin_role === 'super_admin' && activeSuperAdminCount <= 1
                return (
                <tr key={account.id}>
                  <td className="position-name">{account.name}<span className="admin-table-subtext">{isAdminAccount && account.employee_number ? `NIP ${account.employee_number} · ` : ''}{account.email || 'Tanpa email'}</span></td>
                  {isAdminAccount && <td>
                    {adminRoles.find((role) => role.value === account.admin_role)?.label || account.admin_role}
                    <span className="admin-table-subtext">{account.scope_label}</span>
                    <span className="admin-table-subtext">{account.admin_role === 'super_admin' ? 'Hak akses penuh' : `${(account.permissions || []).filter((permission) => ACTIVE_ADMIN_PERMISSION_KEYS.has(permission)).length} izin aktif`}</span>
                  </td>}
                  {!isAdminAccount && <td>
                    {account.employee_number ? <>NIP {account.employee_number}</> : <span className="admin-table-subtext">NIP belum diisi</span>}
                    <span className="admin-table-subtext">{[account.division_name, account.department_name].filter(Boolean).join(' / ') || 'Divisi/departemen belum diisi'}</span>
                    <span className="admin-table-subtext">{[account.position_title, account.last_education].filter(Boolean).join(' · ') || 'Jabatan belum diisi'}</span>
                  </td>}
                  {!isAdminAccount && <td>{account.applications_count}</td>}
                  {!isAdminAccount && <td>{account.must_change_password ? 'Wajib diganti saat masuk' : 'Sudah diganti'}</td>}
                  <td>{new Date(account.created_at).toLocaleDateString('id-ID')}</td>
                  <td>
                    <div className="account-status-control">
                      <span className={account.is_active ? 'account-status active' : 'account-status inactive'}>{account.is_active ? 'Aktif' : 'Nonaktif'}</span>
                      <button
                        aria-checked={account.is_active}
                        aria-label={`${account.is_active ? 'Nonaktifkan' : 'Aktifkan'} akun ${account.email || account.employee_number || account.name}`}
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
                      : <>
                        <button className="admin-small-button" onClick={() => editAccount(account)} type="button">Edit</button>
                        {!isAdminAccount && (
                          <button
                            aria-label={`Reset kata sandi ${account.name} ke default`}
                            className="admin-small-button admin-icon-button"
                            onClick={() => { setError(''); setPendingReset(account) }}
                            title="Reset kata sandi ke default (pal@123)"
                            type="button"
                          >
                            <KeyRound aria-hidden="true" size={15} />
                          </button>
                        )}
                      </>}
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
      {!isLoading && !loadError && (
        <AdminTablePagination onPageChange={setPage} page={page} total={filteredAccounts.length} />
      )}
      <p className="admin-table-note">
        {isAdminAccount
          ? 'Admin yang sedang digunakan tidak dapat diubah atau dinonaktifkan. Super Admin aktif terakhir tidak dapat dinonaktifkan atau diturunkan perannya. Perubahan akun mengakhiri sesi aktifnya.'
          : 'Akun yang dinonaktifkan tidak dapat masuk, tetapi data lamaran dan dokumen tetap dipertahankan. Reset kata sandi akan mengakhiri sesi aktif pelamar.'}
      </p>
      <SuccessPopup message={notice} onClose={setNotice} />
      {isImportOpen && (
        <ApplicantImportDialog
          onClose={() => setIsImportOpen(false)}
          onImported={() => { refreshAccounts(); loadEmployeeMaster() }}
        />
      )}
      {isCreateModalOpen && (
        <AdminFormDialog onClose={resetForm} title={`Tambah akun ${accountKind}`}>
          {accountForm}
        </AdminFormDialog>
      )}
      {pendingReset && (
        <ConfirmDialog
          busyLabel="Mereset..."
          confirmLabel="Reset kata sandi"
          error={error}
          icon={KeyRound}
          isBusy={isResetting}
          message={`Kata sandi ${pendingReset.name}${pendingReset.employee_number ? ` (NIP ${pendingReset.employee_number})` : ''} akan direset ke default pal@123. Sesi aktifnya diakhiri dan pelamar wajib menggantinya saat masuk berikutnya.`}
          onCancel={() => { setPendingReset(null); setError('') }}
          onConfirm={() => void resetPassword()}
          title="Reset kata sandi ke default?"
          tone="primary"
        />
      )}
      {pendingDelete && (
        <ConfirmDialog
          error={error}
          isBusy={isDeleting}
          message={`Akun ${pendingDelete.email || pendingDelete.employee_number || pendingDelete.name} akan dinonaktifkan. Riwayat lamaran dan dokumen tetap tersimpan.`}
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
          aria-pressed={accountType === 'master'}
          className={accountType === 'master' ? 'account-type-tab active' : 'account-type-tab'}
          onClick={() => setAccountType('master')}
          type="button"
        >
          <Database size={17} /> Master Data
        </button>
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
      {accountType === 'master' ? (
        <EmployeeMasterManager />
      ) : (
        <AccountListManager
          accountType={accountType}
          currentAdminId={session.admin.id}
          key={accountType}
          organization={organization}
        />
      )}
    </section>
  )
}
