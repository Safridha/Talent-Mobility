import { Building2, CalendarDays, Check, Circle, Clock3, FileText, X } from 'lucide-react'
import ModalBackdrop from '../../components/ModalBackdrop'
import { applicationStatusOptions, getApplicationStatusDescription } from '../applications/status'

const stages = [
  { value: 'submitted', label: 'Lamaran masuk', description: 'Lamaran berhasil dikirim.' },
  { value: 'screening', label: 'Seleksi', description: 'Tim meninjau kualifikasi dan dokumen.' },
  { value: 'interview', label: 'Wawancara', description: 'Tahap wawancara dengan tim terkait.' },
]

function formatDate(value, options) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Tanggal tidak tersedia' : date.toLocaleString('id-ID', options)
}

function stageState(stage, index, currentStatus, visitedStatuses) {
  if (stage.value === currentStatus || (
    stage.value === 'decision' && ['accepted', 'rejected'].includes(currentStatus)
  )) return 'current'
  if (visitedStatuses.has(stage.value)) return 'completed'
  if (stage.value === 'decision') {
    return 'upcoming'
  }
  const currentIndex = ['accepted', 'rejected'].includes(currentStatus)
    ? stages.length
    : stages.findIndex((item) => item.value === currentStatus)
  return currentIndex > index ? 'skipped' : 'upcoming'
}

export default function ApplicantApplicationProgress({ application, job, onClose }) {
  const currentStatus = application.status
  const currentStatusLabel = applicationStatusOptions.find((item) => item.value === currentStatus)?.label || currentStatus
  const history = Array.isArray(application.status_history) ? application.status_history : []
  const visitedStatuses = new Set(['submitted', ...history.map((item) => item.status)])
  const decisionStage = {
    value: 'decision',
    label: currentStatus === 'accepted' || currentStatus === 'rejected' ? currentStatusLabel : 'Keputusan akhir',
    description: currentStatus === 'accepted'
      ? 'Lamaran Anda diterima.'
      : currentStatus === 'rejected'
        ? 'Lamaran belum dapat dilanjutkan untuk posisi ini.'
        : 'Menunggu keputusan akhir dari tim Human Capital.',
  }
  const progressStages = [...stages, decisionStage]

  return (
    <ModalBackdrop className="modal-backdrop application-progress-backdrop" onDismiss={onClose}>
      <section
        aria-labelledby="application-progress-title"
        aria-modal="true"
        className="detail-modal application-progress-modal"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <header className="application-progress-header">
          <div className="application-progress-heading">
            <span><FileText aria-hidden="true" size={16} /> Perkembangan lamaran</span>
            <button aria-label="Tutup perkembangan lamaran" className="icon-button" onClick={onClose} type="button">
              <X size={20} />
            </button>
          </div>
          <h2 id="application-progress-title">{job?.title || 'Detail lamaran'}</h2>
          <div className="application-progress-current">
            <span>Status saat ini</span>
            <strong className={`status-pill status-${currentStatus}`}>{currentStatusLabel}</strong>
          </div>
          <p>{getApplicationStatusDescription(currentStatus) || 'Status lamaran sedang diperbarui.'}</p>
        </header>

        <div className="application-progress-content">
          <section aria-label="Informasi lamaran" className="application-progress-summary">
            <h3>Informasi lamaran</h3>
            <dl>
              <div>
                <dt><CalendarDays aria-hidden="true" size={14} /> Tanggal melamar</dt>
                <dd>{formatDate(application.created_at, { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</dd>
              </div>
              {job?.division && <div><dt><Building2 aria-hidden="true" size={14} /> Divisi</dt><dd>{job.division}</dd></div>}
              {job?.department && <div><dt>Departemen</dt><dd>{job.department}</dd></div>}
              {job?.unit && <div><dt>Unit</dt><dd>{job.unit}</dd></div>}
              <div><dt>ID posisi</dt><dd>{application.job_id}</dd></div>
              <div><dt>ID lamaran</dt><dd>{application.id}</dd></div>
            </dl>
          </section>

          <aside aria-label="Tahapan seleksi" className="application-progress-sidebar">
            <h3>Tahapan seleksi</h3>
            <ol>
              {progressStages.map((stage, index) => {
                const state = stageState(stage, index, currentStatus, visitedStatuses)
                const historyStatus = stage.value === 'decision'
                  ? ['accepted', 'rejected'].includes(currentStatus) ? currentStatus : null
                  : stage.value
                const timestamp = [...history]
                  .reverse()
                  .find((item) => item.status === historyStatus)?.created_at
                return (
                  <li className={`application-progress-step is-${state}`} key={stage.value}>
                    <span aria-hidden="true" className="application-progress-indicator">
                      {state === 'completed' ? <Check size={14} /> : state === 'current' ? <Clock3 size={14} /> : state === 'skipped' ? <X size={13} /> : <Circle size={12} />}
                    </span>
                    <div>
                      <strong>{stage.label}</strong>
                      <p>{state === 'current' ? `Sedang berlangsung. ${stage.description}` : state === 'skipped' ? 'Tahap ini tidak dilalui.' : stage.description}</p>
                      {timestamp && <time dateTime={timestamp}>{formatDate(timestamp, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</time>}
                      {state === 'upcoming' && <span className="application-progress-upcoming"><Clock3 size={12} /> Menunggu</span>}
                    </div>
                  </li>
                )
              })}
            </ol>
          </aside>
        </div>

        <footer className="application-progress-footer">
          <span>Status terakhir: <strong>{currentStatusLabel}</strong></span>
          <button className="detail-button" onClick={onClose} type="button">Tutup</button>
        </footer>
      </section>
    </ModalBackdrop>
  )
}
