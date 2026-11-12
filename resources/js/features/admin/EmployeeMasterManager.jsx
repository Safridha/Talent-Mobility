import { useEffect, useMemo, useState } from 'react'
import { Building2, Layers, Plus, Wrench } from 'lucide-react'
import { apiRequest } from '../../api'
import SearchableSelect from '../../components/SearchableSelect'
import SuccessPopup from '../../components/SuccessPopup'
import { AdminFormDialog, AdminTableToolbar, ConfirmDialog } from './AdminPrimitives'
import { AdminTablePagination } from './AdminPagination'
import { useAdminPagination } from './useAdminPagination'

const BASE = '/admin/employee-master'

const KINDS = {
  division: { path: 'divisions', singular: 'divisi', title: 'Divisi' },
  department: { path: 'departments', singular: 'departemen', title: 'Departemen' },
  bureau: { path: 'bureaus', singular: 'biro / bengkel', title: 'Biro / Bengkel' },
}

function includesText(value, query) {
  return value.toLocaleLowerCase('id').includes(query)
}

export default function EmployeeMasterManager() {
  const [master, setMaster] = useState({ divisions: [], departments: [], bureaus: [] })
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [notice, setNotice] = useState('')
  const [kind, setKind] = useState('division')
  const [search, setSearch] = useState('')
  const [divisionFilter, setDivisionFilter] = useState('all')
  const [departmentFilter, setDepartmentFilter] = useState('all')
  const [form, setForm] = useState(null) // { kind, id | null, name, division_id, department_id }
  const [formError, setFormError] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [pendingDelete, setPendingDelete] = useState(null) // { kind, item }
  const [deleteError, setDeleteError] = useState('')
  const [isDeleting, setIsDeleting] = useState(false)

  async function load() {
    try {
      const response = await apiRequest(BASE)
      setMaster({ bureaus: [], ...response })
      setLoadError('')
    } catch (requestError) {
      setLoadError(requestError.message)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  const divisionById = useMemo(() => new Map(master.divisions.map((item) => [item.id, item])), [master.divisions])
  const departmentById = useMemo(() => new Map(master.departments.map((item) => [item.id, item])), [master.departments])
  const departmentCounts = useMemo(() => {
    const counts = new Map()
    for (const department of master.departments) {
      counts.set(department.division_id, (counts.get(department.division_id) || 0) + 1)
    }
    return counts
  }, [master.departments])
  const bureauCounts = useMemo(() => {
    const counts = new Map()
    for (const bureau of master.bureaus) {
      counts.set(bureau.department_id, (counts.get(bureau.department_id) || 0) + 1)
    }
    return counts
  }, [master.bureaus])

  const query = search.trim().toLocaleLowerCase('id')
  const divisionNameOf = (department) => divisionById.get(department?.division_id)?.name || ''
  let rows
  if (kind === 'division') {
    rows = master.divisions.filter((division) => !query || includesText(division.name, query))
  } else if (kind === 'department') {
    rows = master.departments.filter((department) => (
      (divisionFilter === 'all' || String(department.division_id) === divisionFilter)
      && (!query || includesText(department.name, query) || includesText(divisionNameOf(department), query))
    ))
  } else {
    rows = master.bureaus.filter((bureau) => {
      const department = departmentById.get(bureau.department_id)
      return (divisionFilter === 'all' || String(department?.division_id) === divisionFilter)
        && (departmentFilter === 'all' || String(bureau.department_id) === departmentFilter)
        && (!query || includesText(bureau.name, query) || includesText(department?.name || '', query))
    })
  }
  const { items: pageRows, page, setPage } = useAdminPagination(rows)

  function switchKind(nextKind) {
    setKind(nextKind)
    setSearch('')
    setDivisionFilter('all')
    setDepartmentFilter('all')
    setPage(1)
  }

  function openCreate() {
    setFormError('')
    setForm({
      kind,
      id: null,
      name: '',
      division_id: divisionFilter !== 'all' ? divisionFilter : '',
      department_id: kind === 'bureau' && departmentFilter !== 'all' ? departmentFilter : '',
    })
  }

  function openEdit(item) {
    setFormError('')
    if (kind === 'bureau') {
      const department = departmentById.get(item.department_id)
      setForm({
        kind,
        id: item.id,
        name: item.name,
        division_id: department ? String(department.division_id) : '',
        department_id: String(item.department_id),
      })
    } else {
      setForm({ kind, id: item.id, name: item.name, division_id: item.division_id ? String(item.division_id) : '', department_id: '' })
    }
  }

  async function submitForm(event) {
    event.preventDefault()
    if (!form) return
    if (form.kind === 'department' && !form.division_id) {
      setFormError('Divisi induk wajib dipilih.')
      return
    }
    if (form.kind === 'bureau' && !form.department_id) {
      setFormError('Departemen induk wajib dipilih.')
      return
    }
    setFormError('')
    setIsSaving(true)
    const meta = KINDS[form.kind]
    let body = { name: form.name }
    if (form.kind === 'department') body = { name: form.name, division_id: Number(form.division_id) }
    if (form.kind === 'bureau') body = { name: form.name, department_id: Number(form.department_id) }
    try {
      await apiRequest(form.id ? `${BASE}/${meta.path}/${form.id}` : `${BASE}/${meta.path}`, {
        method: form.id ? 'PUT' : 'POST',
        body: JSON.stringify(body),
      })
      setNotice(`${meta.title} berhasil ${form.id ? 'diperbarui' : 'ditambahkan'}.`)
      setForm(null)
      await load()
    } catch (requestError) {
      setFormError(requestError.message)
    } finally {
      setIsSaving(false)
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return
    setDeleteError('')
    setIsDeleting(true)
    try {
      await apiRequest(`${BASE}/${KINDS[pendingDelete.kind].path}/${pendingDelete.item.id}`, { method: 'DELETE' })
      setNotice(`${KINDS[pendingDelete.kind].title} berhasil dihapus.`)
      setPendingDelete(null)
      await load()
    } catch (requestError) {
      setDeleteError(requestError.message)
    } finally {
      setIsDeleting(false)
    }
  }

  const meta = KINDS[kind]
  const divisionOptions = master.divisions.map((item) => ({ value: String(item.id), label: item.name }))
  const filters = []
  if (kind === 'department' || kind === 'bureau') {
    filters.push({
      label: 'Divisi',
      allLabel: 'Semua divisi',
      value: divisionFilter,
      onChange: (value) => { setDivisionFilter(value); setDepartmentFilter('all') },
      options: divisionOptions,
    })
  }
  if (kind === 'bureau') {
    filters.push({
      label: 'Departemen',
      allLabel: 'Semua departemen',
      value: departmentFilter,
      onChange: setDepartmentFilter,
      options: master.departments
        .filter((department) => divisionFilter === 'all' || String(department.division_id) === divisionFilter)
        .map((item) => ({ value: String(item.id), label: item.name })),
    })
  }
  const emptyCollection = kind === 'division' ? master.divisions : kind === 'department' ? master.departments : master.bureaus
  const searchPlaceholder = kind === 'division' ? 'Cari nama divisi...' : kind === 'department' ? 'Cari departemen atau divisi...' : 'Cari biro atau departemen...'
  const formDepartments = master.departments
    .filter((department) => !form?.division_id || String(department.division_id) === form.division_id)
    .map((item) => ({ value: String(item.id), label: item.name }))

  return (
    <section className="account-manager master-manager">
      <div className="admin-table-heading">
        <div>
          <h2>Master data karyawan</h2>
          <p>{master.divisions.length} divisi · {master.departments.length} departemen · {master.bureaus.length} biro/bengkel · dipakai sebagai pilihan pada akun dan profil pelamar</p>
        </div>
        <button className="apply-button" onClick={openCreate} type="button">
          <Plus size={16} /> Tambah {meta.singular}
        </button>
      </div>

      <nav aria-label="Jenis master data" className="account-type-tabs master-subtabs">
        <button aria-pressed={kind === 'division'} className={kind === 'division' ? 'account-type-tab active' : 'account-type-tab'} onClick={() => switchKind('division')} type="button">
          <Building2 size={17} /> Divisi
        </button>
        <button aria-pressed={kind === 'department'} className={kind === 'department' ? 'account-type-tab active' : 'account-type-tab'} onClick={() => switchKind('department')} type="button">
          <Layers size={17} /> Departemen
        </button>
        <button aria-pressed={kind === 'bureau'} className={kind === 'bureau' ? 'account-type-tab active' : 'account-type-tab'} onClick={() => switchKind('bureau')} type="button">
          <Wrench size={17} /> Biro / Bengkel
        </button>
      </nav>

      <AdminTableToolbar
        filters={filters}
        onPageChange={setPage}
        onSearchChange={setSearch}
        search={search}
        searchPlaceholder={searchPlaceholder}
      />

      <div className="admin-table-scroll">
        {isLoading ? (
          <div className="admin-loading">Memuat master data...</div>
        ) : loadError ? (
          <div className="admin-loading account-load-error" role="alert">
            <p>{loadError}</p>
            <button className="admin-small-button" onClick={() => { setIsLoading(true); void load() }} type="button">Coba lagi</button>
          </div>
        ) : rows.length ? (
          <table className="admin-table">
            <thead>
              <tr>
                <th>{kind === 'division' ? 'NAMA DIVISI' : kind === 'department' ? 'NAMA DEPARTEMEN' : 'NAMA BIRO / BENGKEL'}</th>
                {kind === 'division' && <th>DEPARTEMEN</th>}
                {kind === 'department' && <><th>DIVISI</th><th>BIRO / BENGKEL</th></>}
                {kind === 'bureau' && <><th>DEPARTEMEN</th><th>DIVISI</th></>}
                <th>AKUN PELAMAR</th>
                <th>AKSI</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((item) => {
                const childCount = kind === 'division' ? departmentCounts.get(item.id) || 0 : kind === 'department' ? bureauCounts.get(item.id) || 0 : 0
                const inUse = item.accounts_count > 0 || childCount > 0
                const blockedReason = childCount > 0
                  ? `Hapus atau pindahkan ${kind === 'division' ? 'departemen' : 'biro'} di dalamnya terlebih dahulu`
                  : item.accounts_count > 0
                    ? 'Masih dipakai akun pelamar'
                    : undefined
                const bureauDepartment = kind === 'bureau' ? departmentById.get(item.department_id) : null
                return (
                  <tr key={`${kind}-${item.id}`}>
                    <td className="position-name">{item.name}</td>
                    {kind === 'division' && <td>{childCount}</td>}
                    {kind === 'department' && <><td>{divisionById.get(item.division_id)?.name || '-'}</td><td>{childCount}</td></>}
                    {kind === 'bureau' && <><td>{bureauDepartment?.name || '-'}</td><td>{divisionNameOf(bureauDepartment) || '-'}</td></>}
                    <td>{item.accounts_count}</td>
                    <td className="admin-row-actions">
                      <button className="admin-small-button" onClick={() => openEdit(item)} type="button">Edit</button>
                      <button
                        className="admin-small-button danger"
                        disabled={inUse}
                        onClick={() => { setDeleteError(''); setPendingDelete({ kind, item }) }}
                        title={blockedReason}
                        type="button"
                      >
                        Hapus
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        ) : (
          <div className="admin-loading">
            {emptyCollection.length
              ? `Tidak ada ${meta.singular} yang cocok.`
              : kind === 'bureau'
                ? 'Belum ada biro / bengkel. Tambahkan di sini; Excel import tidak memuat biro.'
                : `Belum ada ${meta.singular}. Gunakan tombol Tambah ${meta.singular} atau import Excel di Akun Pelamar.`}
          </div>
        )}
      </div>
      {!isLoading && !loadError && <AdminTablePagination onPageChange={setPage} page={page} total={rows.length} />}
      <p className="admin-table-note">
        Data yang masih dipakai akun pelamar, atau yang masih memiliki turunan (divisi berisi departemen, departemen berisi biro), tidak dapat dihapus. Divisi dan departemen dari import Excel otomatis ditambahkan; biro diisi manual.
      </p>

      <SuccessPopup message={notice} onClose={setNotice} />

      {form && (
        <AdminFormDialog onClose={() => setForm(null)} title={`${form.id ? 'Edit' : 'Tambah'} ${KINDS[form.kind].singular}`}>
          <form className="organization-form account-manager-form" onSubmit={submitForm}>
            <p className="organization-help account-form-help"><em>*</em> Wajib diisi.</p>
            {(form.kind === 'department' || form.kind === 'bureau') && (
              <label><span>Divisi{form.kind === 'department' ? ' induk' : ''} <em>*</em></span>
                <SearchableSelect
                  onChange={(value) => setForm((current) => ({ ...current, division_id: value, department_id: '' }))}
                  options={divisionOptions}
                  placeholder="Pilih divisi"
                  required
                  value={form.division_id}
                />
              </label>
            )}
            {form.kind === 'bureau' && (
              <label><span>Departemen induk <em>*</em></span>
                <SearchableSelect
                  disabled={!form.division_id}
                  onChange={(value) => setForm((current) => ({ ...current, department_id: value }))}
                  options={formDepartments}
                  placeholder={form.division_id ? 'Pilih departemen' : 'Pilih divisi dahulu'}
                  required
                  value={form.department_id}
                />
              </label>
            )}
            <label><span>Nama {KINDS[form.kind].singular} <em>*</em></span>
              <input
                autoFocus
                maxLength={200}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                required
                value={form.name}
              />
            </label>
            {formError && <p className="admin-alert error" role="alert">{formError}</p>}
            <div className="organization-form-actions">
              <button className="detail-button" onClick={() => setForm(null)} type="button">Batal</button>
              <button className="apply-button" disabled={isSaving} type="submit">
                {isSaving ? 'Menyimpan...' : form.id ? 'Simpan perubahan' : <><Plus size={16} /> Tambah</>}
              </button>
            </div>
          </form>
        </AdminFormDialog>
      )}

      {pendingDelete && (
        <ConfirmDialog
          error={deleteError}
          isBusy={isDeleting}
          message={`${KINDS[pendingDelete.kind].title} "${pendingDelete.item.name}" akan dihapus dari master data.`}
          onCancel={() => { setPendingDelete(null); setDeleteError('') }}
          onConfirm={() => void confirmDelete()}
          title={`Hapus ${KINDS[pendingDelete.kind].singular}?`}
        />
      )}
    </section>
  )
}
