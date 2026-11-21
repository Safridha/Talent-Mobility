import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarRange, Pencil, Plus, Trash2 } from 'lucide-react'
import { apiRequest } from '../../api'
import SuccessPopup from '../../components/SuccessPopup'
import { queryKeys } from '../../query/queryKeys'
import { batchPhase, batchPhaseLabels, formatBatchRange } from '../batches/batchFormat'
import { AdminFormDialog, ConfirmDialog } from './AdminPrimitives'

const EMPTY_FORM = {
  name: '',
  registration_start: '',
  registration_end: '',
  interview_start: '',
  interview_end: '',
  all_units: true,
  max_applications: '',
  department_ids: [],
}

// Returns a message when the dates are invalid or collide with another batch, otherwise ''.
function validateForm(form, batches, editingId) {
  if (!form.name.trim()) return 'Nama batch wajib diisi.'
  const { registration_start: rs, registration_end: re, interview_start: is, interview_end: ie } = form
  if (!rs || !re || !is || !ie) return 'Lengkapi semua tanggal pendaftaran dan wawancara.'
  if (rs > re) return 'Tanggal akhir pendaftaran tidak boleh sebelum tanggal mulai.'
  if (is <= re) return 'Seleksi dan wawancara harus dimulai setelah pendaftaran ditutup.'
  if (is > ie) return 'Tanggal akhir wawancara tidak boleh sebelum tanggal mulai.'
  if (form.max_applications !== '') {
    const limit = Number(form.max_applications)
    if (!Number.isInteger(limit) || limit < 1 || limit > 10000) return 'Batas lamaran harus bilangan bulat antara 1 dan 10000, atau dikosongkan jika tidak dibatasi.'
  }
  if (!form.all_units && !form.department_ids.length) return 'Pilih minimal satu unit kerja atau aktifkan semua unit kerja.'
  const clash = batches.find((batch) => batch.id !== editingId && batch.registration_start <= ie && batch.interview_end >= rs)
  if (clash) {
    return `Tanggal bentrok dengan ${clash.name} (${formatBatchRange(clash.registration_start, clash.interview_end)}). Pilih rentang yang tidak tumpang tindih.`
  }
  return ''
}

export default function BatchManager() {
  const queryClient = useQueryClient()
  const [form, setForm] = useState(null)
  const [editingId, setEditingId] = useState(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [deleting, setDeleting] = useState(null)
  const batchesQuery = useQuery({ queryKey: queryKeys.adminBatches, queryFn: () => apiRequest('/admin/batches') })
  const organizationQuery = useQuery({ queryKey: queryKeys.adminOrganization, queryFn: () => apiRequest('/admin/organization') })
  const batches = useMemo(() => batchesQuery.data?.data ?? [], [batchesQuery.data])
  const today = batchesQuery.data?.today ?? ''
  const divisions = organizationQuery.data?.divisions ?? []
  const departments = organizationQuery.data?.departments ?? []

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: queryKeys.adminBatches })
    await queryClient.invalidateQueries({ queryKey: queryKeys.publicBatch })
  }
  const saveMutation = useMutation({
    mutationFn: (payload) => apiRequest(editingId ? `/admin/batches/${editingId}` : '/admin/batches', {
      method: editingId ? 'PUT' : 'POST',
      body: JSON.stringify(payload),
    }),
    onSuccess: async (result) => {
      setNotice(result.message)
      closeForm()
      await refresh()
    },
  })
  const deleteMutation = useMutation({
    mutationFn: (batch) => apiRequest(`/admin/batches/${batch.id}`, { method: 'DELETE' }),
    onSuccess: async (result) => {
      setNotice(result.message)
      setDeleting(null)
      setError('')
      await refresh()
    },
  })

  function openCreate() {
    setEditingId(null)
    setError('')
    setForm({ ...EMPTY_FORM })
  }
  function openEdit(batch) {
    setEditingId(batch.id)
    setError('')
    setForm({
      name: batch.name,
      registration_start: batch.registration_start,
      registration_end: batch.registration_end,
      interview_start: batch.interview_start,
      interview_end: batch.interview_end,
      all_units: batch.all_units,
      max_applications: batch.max_applications === null ? '' : String(batch.max_applications),
      department_ids: batch.department_ids,
    })
  }
  function closeForm() {
    setForm(null)
    setEditingId(null)
    setError('')
  }
  function setField(field, value) {
    setForm((current) => ({ ...current, [field]: value }))
  }
  function toggleDepartment(ids, checked) {
    setForm((current) => {
      const next = new Set(current.department_ids)
      ids.forEach((id) => (checked ? next.add(id) : next.delete(id)))
      return { ...current, department_ids: [...next] }
    })
  }
  async function submit(event) {
    event.preventDefault()
    const message = validateForm(form, batches, editingId)
    if (message) {
      setError(message)
      return
    }
    setError('')
    try {
      await saveMutation.mutateAsync({
        ...form,
        name: form.name.trim(),
        max_applications: form.max_applications === '' ? null : Number(form.max_applications),
        department_ids: form.all_units ? [] : form.department_ids,
      })
    } catch (requestError) {
      setError(requestError.message)
    }
  }
  async function confirmDelete() {
    setError('')
    try {
      await deleteMutation.mutateAsync(deleting)
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  return (
    <section className="admin-table-panel admin-batch-panel">
      <header className="admin-table-heading">
        <div>
          <h2>Batch periode</h2>
          <p>Atur jadwal pendaftaran, seleksi dan wawancara, serta unit kerja yang dibuka untuk setiap batch. Tanggal antar batch tidak boleh bentrok.</p>
        </div>
        <button className="apply-button admin-batch-add" onClick={openCreate} type="button"><Plus aria-hidden="true" size={16} /> Tambah batch</button>
      </header>
      {batchesQuery.isPending ? (
        <div className="admin-loading">Memuat batch...</div>
      ) : batchesQuery.isError ? (
        <p className="admin-alert error" role="alert">{batchesQuery.error.message}</p>
      ) : !batches.length ? (
        <div className="admin-loading">Belum ada batch. Pelamar tidak dapat mendaftar sampai ada batch yang dibuka.</div>
      ) : (
        <ul className="admin-batch-list">
          {[...batches].reverse().map((batch) => {
            const phase = batchPhase(batch, today)
            return (
              <li className={`admin-batch-card is-${phase}`} key={batch.id}>
                <div className="admin-batch-head">
                  <div>
                    <strong>{batch.name}</strong>
                    <span className={`admin-batch-phase is-${phase}`}>{batchPhaseLabels[phase]}</span>
                  </div>
                  <div className="admin-batch-actions">
                    <button aria-label={`Ubah ${batch.name}`} className="admin-small-button" onClick={() => openEdit(batch)} type="button"><Pencil aria-hidden="true" size={14} /> Ubah</button>
                    <button
                      aria-label={`Hapus ${batch.name}`}
                      className="admin-small-button danger"
                      disabled={batch.application_count > 0}
                      onClick={() => { setError(''); setDeleting(batch) }}
                      title={batch.application_count > 0 ? 'Batch yang sudah memiliki lamaran tidak dapat dihapus' : 'Hapus batch'}
                      type="button"
                    ><Trash2 aria-hidden="true" size={14} /></button>
                  </div>
                </div>
                <dl>
                  <div><dt>Pendaftaran</dt><dd>{formatBatchRange(batch.registration_start, batch.registration_end)}</dd></div>
                  <div><dt>Seleksi dan wawancara</dt><dd>{formatBatchRange(batch.interview_start, batch.interview_end)}</dd></div>
                  <div><dt>Unit kerja aktif</dt><dd>{batch.all_units ? 'Semua unit kerja' : `${batch.department_ids.length} departemen`}</dd></div>
                  <div><dt>Batas lamaran per pelamar</dt><dd>{batch.max_applications === null ? 'Tidak dibatasi' : `${batch.max_applications} lamaran`}</dd></div>
                  <div><dt>Lamaran masuk</dt><dd>{batch.application_count}</dd></div>
                </dl>
              </li>
            )
          })}
        </ul>
      )}
      <SuccessPopup message={notice} onClose={setNotice} />
      {form && (
        <AdminFormDialog className="admin-batch-modal" onClose={closeForm} title={editingId ? 'Ubah batch' : 'Tambah batch'}>
          <form className="admin-batch-form" onSubmit={submit}>
            <label>
              <span>Nama batch</span>
              <input maxLength={80} onChange={(event) => setField('name', event.target.value)} placeholder="Contoh: Batch 2027" required value={form.name} />
            </label>
            <fieldset>
              <legend><CalendarRange aria-hidden="true" size={15} /> Pendaftaran</legend>
              <label><span>Mulai</span><input onChange={(event) => setField('registration_start', event.target.value)} required type="date" value={form.registration_start} /></label>
              <label><span>Berakhir</span><input min={form.registration_start} onChange={(event) => setField('registration_end', event.target.value)} required type="date" value={form.registration_end} /></label>
            </fieldset>
            <fieldset>
              <legend><CalendarRange aria-hidden="true" size={15} /> Seleksi dan wawancara</legend>
              <label><span>Mulai</span><input min={form.registration_end} onChange={(event) => setField('interview_start', event.target.value)} required type="date" value={form.interview_start} /></label>
              <label><span>Berakhir</span><input min={form.interview_start} onChange={(event) => setField('interview_end', event.target.value)} required type="date" value={form.interview_end} /></label>
            </fieldset>
            <label>
              <span>Batas lamaran per pelamar (opsional)</span>
              <input max={10000} min={1} onChange={(event) => setField('max_applications', event.target.value)} placeholder="Kosongkan jika tidak dibatasi" step={1} type="number" value={form.max_applications} />
            </label>
            <p className="admin-batch-hint">Batas dihitung dari semua lamaran pelamar di batch ini, termasuk yang ditolak.</p>
            <p className="admin-batch-hint">Lamaran yang belum ditindaklanjuti sampai tanggal berakhir seleksi dan wawancara otomatis dianggap ditolak.</p>
            <fieldset>
              <legend>Unit kerja yang dibuka</legend>
              <label className="admin-batch-check">
                <input checked={form.all_units} onChange={(event) => setField('all_units', event.target.checked)} type="checkbox" />
                <span>Semua unit kerja (termasuk yang ditambahkan kemudian)</span>
              </label>
              {!form.all_units && (
                <div className="admin-batch-units">
                  {divisions.map((division) => {
                    const items = departments.filter((department) => department.division_id === division.id)
                    if (!items.length) return null
                    const ids = items.map((department) => department.id)
                    const selected = ids.filter((id) => form.department_ids.includes(id)).length
                    return (
                      <div className="admin-batch-division" key={division.id}>
                        <label className="admin-batch-check is-division">
                          <input
                            checked={selected === ids.length}
                            onChange={(event) => toggleDepartment(ids, event.target.checked)}
                            ref={(node) => { if (node) node.indeterminate = selected > 0 && selected < ids.length }}
                            type="checkbox"
                          />
                          <span>{division.name}</span>
                        </label>
                        {items.map((department) => (
                          <label className="admin-batch-check" key={department.id}>
                            <input checked={form.department_ids.includes(department.id)} onChange={(event) => toggleDepartment([department.id], event.target.checked)} type="checkbox" />
                            <span>{department.name}</span>
                          </label>
                        ))}
                      </div>
                    )
                  })}
                </div>
              )}
            </fieldset>
            {error && <p className="admin-alert error" role="alert">{error}</p>}
            <div className="admin-batch-actions-row">
              <button className="admin-small-button" onClick={closeForm} type="button">Batal</button>
              <button className="apply-button" disabled={saveMutation.isPending} type="submit">{saveMutation.isPending ? 'Menyimpan...' : 'Simpan batch'}</button>
            </div>
          </form>
        </AdminFormDialog>
      )}
      {deleting && (
        <ConfirmDialog
          details={['Batch yang belum memiliki lamaran dapat dihapus.', 'Tindakan ini dicatat di audit log.']}
          error={error}
          isBusy={deleteMutation.isPending}
          message={`${deleting.name} akan dihapus dari daftar batch.`}
          onCancel={() => { setDeleting(null); setError('') }}
          onConfirm={() => void confirmDelete()}
          title="Hapus batch?"
        />
      )}
    </section>
  )
}
