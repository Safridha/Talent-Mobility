import { useState } from 'react'
import { Download, FileText, Save, X } from 'lucide-react'
import { apiDownload } from '../../api'
import ModalBackdrop from '../../components/ModalBackdrop'
import { getAvailableApplicationStatuses } from '../applications/status'

export function ApplicationReview({
  application,
  onClose,
  onSave,
  isSaving,
  sessionToken,
  canChangeStatus = true,
  canDownloadDocuments = true,
}) {
  const [status, setStatus] = useState(application.status)
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const [downloadingDocumentId, setDownloadingDocumentId] = useState(null)

  async function downloadDocument(file) {
    setError('')
    setDownloadingDocumentId(file.id)
    try {
      const blob = await apiDownload(
        `/admin/applications/${application.id}/documents/${file.id}`,
        { token: sessionToken },
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
        <div className="modal-heading">
          <span className="division-tag"><FileText size={14} /> Detail lamaran</span>
          <button aria-label="Tutup detail lamaran" className="icon-button" onClick={onClose} type="button"><X size={20} /></button>
        </div>
        <h2 id="application-review-title">{application.job_title}</h2>
        <dl className="application-detail-list">
          <div><dt>Nama sesuai ID</dt><dd>{application.applicant_name}</dd></div>
          <div><dt>Email</dt><dd><a href={`mailto:${application.applicant_email}`}>{application.applicant_email}</a></dd></div>
          {application.employee_number ? (
            <>
              <div><dt>NIP</dt><dd>{application.employee_number}</dd></div>
              <div><dt>Divisi asal</dt><dd>{application.origin_division}</dd></div>
              <div><dt>Departemen / unit asal</dt><dd>{application.origin_unit}</dd></div>
              <div><dt>Pendidikan</dt><dd>{application.education_level}</dd></div>
              <div><dt>Jurusan</dt><dd>{application.study_field}</dd></div>
            </>
          ) : (
            <>
              <div><dt>Nomor HP</dt><dd>{application.phone_number || 'Belum diisi'}</dd></div>
              <div><dt>Posisi saat ini</dt><dd>{application.current_position || 'Belum diisi'}</dd></div>
              <div><dt>Unit / divisi</dt><dd>{application.current_unit || 'Belum diisi'}</dd></div>
            </>
          )}
          <div><dt>Kode posisi</dt><dd>{application.job_id}</dd></div>
          <div><dt>Dikirim</dt><dd>{application.created_at}</dd></div>
        </dl>
        <section className="application-review-motivation">
          <h3>Motivasi &amp; rencana kontribusi</h3>
          <p>{application.motivation || 'Belum diisi.'}</p>
        </section>
        <section className="application-review-documents">
          <h3>Dokumen lamaran</h3>
          {application.documents.length ? application.documents.map((file) => (
            <div className="application-document-row" key={file.id}>
              <span>{({
                cv: 'CV',
                cover_letter: 'Surat pengantar',
                certificate: 'Sertifikat pendukung',
                supporting_document: 'Berkas pendukung',
              })[file.document_type] || 'Dokumen'} <small>{file.file_name}</small></span>
              {canDownloadDocuments && <button
                className="admin-small-button"
                disabled={downloadingDocumentId === file.id}
                onClick={() => void downloadDocument(file)}
                type="button"
              >
                <Download size={15} /> {downloadingDocumentId === file.id ? 'Mengunduh...' : 'Unduh'}
              </button>}
            </div>
          )) : <p className="application-document-empty">Belum ada dokumen.</p>}
        </section>
        {canChangeStatus ? (
          <>
            <label className="application-status-select">Status proses
              <select onChange={(event) => setStatus(event.target.value)} value={status}>
                {getAvailableApplicationStatuses(application.status).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
            {status !== application.status && (
          <label className="application-status-select">Alasan perubahan status{status === 'rejected' ? ' (wajib)' : ' (opsional)'}
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
          </>
        ) : <p className="application-document-empty">Akun ini hanya dapat melihat lamaran.</p>}
        {error && <p className="login-error" role="alert">{error}</p>}
        <div className="detail-actions">
          <button className="detail-button" onClick={onClose} type="button">Tutup</button>
          {canChangeStatus && <button className="apply-button" disabled={isSaving || status === application.status} onClick={handleSave} type="button">
            <Save size={16} /> {isSaving ? 'Menyimpan...' : 'Simpan status'}
          </button>}
        </div>
      </section>
    </ModalBackdrop>
  )
}
