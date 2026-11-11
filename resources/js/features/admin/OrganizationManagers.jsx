import { useState } from 'react'
import { Plus } from 'lucide-react'
import { apiRequest } from '../../api'
import SearchableSelect from '../../components/SearchableSelect'
import { AdminTableToolbar, ConfirmDialog, AdminFormDialog } from './AdminPrimitives'
import { AdminTablePagination } from './AdminPagination'
import { useAdminPagination } from './useAdminPagination'
import { downloadTablePdf } from './downloadPdf'
import SuccessPopup from '../../components/SuccessPopup'

export function OrganizationManager({ level, organization, isLoading, sessionToken, onRefresh }) {
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
  const [form, setForm] = useState({
    name: '',
    description: '',
    secretariat_name: '',
    secretariat_description: '',
    unit_type: 'biro',
  })
  const [parentId, setParentId] = useState('')
  const [search, setSearch] = useState('')
  const [parentFilter, setParentFilter] = useState('all')
  const [divisionFilter, setDivisionFilter] = useState('all')
  const [editingId, setEditingId] = useState(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [pendingDelete, setPendingDelete] = useState(null)
  const [isDeleting, setIsDeleting] = useState(false)

  function resetForm() {
    setForm({ name: '', description: '', secretariat_name: '', secretariat_description: '', unit_type: 'biro' })
    setParentId('')
    setEditingId(null)
    setIsCreateModalOpen(false)
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

  function getParentOptionName(parent) {
    if (level !== 'bureaus') return parent.name
    const division = organization.divisions.find((item) => item.id === parent.division_id)
    return `${division?.name || 'Divisi tidak ditemukan'} / ${parent.name}`
  }

  const parentFilterOptions = level === 'bureaus' && divisionFilter !== 'all'
    ? parents.filter((parent) => String(parent.division_id) === divisionFilter)
    : parents

  const filteredItems = items.filter((item) => {
    const query = search.trim().toLocaleLowerCase('id')
    const matchesSearch = [
      item.name,
      item.description,
      item.secretariat_name,
      item.secretariat_description,
      getParentName(item),
    ].join(' ').toLocaleLowerCase('id').includes(query)
    const department = level === 'bureaus'
      ? organization.departments.find((entry) => entry.id === item.department_id)
      : null
    const matchesDivision = level !== 'bureaus'
      || divisionFilter === 'all'
      || String(department?.division_id) === divisionFilter
    const matchesParent = !definition.parentField
      || parentFilter === 'all'
      || String(item[definition.parentField]) === parentFilter
    return matchesSearch && matchesDivision && matchesParent
  })
  const { items: pageItems, page, setPage } = useAdminPagination(filteredItems)

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    setNotice('')
    setIsSaving(true)
    const body = {
      name: form.name.trim(),
      description: form.description.trim(),
    }
    if (level === 'divisions') {
      body.secretariat_name = form.secretariat_name.trim()
      body.secretariat_description = form.secretariat_description.trim()
    }
    if (level === 'bureaus') body.unit_type = form.unit_type
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
    setIsCreateModalOpen(false)
    setEditingId(item.id)
    setForm({
      name: item.name,
      description: item.description || '',
      secretariat_name: item.secretariat_name || '',
      secretariat_description: item.secretariat_description || '',
      unit_type: item.unit_type || 'biro',
    })
    setParentId('')
    setError('')
    setNotice('')
  }

  function openCreateForm() {
    resetForm()
    setError('')
    setNotice('')
    setIsCreateModalOpen(true)
  }

  const editorForm = (
    <form className={isCreateModalOpen ? 'organization-form admin-popup-form' : 'organization-form'} onSubmit={handleSubmit}>
        <p className="organization-help admin-form-wide"><em>*</em> Wajib diisi. Kolom bertanda (opsional) boleh dikosongkan.</p>
        <label>
          <span>{definition.label} <em>*</em></span>
          <input maxLength={160} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} required value={form.name} />
        </label>
        {level === 'bureaus' && (
          <label>
            <span>Jenis unit <em>*</em></span>
            <SearchableSelect
              onChange={(value) => setForm((current) => ({ ...current, unit_type: value }))}
              options={[{ value: 'biro', label: 'Biro' }, { value: 'bengkel', label: 'Bengkel' }]}
              required
              value={form.unit_type}
            />
          </label>
        )}
        <label>
          <span>Deskripsi {definition.label.toLocaleLowerCase('id')} (opsional)</span>
          <textarea maxLength={4000} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} rows={4} value={form.description} />
        </label>
        {level === 'divisions' && (
          <>
            <label>
              <span>Sekretariat Divisi (opsional)</span>
              <input maxLength={160} onChange={(event) => setForm((current) => ({ ...current, secretariat_name: event.target.value }))} value={form.secretariat_name} />
            </label>
            <label>
              <span>Deskripsi Sekretariat Divisi (opsional)</span>
              <textarea maxLength={4000} onChange={(event) => setForm((current) => ({ ...current, secretariat_description: event.target.value }))} rows={4} value={form.secretariat_description} />
            </label>
          </>
        )}
        {definition.parentField && (
          <label>
            <span>{definition.parentLabel} {!editingId && <em>*</em>}</span>
            <SearchableSelect
              disabled={Boolean(editingId) || !parents.length}
              onChange={setParentId}
              options={editingId
                ? [{
                    value: getParentName(items.find((item) => item.id === editingId)),
                    label: getParentName(items.find((item) => item.id === editingId)),
                  }]
                : parents.map((parent) => ({ value: String(parent.id), label: getParentOptionName(parent) }))}
              placeholder={`Pilih ${definition.parentLabel.toLocaleLowerCase('id')}`}
              required={!editingId}
              value={editingId ? getParentName(items.find((item) => item.id === editingId)) : parentId}
            />
          </label>
        )}
        {definition.parentField && !parents.length && (
          <p className="organization-help">Tambahkan {definition.parentLabel.toLocaleLowerCase('id')} terlebih dahulu agar dapat menghubungkan data ini.</p>
        )}
        {error && <p className="admin-alert error" role="alert">{error}</p>}
        <div className="organization-form-actions">
          {editingId && <button className="detail-button" onClick={resetForm} type="button">Batal edit</button>}
          {isCreateModalOpen && <button className="detail-button" onClick={resetForm} type="button">Batal</button>}
          <button className="apply-button" disabled={isSaving || (definition.parentField && !editingId && !parents.length)} type="submit">
            {isSaving ? 'Menyimpan...' : editingId ? 'Simpan perubahan' : `Tambah ${definition.label.toLocaleLowerCase('id')}`}
          </button>
        </div>
  </form>
  )

  return (
    <section className="admin-organization-view">
      <div className="admin-table-heading">
        <div>
          <h2>Kelola {definition.label.toLocaleLowerCase('id')}</h2>
          <p>{items.length} {definition.label.toLocaleLowerCase('id')} terdaftar</p>
        </div>
        <button className="apply-button" onClick={openCreateForm} type="button"><Plus size={16} /> Tambah {definition.label.toLocaleLowerCase('id')}</button>
      </div>
      {editingId && (
        <AdminFormDialog
          className="admin-compact-editor-modal"
          onClose={resetForm}
          title={`Edit ${definition.label.toLocaleLowerCase('id')}`}
        >
          {editorForm}
        </AdminFormDialog>
      )}
      <AdminTableToolbar
        filters={level === 'bureaus'
          ? [
              {
                label: 'Divisi',
                value: divisionFilter,
                onChange: (value) => {
                  setDivisionFilter(value)
                  setParentFilter('all')
                },
                options: organization.divisions.map((division) => ({
                  value: String(division.id),
                  label: division.name,
                })),
              },
              {
                label: 'Departemen',
                value: parentFilter,
                onChange: setParentFilter,
                options: parentFilterOptions.map((parent) => ({
                  value: String(parent.id),
                  label: getParentOptionName(parent),
                })),
              },
            ]
          : definition.parentField ? [{
              label: definition.parentLabel,
              value: parentFilter,
              onChange: setParentFilter,
              options: parents.map((parent) => ({ value: String(parent.id), label: parent.name })),
            }] : []}
        onPageChange={setPage}
        onSearchChange={setSearch}
        search={search}
        searchPlaceholder={`Cari ${definition.label.toLocaleLowerCase('id')}${definition.parentField ? ' atau induknya' : ''}...`}
        onDownloadPdf={() => downloadTablePdf(
          level,
          level === 'divisions'
            ? 'Daftar Divisi'
            : level === 'departments'
              ? 'Daftar Departemen'
              : 'Daftar Biro dan Bengkel',
          level === 'divisions'
            ? ['Divisi', 'Deskripsi', 'Sekretariat', 'Deskripsi sekretariat']
            : level === 'departments'
              ? ['Departemen', 'Divisi', 'Deskripsi']
              : ['Unit kerja', 'Jenis unit', 'Departemen / divisi', 'Deskripsi'],
          filteredItems.map((item) => level === 'divisions'
            ? [item.name, item.description, item.secretariat_name, item.secretariat_description]
            : level === 'departments'
              ? [item.name, getParentName(item), item.description]
              : [item.name, item.unit_type === 'bengkel' ? 'Bengkel' : 'Biro', getParentName(item), item.description]),
        )}
        downloadDisabled={isLoading || !filteredItems.length}
      />
      <div className="admin-table-scroll">
        {isLoading ? (
          <div className="admin-loading">Memuat struktur organisasi...</div>
        ) : filteredItems.length ? (
          <table className="admin-table organization-table">
            <thead>
              <tr>
                <th>NAMA</th>
                {level === 'bureaus' && <th>JENIS UNIT</th>}
                <th>DESKRIPSI</th>
                {level === 'divisions' && <><th>SEKRETARIAT DIVISI</th><th>DESKRIPSI SEKRETARIAT</th></>}
                {definition.parentField && <th>{definition.parentLabel.toUpperCase()}</th>}
                <th>AKSI</th>
              </tr>
            </thead>
            <tbody>
              {pageItems.map((item) => (
                <tr key={item.id}>
                  <td className="position-name">{item.name}</td>
                  {level === 'bureaus' && <td>{item.unit_type === 'bengkel' ? 'Bengkel' : 'Biro'}</td>}
                  {level === 'divisions' ? (
                    <>
                      <td>{item.description || '—'}</td>
                      <td className="position-name">{item.secretariat_name || '—'}</td>
                      <td>{item.secretariat_description || '—'}</td>
                    </>
                  ) : (
                    <td>{item.description || '—'}</td>
                  )}
                  {definition.parentField && <td>{getParentName(item)}</td>}
                  <td className="admin-row-actions">
                    <button className="admin-small-button" onClick={() => editItem(item)} type="button">Edit</button>
                    <button className="admin-small-button danger" onClick={() => { setError(''); setPendingDelete(item) }} type="button">Hapus</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="admin-loading">{items.length ? 'Tidak ada data yang cocok.' : `Belum ada ${definition.label.toLocaleLowerCase('id')}.`}</div>
        )}
      </div>
      {!isLoading && (
        <AdminTablePagination onPageChange={setPage} page={page} total={filteredItems.length} />
      )}
      <SuccessPopup message={notice} onClose={setNotice} />
      {isCreateModalOpen && (
        <AdminFormDialog className="admin-compact-editor-modal" onClose={resetForm} title={`Tambah ${definition.label.toLocaleLowerCase('id')}`}>
          {editorForm}
        </AdminFormDialog>
      )}
      {pendingDelete && (
        <ConfirmDialog
          error={error}
          isBusy={isDeleting}
          message={`Data ${definition.label.toLocaleLowerCase('id')} "${pendingDelete.name}" akan dihapus permanen. Penghapusan ditolak jika masih memiliki unit bawahan atau digunakan oleh lowongan, akun admin, maupun direktori karyawan.`}
          onCancel={() => { setPendingDelete(null); setError('') }}
          onConfirm={() => void deleteItem()}
          title={`Hapus ${definition.label.toLocaleLowerCase('id')}?`}
        />
      )}
    </section>
  )
}

export function JobTypeManager({ jobTypes, isLoading, loadError, sessionToken, onRefresh }) {
  const [name, setName] = useState('')
  const [search, setSearch] = useState('')
  const [usageFilter, setUsageFilter] = useState('all')
  const [editingId, setEditingId] = useState(null)
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [pendingDelete, setPendingDelete] = useState(null)
  const [isDeleting, setIsDeleting] = useState(false)

  function resetForm() {
    setName('')
    setEditingId(null)
    setIsCreateModalOpen(false)
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
    setIsCreateModalOpen(false)
    setEditingId(jobType.id)
    setName(jobType.name)
    setError('')
    setNotice('')
  }

  function openCreateForm() {
    resetForm()
    setError('')
    setNotice('')
    setIsCreateModalOpen(true)
  }

  const filteredJobTypes = jobTypes.filter((jobType) => {
    const matchesSearch = jobType.name.toLocaleLowerCase('id').includes(search.trim().toLocaleLowerCase('id'))
    const matchesUsage = usageFilter === 'all'
      || (jobType.job_count > 0 ? 'used' : 'unused') === usageFilter
    return matchesSearch && matchesUsage
  })
  const { items: pageJobTypes, page, setPage } = useAdminPagination(filteredJobTypes)

  const editorForm = (
    <form className={isCreateModalOpen ? 'organization-form job-type-form admin-popup-form' : 'organization-form job-type-form'} onSubmit={handleSubmit}>
      <p className="organization-help admin-form-wide"><em>*</em> Wajib diisi. Tidak ada kolom opsional di formulir ini.</p>
      <label>
        <span>Jenis pekerjaan <em>*</em></span>
        <input maxLength={80} onChange={(event) => setName(event.target.value)} required value={name} />
      </label>
      {error && !pendingDelete && <p className="admin-alert error" role="alert">{error}</p>}
      <div className="organization-form-actions">
        {editingId && <button className="detail-button" onClick={resetForm} type="button">Batal edit</button>}
        {isCreateModalOpen && <button className="detail-button" onClick={resetForm} type="button">Batal</button>}
        <button className="apply-button" disabled={isSaving || isLoading} type="submit">
          {isSaving ? 'Menyimpan...' : editingId ? 'Simpan perubahan' : 'Tambah jenis pekerjaan'}
        </button>
      </div>
    </form>
  )

  return (
    <section className="admin-organization-view">
      <div className="admin-table-heading">
        <div>
          <h2>Kelola jenis pekerjaan</h2>
          <p>{jobTypes.length} jenis pekerjaan terdaftar</p>
        </div>
        <button className="apply-button" disabled={isLoading || Boolean(loadError)} onClick={openCreateForm} type="button"><Plus size={16} /> Tambah jenis pekerjaan</button>
      </div>
      <p className="organization-help job-type-description">Pilihan ini tersedia pada formulir lowongan. Jenis yang sudah digunakan tidak bisa dihapus.</p>
      {editingId && (
        <AdminFormDialog className="admin-compact-editor-modal" onClose={resetForm} title="Edit jenis pekerjaan">
          {editorForm}
        </AdminFormDialog>
      )}
      <AdminTableToolbar
        onPageChange={setPage}
        filters={[{
          label: 'Penggunaan',
          value: usageFilter,
          onChange: setUsageFilter,
          options: [{ value: 'used', label: 'Sudah digunakan' }, { value: 'unused', label: 'Belum digunakan' }],
        }]}
        onSearchChange={setSearch}
        search={search}
        searchPlaceholder="Cari jenis pekerjaan..."
        onDownloadPdf={() => downloadTablePdf(
          'jenis-pekerjaan',
          'Daftar Jenis Pekerjaan',
          ['Jenis pekerjaan', 'Jumlah lowongan terkait'],
          filteredJobTypes.map((jobType) => [jobType.name, jobType.job_count]),
        )}
        downloadDisabled={isLoading || Boolean(loadError) || !filteredJobTypes.length}
      />
      <div className="admin-table-scroll">
        {isLoading ? (
          <div className="admin-loading">Memuat jenis pekerjaan...</div>
        ) : loadError ? (
          <div className="admin-loading account-load-error" role="alert">
            <p>{loadError}</p>
            <button className="admin-small-button" onClick={onRefresh} type="button">Coba lagi</button>
          </div>
        ) : filteredJobTypes.length ? (
          <table className="admin-table organization-table">
            <thead><tr><th>JENIS PEKERJAAN</th><th>LOWONGAN TERKAIT</th><th>AKSI</th></tr></thead>
            <tbody>
              {pageJobTypes.map((jobType) => (
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
                      Hapus
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="admin-loading">{jobTypes.length ? 'Tidak ada jenis pekerjaan yang cocok.' : 'Belum ada jenis pekerjaan.'}</div>
        )}
      </div>
      {!isLoading && !loadError && (
        <AdminTablePagination onPageChange={setPage} page={page} total={filteredJobTypes.length} />
      )}
      <SuccessPopup message={notice} onClose={setNotice} />
      {isCreateModalOpen && (
        <AdminFormDialog className="admin-compact-editor-modal" onClose={resetForm} title="Tambah jenis pekerjaan">
          {editorForm}
        </AdminFormDialog>
      )}
      {pendingDelete && (
        <ConfirmDialog
          error={error}
          isBusy={isDeleting}
          message={`Jenis pekerjaan "${pendingDelete.name}" akan dihapus permanen.`}
          onCancel={() => { setPendingDelete(null); setError('') }}
          onConfirm={() => void deleteItem()}
          title="Hapus jenis pekerjaan?"
        />
      )}
    </section>
  )
}
