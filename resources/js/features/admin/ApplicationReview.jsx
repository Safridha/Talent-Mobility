import { useState } from 'react'
import { Building2, CalendarDays, Download, FileText, Mail, MapPin, Paperclip, Save, UserRound, X } from 'lucide-react'
import { apiDownload } from '../../api'
import ModalBackdrop from '../../components/ModalBackdrop'
import SearchableSelect from '../../components/SearchableSelect'
import { applicationStatusOptions, getAvailableApplicationStatuses } from '../applications/status'

function formatFileSize(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function ApplicationReview({
  application,
  onClose,
  onSave,
  isSaving,
  canChangeStatus = true,
  canDownloadDocuments = true,
}) {
  const [status, setStatus] = useState(application.status)
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const [downloadingDocumentId, setDownloadingDocumentId] = useState(null)
  const documents = application.documents ?? []
  const statusLabel = applicationStatusOptions.find((option) => option.value === application.status)?.label || application.status
  const submittedAt = new Date(application.created_at)
  const submittedAtLabel = Number.isNaN(submittedAt.getTime())
    ? application.created_at
    : submittedAt.toLocaleString('id-ID', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })

  async function downloadDocument(file) {
    setError('')
    setDownloadingDocumentId(file.id)
    try {
      const blob = await apiDownload(
        `/admin/applications/${application.id}/documents/${file.id}`,
        {},
      )
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = file.file_name
      document.body.append(link)
      link.click()
      link.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (downloadError) {
      setError(downloadError.message)
    } finally {
      setDownloadingDocumentId(null)
    }
  }

  async function handleSave() {
    setError('')
    if (status === 'rejected' && !reason.trim()) {
      setError('Alasan wajib diisi saat status lamaran menjadi Ditolak.')
      return
    }
    try {
      await onSave(status, reason.trim())
      onClose()
    } catch (saveError) {
      setError(saveError.message)
    }
  }

  return (
    <ModalBackdrop onDismiss={onClose}>
      <section aria-labelledby="application-review-title" aria-modal="true" className="detail-modal application-review-modal" onClick={(event) => event.stopPropagation()} role="dialog">
        <header className="application-review-header">
          <div className="modal-heading">
            <span className="division-tag"><FileText size={14} /> Detail lamaran</span>
            <button aria-label="Tutup detail lamaran" className="icon-button" onClick={onClose} type="button"><X size={20} /></button>
          </div>
          <h2 id="application-review-title">{application.applicant_name}</h2>
          <p>Lamaran untuk <strong>{application.target_label || application.job_title}</strong>{application.applicant_email ? ` · ${application.applicant_email}` : ''}</p>
          <div className="application-review-summary">
            <span className={`status-pill status-${application.status}`}>{statusLabel}</span>
            <span><CalendarDays aria-hidden="true" size={15} /> {submittedAtLabel}</span>
            <span><Paperclip aria-hidden="true" size={15} /> {documents.length} dokumen</span>
          </div>
        </header>

        <div className="application-review-content">
          <section className="application-review-section application-review-details">
            <h3><UserRound aria-hidden="true" size={17} /> Informasi pelamar &amp; lamaran</h3>
            <div className="application-review-details-grid">
              <div>
                <h4>Kontak pelamar</h4>
                <dl className="application-detail-grid">
                  <div><dt>Nama</dt><dd>{application.applicant_name}</dd></div>
                  <div><dt>Email</dt><dd>{application.applicant_email ? <a href={`mailto:${application.applicant_email}`}><Mail aria-hidden="true" size={14} /> {application.applicant_email}</a> : 'Belum diisi'}</dd></div>
                  {application.employee_number && <div><dt>NIP</dt><dd>{application.employee_number}</dd></div>}
                </dl>
              </div>
              <div>
                <h4><Building2 aria-hidden="true" size={15} /> {application.employee_number ? 'Latar belakang kerja' : 'Pekerjaan saat ini'}</h4>
                <dl className="application-detail-grid">
                  {application.employee_number ? (
                    <>
                      <div><dt>Divisi</dt><dd>{application.origin_division || 'Belum diisi'}</dd></div>
                      <div className="application-detail-wide"><dt>Departemen / unit</dt><dd><MapPin aria-hidden="true" size={14} /> {application.origin_unit || 'Belum diisi'}</dd></div>
                    </>
                  ) : (
                    <>
                      <div><dt>Posisi</dt><dd>{application.current_position || 'Belum diisi'}</dd></div>
                      <div><dt>Unit / divisi</dt><dd>{application.current_unit || 'Belum diisi'}</dd></div>
                    </>
                  )}
                  {application.employee_number && (
                    <>
                      <div><dt>Pendidikan terakhir</dt><dd>{application.education_level || 'Belum diisi'}</dd></div>
                      <div><dt>Jurusan</dt><dd>{application.study_field || 'Belum diisi'}</dd></div>
                    </>
                  )}
                </dl>
              </div>
              <div className="application-review-detail-wide">
                <h4><FileText aria-hidden="true" size={15} /> Posisi yang dilamar</h4>
                <dl className="application-detail-grid">
                  {application.job_id && <div><dt>Jenis lamaran</dt><dd>Lowongan</dd></div>}
                  <div><dt>ID lamaran</dt><dd>{application.id}</dd></div>
                  {application.job_id && <div><dt>Kode posisi</dt><dd>{application.job_id}</dd></div>}
                  {!application.job_id && <div><dt>Unit tujuan</dt><dd>{application.target_label || application.job_title}</dd></div>}
                </dl>
                {!application.job_id && application.position_description && (
                  <p className="application-review-position-description">{application.position_description}</p>
                )}
              </div>
              <div className="application-review-detail-wide application-review-motivation">
                <h4>Motivasi &amp; rencana kontribusi</h4>
                <p>{application.motivation || 'Belum diisi.'}</p>
              </div>
            </div>
          </section>

          <section className="application-review-section application-review-followup">
            <div className="application-review-followup-grid">
              <div className="application-review-documents">
                <div className="application-review-section-heading">
                  <h3><Paperclip aria-hidden="true" size={17} /> Dokumen pendukung</h3>
                  <span>{documents.length} berkas</span>
                </div>
                {documents.length ? documents.map((file) => (
                  <div className="application-document-row" key={file.id}>
                    <span>{({
                      cv: 'CV',
                      cover_letter: 'Surat pengantar',
                      certificate: 'Sertifikat pendukung',
                      supporting_document: 'Berkas pendukung',
                    })[file.document_type] || 'Dokumen'} <small>{file.file_name}{formatFileSize(file.file_size) && ` · ${formatFileSize(file.file_size)}`}</small></span>
                    {canDownloadDocuments && <button
                      className="admin-small-button"
                      disabled={downloadingDocumentId === file.id}
                      onClick={() => void downloadDocument(file)}
                      type="button"
                    >
                      <Download size={15} /> {downloadingDocumentId === file.id ? 'Mengunduh...' : 'Unduh'}
                    </button>}
                  </div>
                )) : <p className="application-document-empty">Belum ada dokumen pendukung.</p>}
              </div>

              {canChangeStatus ? (
                <div className="application-review-status">
                  <h3>Perbarui tahap seleksi</h3>
                  <p className="application-review-help">Perubahan status akan diberitahukan kepada pelamar. Penolakan wajib disertai alasan.</p>
                  <label className="application-status-select">Status proses
                    <SearchableSelect
                      onChange={setStatus}
                      options={getAvailableApplicationStatuses(application.status)}
                      value={status}
                    />
                  </label>
                  {status !== application.status && (
                    <label className="application-status-select">Catatan untuk pelamar{status === 'rejected' ? ' (wajib)' : ' (opsional)'}
                      <textarea
                        maxLength={1000}
                        onChange={(event) => setReason(event.target.value)}
                        placeholder="Jelaskan alasan atau informasi untuk pelamar"
                        required={status === 'rejected'}
                        rows={3}
                        value={reason}
                      />
                    </label>
                  )}
                </div>
              ) : (
                <p className="application-review-readonly">Akun ini memiliki akses lihat saja; perubahan tahap seleksi tidak tersedia.</p>
              )}
            </div>
          </section>
          {error && <p className="login-error" role="alert">{error}</p>}
        </div>

        <footer className="detail-actions application-review-actions">
          <button className="detail-button" onClick={onClose} type="button">Tutup</button>
          {canChangeStatus && <button className="apply-button" disabled={isSaving || status === application.status} onClick={handleSave} type="button">
            <Save size={16} /> {isSaving ? 'Menyimpan...' : 'Simpan status'}
          </button>}
        </footer>
      </section>
    </ModalBackdrop>
  )
}
