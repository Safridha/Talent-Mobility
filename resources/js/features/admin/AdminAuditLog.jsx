import { useEffect, useMemo, useState } from 'react'
import { apiRequest } from '../../api'
import { AdminTableToolbar } from './AdminPrimitives'

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
}

export function AdminAuditLog({ sessionToken }) {
  const [events, setEvents] = useState([])
  const [nextBeforeId, setNextBeforeId] = useState(null)
  const [search, setSearch] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isLoadingMore, setIsLoadingMore] = useState(false)

  useEffect(() => {
    let active = true
    apiRequest('/admin/audit-log?limit=100', { token: sessionToken })
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
  }, [sessionToken])

  async function loadMore() {
    if (!nextBeforeId || isLoadingMore) return
    setIsLoadingMore(true)
    setError('')
    try {
      const response = await apiRequest(
        `/admin/audit-log?limit=100&before_id=${encodeURIComponent(nextBeforeId)}`,
        { token: sessionToken },
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

  return (
    <section aria-label="Riwayat audit admin" className="admin-section">
      <header className="admin-section-heading">
        <div>
          <span className="admin-eyebrow">ADMINISTRASI</span>
          <h2>Riwayat Audit</h2>
          <p>Catatan perubahan akun, izin, dan data master. Kata sandi dan token tidak dicatat.</p>
        </div>
      </header>
      {error && <p className="login-error" role="alert">{error}</p>}
      <AdminTableToolbar
        onSearchChange={setSearch}
        resultCount={filteredEvents.length}
        search={search}
        searchPlaceholder="Cari pelaku atau perubahan"
        totalCount={events.length}
      />
      {isLoading ? (
        <div className="admin-loading">Memuat riwayat audit...</div>
      ) : filteredEvents.length ? (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr><th>Waktu</th><th>Pelaku</th><th>Aksi</th><th>Data</th><th>Rincian</th></tr>
            </thead>
            <tbody>
              {filteredEvents.map((event) => (
                <tr key={event.id}>
                  <td>{new Date(event.created_at).toLocaleString('id-ID')}</td>
                  <td>{event.actor_name || 'Akun tidak tersedia'}<span className="admin-table-subtext">{event.actor_email || `ID ${event.actor_admin_id ?? '—'}`}</span></td>
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
      {nextBeforeId && (
        <button className="admin-small-button" disabled={isLoadingMore} onClick={() => void loadMore()} type="button">
          {isLoadingMore ? 'Memuat...' : 'Muat catatan lebih lama'}
        </button>
      )}
    </section>
  )
}
