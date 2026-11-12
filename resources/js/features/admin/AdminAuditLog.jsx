import { useEffect, useMemo, useState } from 'react'
import { apiRequest } from '../../api'
import { AdminTableToolbar } from './AdminPrimitives'
import { AdminTablePagination } from './AdminPagination'
import { useAdminPagination } from './useAdminPagination'

const actionLabels = {
  create: 'Dibuat',
  update: 'Diubah',
  delete: 'Dihapus',
  activate: 'Diaktifkan',
  deactivate: 'Dinonaktifkan',
}

const entityLabels = {
  admin_account: 'Akun admin',
  applicant_account: 'Akun pelamar',
  division: 'Divisi',
  department: 'Departemen',
  bureau: 'Biro / bengkel',
  job_type: 'Jenis pekerjaan',
  employee: 'Direktori karyawan',
  application_limit: 'Batas lamaran',
}

export function AdminAuditLog() {
  const [events, setEvents] = useState([])
  const [nextBeforeId, setNextBeforeId] = useState(null)
  const [search, setSearch] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isLoadingMore, setIsLoadingMore] = useState(false)

  useEffect(() => {
    let active = true
    apiRequest('/admin/audit-log?limit=100')
      .then((response) => {
        if (!active) return
        setEvents(response.data)
        setNextBeforeId(response.next_before_id)
        setError('')
      })
      .catch((requestError) => {
        if (active) setError(requestError.message)
      })
      .finally(() => {
        if (active) setIsLoading(false)
      })
    return () => { active = false }
  }, [])

  async function loadMore() {
    if (!nextBeforeId || isLoadingMore) return
    setIsLoadingMore(true)
    setError('')
    try {
      const response = await apiRequest(
        `/admin/audit-log?limit=100&before_id=${encodeURIComponent(nextBeforeId)}`,
        {},
      )
      setEvents((current) => [...current, ...response.data])
      setNextBeforeId(response.next_before_id)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setIsLoadingMore(false)
    }
  }

  const filteredEvents = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('id')
    if (!query) return events
    return events.filter((event) => (
      `${event.actor_name || ''} ${event.actor_email || ''} ${event.action} ${event.entity_type} ${event.entity_id} ${JSON.stringify(event.details)}`
        .toLocaleLowerCase('id')
        .includes(query)
    ))
  }, [events, search])
  const { items: pageEvents, page, setPage } = useAdminPagination(filteredEvents)

  return (
    <section aria-label="Riwayat audit admin" className="admin-table-panel admin-audit-panel">
      <header className="admin-table-heading">
        <div>
          <span className="section-kicker">ADMINISTRASI</span>
          <h2>Riwayat Audit</h2>
          <p>Jejak perubahan akun, izin, dan data master. Kata sandi dan token tidak disimpan.</p>
        </div>
      </header>
      {error && <p className="admin-alert error" role="alert">{error}</p>}
      <AdminTableToolbar
        onPageChange={setPage}
        onSearchChange={setSearch}
        search={search}
        searchPlaceholder="Cari pelaku atau perubahan"
      />
      {isLoading ? (
        <div className="admin-loading">Memuat riwayat audit...</div>
      ) : filteredEvents.length ? (
        <div className="admin-table-scroll">
          <table className="admin-table">
            <thead>
              <tr><th>Waktu</th><th>Pelaku</th><th>Aksi</th><th>Data</th><th>Rincian</th></tr>
            </thead>
            <tbody>
              {pageEvents.map((event) => (
                <tr key={event.id}>
                  <td>{new Date(event.created_at).toLocaleString('id-ID')}</td>
                  <td>{event.actor_name || 'Akun tidak tersedia'}<span className="admin-table-subtext">{event.actor_email || `ID ${event.actor_admin_id ?? '-'}`}</span></td>
                  <td>{actionLabels[event.action] || event.action}</td>
                  <td>{entityLabels[event.entity_type] || event.entity_type}<span className="admin-table-subtext">ID {event.entity_id}</span></td>
                  <td><pre className="admin-audit-details">{JSON.stringify(event.details, null, 2)}</pre></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="admin-loading">{events.length ? 'Tidak ada catatan yang cocok.' : 'Belum ada catatan audit.'}</div>
      )}
      {!isLoading && (
        <AdminTablePagination onPageChange={setPage} page={page} total={filteredEvents.length} />
      )}
      {nextBeforeId && (
        <div className="admin-audit-load-more">
          <button className="admin-small-button" disabled={isLoadingMore} onClick={() => void loadMore()} type="button">
            {isLoadingMore ? 'Memuat...' : 'Muat catatan lebih lama'}
          </button>
        </div>
      )}
    </section>
  )
}
