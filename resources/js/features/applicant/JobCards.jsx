import { ArrowRight, BriefcaseBusiness, Building2, CalendarDays, ChevronRight, GraduationCap, Info, List, MapPin, Users, Wrench, X } from 'lucide-react'
import ModalBackdrop from '../../components/ModalBackdrop'
import { getJobTargetLabels } from './jobTargetLabels'

function formatPostedDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(value || '')
  if (!match) return value
  const [, year, month, day, hour, minute] = match
  const date = new Date(Number(year), Number(month) - 1, Number(day), Number(hour || 0), Number(minute || 0))
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    ...(hour ? { hour: '2-digit', minute: '2-digit' } : {}),
  }).format(date)
}

export function JobDetail({ job, onClose, onApply, isApplying, hasApplied }) {
  return (
    <ModalBackdrop className="modal-backdrop job-detail-backdrop" onDismiss={onClose}>
      <section
        aria-labelledby="job-detail-title"
        aria-modal="true"
        className="detail-modal job-detail-modal"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <header className="job-detail-header">
          <div className="job-detail-heading-row">
            <div className="job-detail-badges">
              <span className="job-detail-code">{job.id}</span>
              <span>Kuota: {job.quota} Orang</span>
              <span className={`status-pill ${job.status}`}>{job.status.toUpperCase()}</span>
            </div>
            <button aria-label="Tutup detail" className="job-detail-close" onClick={onClose} type="button"><X size={21} /></button>
          </div>
          <h2 id="job-detail-title">{job.title}</h2>
          <div aria-label="Struktur organisasi" className="job-detail-breadcrumb">
            {getJobTargetLabels(job).map((label, index) => (
              <span className="job-detail-breadcrumb-item" key={`${label}-${index}`}>
                {index > 0 && <ChevronRight aria-hidden="true" size={16} />}
                {index === 0 ? <strong>{label}</strong> : label}
              </span>
            ))}
          </div>
          <div className="job-detail-meta">
            <span><MapPin size={15} />{job.location}</span>
            <span><BriefcaseBusiness size={15} />{job.type}</span>
            <span><CalendarDays size={15} />Tayang {formatPostedDate(job.posted)}</span>
          </div>
        </header>
        <div className="job-detail-body">
          <section className="job-detail-section">
            <h3>RINGKASAN TUGAS</h3>
            <p className="job-detail-summary">{job.summary}</p>
          </section>
          <section className="job-detail-section">
            <h3><List size={17} /> TANGGUNG JAWAB &amp; DESKRIPSI TUGAS</h3>
            {job.responsibilities?.length ? (
              <ul className="job-detail-list">
                {job.responsibilities.map((responsibility) => <li key={responsibility}>{responsibility}</li>)}
              </ul>
            ) : <p className="job-detail-empty">Deskripsi tugas akan diinformasikan oleh tim rekrutmen.</p>}
          </section>
          <section className="job-detail-section">
            <h3><GraduationCap size={18} /> SPESIFIKASI INTERNAL</h3>
            <p className="job-detail-summary">Kebutuhan pengalaman dan kompetensi yang relevan dengan pekerjaan di unit tujuan.</p>
            {job.skills?.length ? (
              <ul className="job-detail-list">
                {job.skills.map((specification) => <li key={specification}>{specification}</li>)}
              </ul>
            ) : <p className="job-detail-empty">Belum ada spesifikasi internal khusus untuk lowongan ini.</p>}
          </section>
          <aside className="job-detail-notice">
            <Info size={16} />
            <p>Proses mutasi memerlukan persetujuan atasan langsung (minimal setingkat Manager Departemen asal) setelah lolos seleksi berkas.</p>
          </aside>
        </div>
        <footer className="job-detail-footer">
          <button className="job-detail-dismiss" onClick={onClose} type="button">Tutup</button>
          <button className="apply-button job-detail-apply" disabled={isApplying || hasApplied || job.status !== 'open'} onClick={() => onApply(job)} type="button">
            {isApplying ? 'Mengirim...' : hasApplied ? 'Sudah mendaftar' : job.status !== 'open' ? 'Lowongan Ditutup' : 'Daftar Posisi Ini'}
            <ArrowRight size={17} />
          </button>
        </footer>
      </section>
    </ModalBackdrop>
  )
}

export function JobCard({ job, onSelect, onApply, isApplying, hasApplied }) {
  const isClosed = job.status !== 'open'
  return (
    <article className="job-card">
      <div className="card-top">
        <span className="division-tag"><Building2 size={14} /> {job.division}</span>
        <span className="quota-tag">Kuota: <strong>{job.quota}</strong></span>
      </div>
      <h2>{job.title}</h2>
      <div className="public-job-status">
        <span className={`status-pill ${job.status}`}>{job.status.toUpperCase()}</span>
      </div>
      <div className="job-organization">
        {job.target_level === 'division' ? (
          <span><Building2 size={15} />Posisi tingkat divisi</span>
        ) : job.target_level === 'secretariat' ? (
          <span><Building2 size={15} />Sekretariat — {job.unit}</span>
        ) : (
          <span><Users size={15} />{job.department}</span>
        )}
        {job.target_level === 'bureau' && <span><Wrench size={15} />{job.unit}</span>}
      </div>
      <div className="job-meta">
        <span><MapPin size={14} />{job.location}</span>
        <span><BriefcaseBusiness size={14} />{job.type}</span>
        <span><CalendarDays size={14} />Tayang {formatPostedDate(job.posted)}</span>
      </div>
      <p className="job-summary">{job.summary}</p>
      <div className="card-footer">
        <div className="card-actions">
          <button className="detail-button" onClick={() => onSelect(job)}>Detail <ChevronRight size={17} /></button>
          <button className="apply-button" disabled={isApplying || hasApplied || isClosed} onClick={() => onApply(job)}>
            {isApplying ? 'Mengirim...' : hasApplied ? 'Terkirim' : isClosed ? 'Ditutup' : 'Lamar'}
          </button>
        </div>
      </div>
    </article>
  )
}
