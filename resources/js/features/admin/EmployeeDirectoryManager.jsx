import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { apiRequest } from '../../api'
import { queryKeys } from '../../query/queryKeys'
import SuccessPopup from '../../components/SuccessPopup'
import { AdminFormDialog, AdminTableToolbar } from './AdminPrimitives'
import { downloadTablePdf } from './downloadPdf'

const EMPTY_EMPLOYEES = []

function emptyEmployee() {
  return {
    employee_number: '',
    name: '',
    position_title: '',
    target_level: 'bureau',
    division_id: '',
    department_id: '',
    bureau_id: '',
  }
}

function employeeUnitLabel(employee) {
  if (employee.target_level === 'secretariat') return `${employee.division_name} / ${employee.unit_name}`
  if (employee.target_level === 'department') return `${employee.division_name} / ${employee.department_name}`
  if (employee.target_level === 'bureau') {
    return `${employee.division_name} / ${employee.department_name} / ${employee.unit_name}`
  }
  return employee.division_name
}

export function EmployeeDirectoryManager({
  canManage,
  adminRole,
  organization,
  organizationLoading,
  sessionToken,
}) {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [form, setForm] = useState(emptyEmployee)
  const [editingEmployee, setEditingEmployee] = useState(null)
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [formError, setFormError] = useState('')
  const [notice, setNotice] = useState('')
  const [statusError, setStatusError] = useState('')

  const employeesQuery = useQuery({
    queryKey: queryKeys.adminEmployees,
    queryFn: async () => (await apiRequest('/admin/employees', { token: sessionToken })).data,
  })
  const employees = employeesQuery.data ?? EMPTY_EMPLOYEES
  const visibleEmployees = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('id')
    return employees.filter((employee) => (
      `${employee.employee_number} ${employee.name} ${employee.position_title} ${employeeUnitLabel(employee)}`
        .toLocaleLowerCase('id')
        .includes(query)
    ))
  }, [employees, search])

  const saveMutation = useMutation({
    mutationFn: ({ id, body }) => apiRequest(
      id ? `/admin/employees/${id}` : '/admin/employees',
      {
        method: id ? 'PUT' : 'POST',
        token: sessionToken,
        body: JSON.stringify(body),
      },
    ),
    onSuccess: (_, { id }) => {
      setIsFormOpen(false)
      setEditingEmployee(null)
      setNotice(id ? 'Data karyawan berhasil diperbarui.' : 'Data karyawan berhasil ditambahkan.')
      void queryClient.invalidateQueries({ queryKey: queryKeys.adminEmployees })
    },
  })
  const statusMutation = useMutation({
    mutationFn: ({ id, is_active }) => apiRequest(`/admin/employees/${id}/status`, {
      method: 'PATCH',
      token: sessionToken,
      body: JSON.stringify({ is_active }),
    }),
    onSuccess: () => {
      setStatusError('')
      setNotice('Status karyawan berhasil diperbarui.')
      void queryClient.invalidateQueries({ queryKey: queryKeys.adminEmployees })
    },
    onError: (error) => setStatusError(error.message),
  })

  function openCreateForm() {
    setForm(emptyEmployee())
    setEditingEmployee(null)
    setFormError('')
    setIsFormOpen(true)
  }

  function openEditForm(employee) {
    setForm({
      employee_number: employee.employee_number,
      name: employee.name,
      position_title: employee.position_title,
      target_level: employee.target_level,
      division_id: String(employee.division_id),
      department_id: employee.department_id ? String(employee.department_id) : '',
      bureau_id: employee.bureau_id ? String(employee.bureau_id) : '',
    })
    setEditingEmployee(employee)
    setFormError('')
    setIsFormOpen(true)
  }

  async function submitForm(event) {
    event.preventDefault()
    setFormError('')
    const body = {
      employee_number: form.employee_number.trim(),
      name: form.name.trim(),
      position_title: form.position_title.trim(),
      target_level: form.target_level,
      division_id: Number(form.division_id),
      department_id: ['department', 'bureau'].includes(form.target_level) ? Number(form.department_id) : null,
      bureau_id: form.target_level === 'bureau' ? Number(form.bureau_id) : null,
    }
    try {
      await saveMutation.mutateAsync({ id: editingEmployee?.id, body })
    } catch (error) {
      setFormError(error.message)
    }
  }

  const departments = organization.departments.filter(
    (department) => String(department.division_id) === form.division_id,
  )
  const bureaus = organization.bureaus.filter(
    (bureau) => String(bureau.department_id) === form.department_id,
  )
  const secretariats = organization.divisions.filter((division) => division.secretariat_name)
  const canManageDivisionEmployees = adminRole !== 'department_head'

  return (
    <section className="admin-organization-view">
      <div className="admin-table-heading">
        <div>
          <h2>Direktori karyawan</h2>
          <p>{employees.length} karyawan dalam lingkup akses Anda</p>
        </div>
        {canManage && (
          <button className="apply-button" onClick={openCreateForm} type="button">
            <Plus size={16} /> Tambah karyawan
          </button>
        )}
      </div>
      {statusError && <p className="admin-alert error" role="alert">{statusError}</p>}
      <AdminTableToolbar
        onSearchChange={setSearch}
        resultCount={visibleEmployees.length}
        search={search}
        searchPlaceholder="Cari NIP, nama, jabatan, atau unit..."
        totalCount={employees.length}
        onDownloadPdf={() => downloadTablePdf(
          'direktori-karyawan',
          'Direktori Karyawan',
          ['NIP', 'Nama', 'Jabatan', 'Unit kerja', 'Status'],
          visibleEmployees.map((employee) => [
            employee.employee_number,
            employee.name,
            employee.position_title,
            employeeUnitLabel(employee),
            employee.is_active ? 'Aktif' : 'Nonaktif',
          ]),
        )}
        downloadDisabled={!visibleEmployees.length}
      />
      {employeesQuery.isPending || organizationLoading ? (
        <div className="admin-loading">Memuat direktori karyawan...</div>
      ) : employeesQuery.error ? (
        <div className="admin-loading account-load-error" role="alert">
          <p>{employeesQuery.error.message}</p>
          <button className="admin-small-button" onClick={() => void employeesQuery.refetch()} type="button">Coba lagi</button>
        </div>
      ) : visibleEmployees.length ? (
        <div className="admin-table-scroll">
          <table className="admin-table organization-table">
            <thead>
              <tr><th>NIP</th><th>NAMA</th><th>JABATAN</th><th>UNIT KERJA</th><th>STATUS</th>{canManage && <th>AKSI</th>}</tr>
            </thead>
            <tbody>
              {visibleEmployees.map((employee) => (
                <tr key={employee.id}>
                  <td className="position-code">{employee.employee_number}</td>
                  <td className="position-name">{employee.name}</td>
                  <td>{employee.position_title}</td>
                  <td>{employeeUnitLabel(employee)}</td>
                  <td><span className={`status-pill ${employee.is_active ? 'open' : 'closed'}`}>{employee.is_active ? 'AKTIF' : 'NONAKTIF'}</span></td>
                  {canManage && (
                    <td className="admin-row-actions">
                      <button className="admin-small-button" onClick={() => openEditForm(employee)} type="button">Edit</button>
                      <button
                        className="admin-small-button"
                        disabled={statusMutation.isPending}
                        onClick={() => statusMutation.mutate({ id: employee.id, is_active: !employee.is_active })}
                        type="button"
                      >
                        {employee.is_active ? 'Nonaktifkan' : 'Aktifkan'}
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="admin-loading">{employees.length ? 'Tidak ada karyawan yang cocok.' : 'Belum ada data karyawan.'}</div>
      )}
      {isFormOpen && (
        <AdminFormDialog
          className="admin-compact-editor-modal"
          onClose={() => setIsFormOpen(false)}
          title={editingEmployee ? 'Edit data karyawan' : 'Tambah karyawan'}
        >
          <form className="organization-form admin-popup-form" onSubmit={submitForm}>
            <p className="organization-help admin-form-wide"><em>*</em> Semua kolom wajib diisi. Akun login karyawan tidak dibuat.</p>
            <label>
              <span>NIP <em>*</em></span>
              <input maxLength={40} onChange={(event) => setForm((current) => ({ ...current, employee_number: event.target.value }))} required value={form.employee_number} />
            </label>
            <label>
              <span>Nama lengkap <em>*</em></span>
              <input maxLength={160} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} required value={form.name} />
            </label>
            <label>
              <span>Jabatan <em>*</em></span>
              <input maxLength={160} onChange={(event) => setForm((current) => ({ ...current, position_title: event.target.value }))} required value={form.position_title} />
            </label>
            <label>
              <span>Tingkat unit <em>*</em></span>
              <select
                onChange={(event) => setForm((current) => ({
                  ...current,
                  target_level: event.target.value,
                  department_id: '',
                  bureau_id: '',
                }))}
                required
                value={form.target_level}
              >
                {canManageDivisionEmployees && <option value="division">Divisi</option>}
                {canManageDivisionEmployees && secretariats.length > 0 && <option value="secretariat">Sekretariat Divisi</option>}
                <option value="department">Departemen</option>
                <option value="bureau">Biro / Bengkel</option>
              </select>
            </label>
            <label>
              <span>Divisi <em>*</em></span>
              <select
                onChange={(event) => setForm((current) => ({ ...current, division_id: event.target.value, department_id: '', bureau_id: '' }))}
                required
                value={form.division_id}
              >
                <option value="">Pilih divisi</option>
                {(form.target_level === 'secretariat' ? secretariats : organization.divisions).map((division) => (
                  <option key={division.id} value={division.id}>
                    {form.target_level === 'secretariat' ? division.secretariat_name : division.name}
                  </option>
                ))}
              </select>
            </label>
            {['department', 'bureau'].includes(form.target_level) && (
              <label>
                <span>Departemen <em>*</em></span>
                <select
                  onChange={(event) => setForm((current) => ({ ...current, department_id: event.target.value, bureau_id: '' }))}
                  required
                  value={form.department_id}
                >
                  <option value="">Pilih departemen</option>
                  {departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}
                </select>
              </label>
            )}
            {form.target_level === 'bureau' && (
              <label>
                <span>Biro / Bengkel <em>*</em></span>
                <select onChange={(event) => setForm((current) => ({ ...current, bureau_id: event.target.value }))} required value={form.bureau_id}>
                  <option value="">Pilih unit</option>
                  {bureaus.map((bureau) => (
                    <option key={bureau.id} value={bureau.id}>
                      {bureau.unit_type === 'bengkel' ? 'Bengkel' : 'Biro'} — {bureau.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {formError && <p className="admin-alert error admin-form-wide" role="alert">{formError}</p>}
            <div className="organization-form-actions admin-form-wide">
              <button className="detail-button" onClick={() => setIsFormOpen(false)} type="button">Batal</button>
              <button className="apply-button" disabled={saveMutation.isPending || organizationLoading} type="submit">
                {saveMutation.isPending ? 'Menyimpan...' : editingEmployee ? 'Simpan perubahan' : 'Tambah karyawan'}
              </button>
            </div>
          </form>
        </AdminFormDialog>
      )}
      <SuccessPopup message={notice} onClose={setNotice} />
    </section>
  )
}
