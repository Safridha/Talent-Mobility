import { useEffect, useMemo, useState } from 'react'
import { Check, Pencil, Plus, Trash2, X } from 'lucide-react'
import { apiRequest } from '../../api'
import { AdminFormDialog, ConfirmDialog } from './AdminPrimitives'

const BASE = '/admin/employee-master'

export default function EmployeeMasterDialog({ onClose, onChanged }) {
  const [master, setMaster] = useState({ divisions: [], departments: [] })
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedDivisionId, setSelectedDivisionId] = useState(null)
  const [divisionSearch, setDivisionSearch] = useState('')
  const [newDivision, setNewDivision] = useState('')
  const [newDepartment, setNewDepartment] = useState('')
  const [editing, setEditing] = useState(null) // { kind, id, name }
  const [pendingDelete, setPendingDelete] = useState(null) // { kind, item }
  const [isBusy, setIsBusy] = useState(false)

  async function load() {
    try {
      const response = await apiRequest(BASE)
      setMaster(response)
      setError('')
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  const filteredDivisions = useMemo(() => {
    const query = divisionSearch.trim().toLocaleLowerCase('id')
    return master.divisions.filter((division) => !query || division.name.toLocaleLowerCase('id').includes(query))
  }, [divisionSearch, master.divisions])
  const selectedDivision = master.divisions.find((division) => division.id === selectedDivisionId) || null
  const departments = master.departments.filter((department) => department.division_id === selectedDivisionId)

  async function mutate(path, method, body) {
    setError('')
    setIsBusy(true)
    try {
      await apiRequest(path, { method, body: body ? JSON.stringify(body) : undefined })
      await load()
      onChanged?.()
      return true
    } catch (requestError) {
      setError(requestError.message)
      return false
    } finally {
      setIsBusy(false)
    }
  }

  async function addDivision(event) {
    event.preventDefault()
    if (await mutate(`${BASE}/divisions`, 'POST', { name: newDivision })) setNewDivision('')
  }

  async function addDepartment(event) {
    event.preventDefault()
    if (!selectedDivision) return
    if (await mutate(`${BASE}/departments`, 'POST', { division_id: selectedDivision.id, name: newDepartment })) setNewDepartment('')
  }

  async function saveEdit() {
    if (!editing) return
    const path = `${BASE}/${editing.kind === 'division' ? 'divisions' : 'departments'}/${editing.id}`
    const body = editing.kind === 'division'
      ? { name: editing.name }
      : { name: editing.name, division_id: editing.division_id }
    if (await mutate(path, 'PUT', body)) setEditing(null)
  }

  async function confirmDelete() {
    if (!pendingDelete) return
    const path = `${BASE}/${pendingDelete.kind === 'division' ? 'divisions' : 'departments'}/${pendingDelete.item.id}`
    if (await mutate(path, 'DELETE')) {
      if (pendingDelete.kind === 'division' && pendingDelete.item.id === selectedDivisionId) setSelectedDivisionId(null)
      setPendingDelete(null)
    }
  }

  function renderRow(kind, item, extra) {
    const isEditing = editing?.kind === kind && editing.id === item.id
    return (
      <li className={`master-row${extra?.selected ? ' selected' : ''}`} key={item.id}>
        {isEditing ? (
          <>
            <input
              aria-label="Nama"
              autoFocus
              maxLength={200}
              onChange={(event) => setEditing({ ...editing, name: event.target.value })}
              onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void saveEdit() } }}
              value={editing.name}
            />
            <button aria-label="Simpan" className="admin-small-button" disabled={isBusy} onClick={() => void saveEdit()} type="button"><Check size={14} /></button>
            <button aria-label="Batal" className="admin-small-button" onClick={() => setEditing(null)} type="button"><X size={14} /></button>
          </>
        ) : (
          <>
            <button className="master-row-name" onClick={extra?.onSelect} type="button">
              {item.name}
              <small>{item.accounts_count} akun{kind === 'division' ? ` · ${master.departments.filter((d) => d.division_id === item.id).length} departemen` : ''}</small>
            </button>
            <button aria-label={`Ubah ${item.name}`} className="admin-small-button" onClick={() => setEditing({ kind, id: item.id, name: item.name, division_id: item.division_id })} type="button"><Pencil size={14} /></button>
            <button aria-label={`Hapus ${item.name}`} className="admin-small-button danger" onClick={() => { setError(''); setPendingDelete({ kind, item }) }} type="button"><Trash2 size={14} /></button>
          </>
        )}
      </li>
    )
  }

  return (
    <AdminFormDialog className="employee-master-dialog" onClose={onClose} title="Master data Divisi & Departemen karyawan">
      <p className="organization-help account-form-help">
        Daftar ini dipakai sebagai pilihan Divisi dan Departemen (Unit Kerja) pada akun pelamar. Data dari import Excel otomatis ditambahkan di sini.
      </p>
      {error && <p className="admin-alert error" role="alert">{error}</p>}
      {isLoading ? <div className="admin-loading">Memuat master data...</div> : (
        <div className="master-data-grid">
          <section className="master-column">
            <h3>Divisi ({master.divisions.length})</h3>
            <input
              aria-label="Cari divisi"
              onChange={(event) => setDivisionSearch(event.target.value)}
              placeholder="Cari divisi..."
              value={divisionSearch}
            />
            <ul className="master-list">
              {filteredDivisions.map((division) => renderRow('division', division, {
                selected: division.id === selectedDivisionId,
                onSelect: () => setSelectedDivisionId(division.id),
              }))}
            </ul>
            <form className="master-add" onSubmit={addDivision}>
              <input maxLength={200} onChange={(event) => setNewDivision(event.target.value)} placeholder="Nama divisi baru" required value={newDivision} />
              <button className="apply-button" disabled={isBusy} type="submit"><Plus size={15} /> Tambah</button>
            </form>
          </section>
          <section className="master-column">
            <h3>{selectedDivision ? `Departemen — ${selectedDivision.name}` : 'Departemen'}</h3>
            {selectedDivision ? (
              <>
                <ul className="master-list">
                  {departments.length
                    ? departments.map((department) => renderRow('department', department))
                    : <li className="master-empty">Belum ada departemen di divisi ini.</li>}
                </ul>
                <form className="master-add" onSubmit={addDepartment}>
                  <input maxLength={200} onChange={(event) => setNewDepartment(event.target.value)} placeholder="Nama departemen baru" required value={newDepartment} />
                  <button className="apply-button" disabled={isBusy} type="submit"><Plus size={15} /> Tambah</button>
                </form>
              </>
            ) : <p className="master-empty">Pilih divisi untuk melihat dan mengelola departemennya.</p>}
          </section>
        </div>
      )}
      {pendingDelete && (
        <ConfirmDialog
          error={error}
          isBusy={isBusy}
          message={`"${pendingDelete.item.name}" akan dihapus dari master data. Data yang masih dipakai akun pelamar tidak dapat dihapus.`}
          onCancel={() => { setPendingDelete(null); setError('') }}
          onConfirm={() => void confirmDelete()}
          title={`Hapus ${pendingDelete.kind === 'division' ? 'divisi' : 'departemen'}?`}
        />
      )}
    </AdminFormDialog>
  )
}
