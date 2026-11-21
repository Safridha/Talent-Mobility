import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarRange, Check, ChevronDown, ChevronRight, Lock, Minus, Pencil, Plus, Search, Trash2, X } from 'lucide-react'
import { apiRequest } from '../../api'
import DateField from '../../components/DateField'
import SuccessPopup from '../../components/SuccessPopup'
import { queryKeys } from '../../query/queryKeys'
import { addBatchDays, batchPhase, batchPhaseLabels, daysBetween, formatBatchDate, formatBatchRange } from '../batches/batchFormat'
import { AdminFormDialog, ConfirmDialog } from './AdminPrimitives'
import { AdminTablePagination } from './AdminPagination'
import { useAdminPagination } from './useAdminPagination'

const EMPTY_FORM = {
  name: '',
  registration_start: '',
  registration_end: '',
  interview_start: '',
  interview_end: '',
  all_units: true,
  max_applications: '',
  department_ids: [],
  bureau_ids: [],
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
  if (!form.all_units && !form.department_ids.length && !form.bureau_ids.length) return 'Pilih minimal satu unit kerja atau aktifkan semua unit kerja.'
  const clash = batches.find((batch) => batch.id !== editingId && batch.registration_start <= ie && batch.interview_end >= rs)
  if (clash) {
    return `Tanggal bentrok dengan ${clash.name} (${formatBatchRange(clash.registration_start, clash.interview_end)}). Pilih rentang yang tidak tumpang tindih.`
  }
  return ''
}


function isValidDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
}

// Proportional bar of the whole cycle: registration, the gap (if any) and selection / interviews.
function ScheduleTimeline({ form }) {
  const { registration_start: rs, registration_end: re, interview_start: is, interview_end: ie } = form
  if (![rs, re, is, ie].every(isValidDate) || rs > re || is <= re || is > ie) return null
  const registrationDays = daysBetween(rs, re) + 1
  const gapDays = Math.max(0, daysBetween(re, is) - 1)
  const interviewDays = daysBetween(is, ie) + 1
  const total = registrationDays + gapDays + interviewDays
  const share = (days) => `${(days / total) * 100}%`
  const short = { day: 'numeric', month: 'short' }
  return (
    <div aria-label="Linimasa batch" className="batch-timeline">
      <div className="batch-timeline-bar">
        <span className="is-registration" style={{ width: share(registrationDays) }}>Pendaftaran · {registrationDays} hari</span>
        {gapDays > 0 && <span className="is-gap" style={{ width: share(gapDays) }} title={`${gapDays} hari jeda`} />}
        <span className="is-interview" style={{ width: share(interviewDays) }}>Seleksi &amp; wawancara · {interviewDays} hari</span>
      </div>
      <div className="batch-timeline-dates">
        <span>{formatBatchDate(rs, short)}</span>
        <span>{formatBatchDate(re, short)}</span>
        <span>{formatBatchDate(is, short)}</span>
        <span>{formatBatchDate(ie, { day: 'numeric', month: 'short', year: 'numeric' })}</span>
      </div>
    </div>
  )
}


// Days other batches already occupy (registration start .. interview end) can never be picked, and a
// batch cannot stretch across the next one. Returns the blocked ranges plus per-field min / max.
function dateRules(form, otherBatches) {
  const blocked = otherBatches.map((batch) => ({ start: batch.registration_start, end: batch.interview_end, name: batch.name }))
  const { registration_start: rs, registration_end: re, interview_start: is, interview_end: ie } = form
  const valid = (value) => isValidDate(value)
  const nextStart = valid(rs) ? otherBatches.map((batch) => batch.registration_start).filter((start) => start > rs).sort()[0] : undefined
  const ceiling = nextStart ? addBatchDays(nextStart, -1) : ''
  const previousEnd = valid(ie) ? otherBatches.map((batch) => batch.interview_end).filter((end) => end < ie).sort().pop() : undefined
  const floor = previousEnd ? addBatchDays(previousEnd, 1) : ''
  const earliest = (...values) => values.filter(Boolean).sort()[0] || ''
  const latest = (...values) => values.filter(Boolean).sort().pop() || ''
  return {
    blocked,
    registration_start: { min: floor, max: earliest(valid(re) ? re : '', valid(is) ? addBatchDays(is, -1) : '', valid(ie) ? addBatchDays(ie, -2) : '') },
    registration_end: { min: latest(valid(rs) ? rs : '', floor), max: earliest(valid(is) ? addBatchDays(is, -1) : '', ceiling) },
    interview_start: { min: latest(valid(re) ? addBatchDays(re, 1) : '', valid(rs) ? addBatchDays(rs, 1) : '', floor), max: earliest(valid(ie) ? ie : '', ceiling) },
    interview_end: { min: latest(valid(is) ? is : '', valid(re) ? addBatchDays(re, 1) : '', valid(rs) ? addBatchDays(rs, 1) : '', floor), max: ceiling },
  }
}

function TreeCheck({ state }) {
  return (
    <span aria-hidden="true" className={`batch-tree-check is-${state}`}>
      {state === 'on' && <Check size={11} strokeWidth={3.4} />}
      {state === 'mid' && <Minus size={11} strokeWidth={3.4} />}
    </span>
  )
}

const BUREAU_LABEL = { biro: 'BIRO', bengkel: 'BENGKEL' }

function UnitTree({ bureaus, departments, divisions, form, onChange, query }) {
  const [collapsed, setCollapsed] = useState(() => new Set())
  const needle = query.trim().toLowerCase()
  const departmentIds = useMemo(() => new Set(form.department_ids), [form.department_ids])
  const bureauIds = useMemo(() => new Set(form.bureau_ids), [form.bureau_ids])

  const tree = useMemo(() => divisions.map((division) => {
    const divisionMatch = !needle || division.name.toLowerCase().includes(needle)
    const children = departments.filter((department) => department.division_id === division.id).map((department) => {
      const departmentMatch = divisionMatch || department.name.toLowerCase().includes(needle)
      const items = bureaus.filter((bureau) => bureau.department_id === department.id)
      const visible = departmentMatch ? items : items.filter((bureau) => bureau.name.toLowerCase().includes(needle))
      return { department, bureaus: items, visibleBureaus: visible, show: departmentMatch || visible.length > 0 }
    }).filter((entry) => entry.show)
    return { division, departments: children }
  }).filter((entry) => entry.departments.length), [bureaus, departments, divisions, needle])

  function update(nextDepartments, nextBureaus) {
    onChange({ department_ids: [...nextDepartments], bureau_ids: [...nextBureaus] })
  }
  function toggleDepartment(department, items, checked) {
    const nextDepartments = new Set(departmentIds)
    const nextBureaus = new Set(bureauIds)
    if (checked) nextDepartments.add(department.id)
    else nextDepartments.delete(department.id)
    // A whole department already covers every biro / bengkel under it.
    items.forEach((bureau) => nextBureaus.delete(bureau.id))
    update(nextDepartments, nextBureaus)
  }
  function toggleBureau(department, items, bureau, checked) {
    const nextDepartments = new Set(departmentIds)
    const nextBureaus = new Set(bureauIds)
    if (departmentIds.has(department.id)) {
      // Unticking one unit under an opened department: keep the others open one by one.
      nextDepartments.delete(department.id)
      items.forEach((item) => nextBureaus.add(item.id))
    }
    if (checked) nextBureaus.add(bureau.id)
    else nextBureaus.delete(bureau.id)
    update(nextDepartments, nextBureaus)
  }
  function toggleDivision(entry, checked) {
    const nextDepartments = new Set(departmentIds)
    const nextBureaus = new Set(bureauIds)
    entry.departments.forEach(({ department, bureaus: items }) => {
      if (checked) nextDepartments.add(department.id)
      else nextDepartments.delete(department.id)
      items.forEach((bureau) => nextBureaus.delete(bureau.id))
    })
    update(nextDepartments, nextBureaus)
  }
  function toggleCollapsed(id) {
    setCollapsed((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  if (!tree.length) return <p className="batch-tree-empty">Tidak ada unit kerja yang cocok dengan pencarian.</p>
  return (
    <div className="batch-tree" role="tree">
      {tree.map((entry) => {
        const isOpen = ({ department, bureaus: items }) => departmentIds.has(department.id) || items.some((bureau) => bureauIds.has(bureau.id))
        const allDepartmentsOpen = entry.departments.every(({ department }) => departmentIds.has(department.id))
        const openCount = entry.departments.filter(isOpen).length
        const divisionState = allDepartmentsOpen ? 'on' : openCount > 0 ? 'mid' : 'off'
        const isCollapsed = !needle && collapsed.has(entry.division.id)
        return (
          <div className="batch-tree-group" key={entry.division.id}>
            <div aria-expanded={!isCollapsed} className={`batch-tree-row is-level-1${divisionState !== 'off' ? ' is-selected' : ''}`} role="treeitem">
              <button aria-label={isCollapsed ? 'Buka' : 'Ciutkan'} className="batch-tree-toggle" onClick={() => toggleCollapsed(entry.division.id)} type="button">
                {isCollapsed ? <ChevronRight aria-hidden="true" size={15} /> : <ChevronDown aria-hidden="true" size={15} />}
              </button>
              <label>
                <input checked={divisionState === 'on'} onChange={(event) => toggleDivision(entry, event.target.checked)} ref={(node) => { if (node) node.indeterminate = divisionState === 'mid' }} type="checkbox" />
                <TreeCheck state={divisionState} />
                <span className="batch-tree-level is-division">DIVISI</span>
                <span className="batch-tree-name">{entry.division.name}</span>
              </label>
              <span className="batch-tree-count">{openCount} dari {entry.departments.length} departemen</span>
            </div>
            {!isCollapsed && entry.departments.map(({ department, bureaus: items, visibleBureaus }) => {
              const wholeDepartment = departmentIds.has(department.id)
              const someBureaus = items.some((bureau) => bureauIds.has(bureau.id))
              const departmentState = wholeDepartment ? 'on' : someBureaus ? 'mid' : 'off'
              return (
                <div key={department.id}>
                  <div className={`batch-tree-row is-level-2${departmentState !== 'off' ? ' is-selected' : ''}`} role="treeitem">
                    <label>
                      <input checked={wholeDepartment} onChange={(event) => toggleDepartment(department, items, event.target.checked)} ref={(node) => { if (node) node.indeterminate = departmentState === 'mid' }} type="checkbox" />
                      <TreeCheck state={departmentState} />
                      <span className="batch-tree-level is-department">DEPARTEMEN</span>
                      <span className="batch-tree-name">{department.name}</span>
                    </label>
                    {items.length > 0 && <span className="batch-tree-count">{items.length} unit</span>}
                  </div>
                  {visibleBureaus.map((bureau) => {
                    const checked = wholeDepartment || bureauIds.has(bureau.id)
                    return (
                      <div className={`batch-tree-row is-level-3${checked ? ' is-selected' : ''}`} key={bureau.id} role="treeitem">
                        <label>
                          <input checked={checked} onChange={(event) => toggleBureau(department, items, bureau, event.target.checked)} type="checkbox" />
                          <TreeCheck state={checked ? 'on' : 'off'} />
                          <span className={`batch-tree-level is-${bureau.unit_type === 'bengkel' ? 'bengkel' : 'biro'}`}>{BUREAU_LABEL[bureau.unit_type] || 'BIRO'}</span>
                          <span className="batch-tree-name">{bureau.name}</span>
                        </label>
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}

function describeUnits(batch) {
  if (batch.all_units) return 'Semua unit kerja'
  const parts = []
  if (batch.department_ids.length) parts.push(`${batch.department_ids.length} departemen`)
  if (batch.bureau_ids?.length) parts.push(`${batch.bureau_ids.length} biro / bengkel`)
  return parts.join(' + ') || '-'
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
  const rules = useMemo(() => (form ? dateRules(form, batches.filter((batch) => batch.id !== editingId)) : null), [batches, editingId, form])
  const newestFirst = useMemo(() => [...batches].reverse(), [batches])
  const { items: pageBatches, page, setPage } = useAdminPagination(newestFirst)
  const divisions = organizationQuery.data?.divisions ?? []
  const departments = organizationQuery.data?.departments ?? []
  const bureaus = organizationQuery.data?.bureaus ?? []
  const [unitQuery, setUnitQuery] = useState('')

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
    setUnitQuery('')
  }
  function openEdit(batch) {
    if (batchPhase(batch, today) === 'finished') return
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
      bureau_ids: batch.bureau_ids ?? [],
    })
    setUnitQuery('')
  }
  function closeForm() {
    setForm(null)
    setEditingId(null)
    setError('')
  }
  function setField(field, value) {
    setForm((current) => ({ ...current, [field]: value }))
  }
  function setUnits(patch) {
    setForm((current) => ({ ...current, ...patch }))
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
        bureau_ids: form.all_units ? [] : form.bureau_ids,
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
        <div className="admin-batch-body">
          <div className="batch-table-card">
            <div className="admin-table-scroll">
              <table className="admin-table batch-table">
                <thead>
                  <tr><th>BATCH</th><th>PENDAFTARAN</th><th>SELEKSI &amp; WAWANCARA</th><th>UNIT KERJA AKTIF</th><th>BATAS LAMARAN</th><th>LAMARAN</th><th className="admin-actions-head">AKSI</th></tr>
                </thead>
                <tbody>
                  {pageBatches.map((batch) => {
                    const phase = batchPhase(batch, today)
                    return (
                      <tr className={`is-${phase}`} key={batch.id}>
                        <td>
                          <span className="batch-name">{batch.name}<span className={`admin-batch-phase is-${phase}`}>{batchPhaseLabels[phase]}</span></span>
                        </td>
                        <td>{formatBatchRange(batch.registration_start, batch.registration_end)}</td>
                        <td>{formatBatchRange(batch.interview_start, batch.interview_end)}</td>
                        <td>{describeUnits(batch)}</td>
                        <td>{batch.max_applications === null ? 'Tidak dibatasi' : `${batch.max_applications} lamaran`}</td>
                        <td>{batch.application_count}</td>
                        <td className="admin-row-actions">
                          <button
                            aria-label={`Ubah ${batch.name}`}
                            className="admin-small-button admin-icon-button"
                            disabled={phase === 'finished'}
                            onClick={() => openEdit(batch)}
                            title={phase === 'finished' ? 'Batch yang sudah selesai tidak dapat diubah' : `Ubah ${batch.name}`}
                            type="button"
                          >{phase === 'finished' ? <Lock aria-hidden="true" size={15} /> : <Pencil aria-hidden="true" size={15} />}</button>
                          <button
                            aria-label={`Hapus ${batch.name}`}
                            className="admin-small-button admin-icon-button danger"
                            disabled={batch.application_count > 0}
                            onClick={() => { setError(''); setDeleting(batch) }}
                            title={batch.application_count > 0 ? 'Batch yang sudah memiliki lamaran tidak dapat dihapus' : 'Hapus batch'}
                            type="button"
                          ><Trash2 aria-hidden="true" size={14} /></button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <AdminTablePagination onPageChange={setPage} page={page} total={batches.length} />
          </div>
        </div>
      )}
      <SuccessPopup message={notice} onClose={setNotice} />
      {form && (
        <AdminFormDialog className="admin-batch-modal" description="Atur jadwal, batas lamaran, dan unit kerja yang dibuka" fullScreen onClose={closeForm} title={editingId ? 'Ubah batch' : 'Tambah batch'}>
          <form className="batch-form" onSubmit={submit}>
            <div className="batch-form-body">
              <div className="batch-form-grid">
                <div className="batch-col">
                  <label className="batch-field">
                    <span>Nama batch</span>
                    <input maxLength={80} onChange={(event) => setField('name', event.target.value)} placeholder="Contoh: Batch 2027" required value={form.name} />
                  </label>
                  <section className="batch-card">
                    <h3><CalendarRange aria-hidden="true" size={15} /> Jadwal</h3>
                    <div className="batch-field-row">
                      <div className="batch-field"><span>Pendaftaran mulai</span><DateField ariaLabel="Pendaftaran mulai" blocked={rules.blocked} max={rules.registration_start.max} min={rules.registration_start.min} onChange={(day) => setField('registration_start', day)} value={form.registration_start} /></div>
                      <div className="batch-field"><span>Pendaftaran berakhir</span><DateField ariaLabel="Pendaftaran berakhir" blocked={rules.blocked} max={rules.registration_end.max} min={rules.registration_end.min} onChange={(day) => setField('registration_end', day)} value={form.registration_end} /></div>
                    </div>
                    <div className="batch-field-row">
                      <div className="batch-field"><span>Seleksi &amp; wawancara mulai</span><DateField ariaLabel="Seleksi dan wawancara mulai" blocked={rules.blocked} max={rules.interview_start.max} min={rules.interview_start.min} onChange={(day) => setField('interview_start', day)} value={form.interview_start} /></div>
                      <div className="batch-field"><span>Seleksi &amp; wawancara berakhir</span><DateField ariaLabel="Seleksi dan wawancara berakhir" blocked={rules.blocked} max={rules.interview_end.max} min={rules.interview_end.min} onChange={(day) => setField('interview_end', day)} value={form.interview_end} /></div>
                    </div>
                    <ScheduleTimeline form={form} />
                  </section>
                  <section className="batch-card">
                    <h3>Batas lamaran per pelamar <small>(opsional)</small></h3>
                    <label className="batch-field">
                      <input aria-label="Batas lamaran per pelamar" max={10000} min={1} onChange={(event) => setField('max_applications', event.target.value)} placeholder="Kosongkan jika tidak dibatasi" step={1} type="number" value={form.max_applications} />
                    </label>
                    <p className="batch-hint">Dihitung dari semua lamaran pelamar di batch ini, termasuk yang ditolak. Lamaran yang belum ditindaklanjuti sampai seleksi &amp; wawancara berakhir otomatis dianggap ditolak.</p>
                  </section>
                </div>
                <section className="batch-card batch-units-card">
                  <div className="batch-units-head">
                    <h3>Unit kerja yang dibuka</h3>
                    <div aria-label="Cakupan unit kerja" className="batch-segment" role="group">
                      <button className={form.all_units ? 'is-active' : ''} onClick={() => setField('all_units', true)} type="button">Semua unit</button>
                      <button className={!form.all_units ? 'is-active' : ''} onClick={() => setField('all_units', false)} type="button">Pilih manual</button>
                    </div>
                  </div>
                  {form.all_units ? (
                    <p className="batch-hint batch-units-all">Semua divisi, departemen, biro, dan bengkel dibuka, termasuk yang ditambahkan kemudian. Pilih &ldquo;Pilih manual&rdquo; untuk membatasi sampai tingkat biro atau bengkel.</p>
                  ) : (
                    <>
                      <label className="batch-search">
                        <Search aria-hidden="true" size={15} />
                        <input aria-label="Cari unit kerja" onChange={(event) => setUnitQuery(event.target.value)} placeholder="Cari divisi, departemen, biro, atau bengkel..." type="search" value={unitQuery} />
                        {unitQuery && <button aria-label="Hapus pencarian" onClick={() => setUnitQuery('')} type="button"><X aria-hidden="true" size={14} /></button>}
                      </label>
                      <div className="batch-units-summary">
                        <span className="batch-chip is-count">{form.department_ids.length} departemen &middot; {form.bureau_ids.length} biro / bengkel dipilih</span>
                        <button className="batch-chip" onClick={() => setUnits({ department_ids: departments.map((item) => item.id), bureau_ids: [] })} type="button">Pilih semua</button>
                        <button className="batch-chip" onClick={() => setUnits({ department_ids: [], bureau_ids: [] })} type="button">Kosongkan</button>
                      </div>
                      <UnitTree bureaus={bureaus} departments={departments} divisions={divisions} form={form} onChange={setUnits} query={unitQuery} />
                    </>
                  )}
                </section>
              </div>
              {error && <p className="admin-alert error" role="alert">{error}</p>}
            </div>
            <div className="batch-form-actions">
              <small>Perubahan berlaku setelah disimpan</small>
              <div>
                <button className="admin-small-button" onClick={closeForm} type="button">Batal</button>
                <button className="apply-button" disabled={saveMutation.isPending} type="submit">{saveMutation.isPending ? 'Menyimpan...' : 'Simpan batch'}</button>
              </div>
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
