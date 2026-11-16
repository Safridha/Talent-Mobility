import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ChevronDown, Download, FileArchive, FileText, Table2 } from 'lucide-react'

const MENU_WIDTH = 280
const DOCUMENT_TYPE_LABELS = {
  cv: 'CV',
  cover_letter: 'Surat pengantar',
  certificate: 'Sertifikat pendukung',
  supporting_document: 'Berkas pendukung',
}

function formatFileSize(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * "Unduh" split-style menu for one application row.
 * - Always offers the applicant data PDF.
 * - With download permission and exactly one file: a single "CV/berkas" item (one click, no list).
 * - With several files: the list of files (loaded when the menu opens) plus "Semua berkas (.zip)".
 * The menu is positioned with `position: fixed` so the scrolling table wrapper cannot clip it.
 */
export function ApplicationDownloadMenu({
  application,
  canDownloadDocuments,
  isBusy,
  loadDocuments,
  onDownloadData,
  onDownloadArchive,
  onDownloadDocument,
  onDownloadPrimary,
}) {
  const filesCount = Number(application.documents_count) || 0
  const showFileList = canDownloadDocuments && filesCount > 1
  const [isOpen, setIsOpen] = useState(false)
  const [position, setPosition] = useState({ top: 0, left: 0 })
  const [documents, setDocuments] = useState(null)
  const [loadError, setLoadError] = useState('')
  const triggerRef = useRef(null)
  const menuRef = useRef(null)

  const close = useCallback(() => setIsOpen(false), [])

  useLayoutEffect(() => {
    if (!isOpen || !triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    const menuHeight = menuRef.current?.offsetHeight || 0
    const left = Math.min(Math.max(8, rect.right - MENU_WIDTH), Math.max(8, window.innerWidth - MENU_WIDTH - 8))
    const opensUpwards = menuHeight > 0 && rect.bottom + 6 + menuHeight > window.innerHeight - 8 && rect.top - 6 - menuHeight > 8
    setPosition({ top: opensUpwards ? rect.top - 6 - menuHeight : rect.bottom + 6, left })
  }, [isOpen, documents, loadError])

  useEffect(() => {
    if (!isOpen) return undefined
    function onPointerDown(event) {
      if (menuRef.current?.contains(event.target) || triggerRef.current?.contains(event.target)) return
      close()
    }
    function onKeyDown(event) {
      if (event.key === 'Escape') {
        close()
        triggerRef.current?.focus()
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    window.addEventListener('resize', close)
    window.addEventListener('scroll', close, true)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('resize', close)
      window.removeEventListener('scroll', close, true)
    }
  }, [isOpen, close])

  function toggleMenu() {
    const willOpen = !isOpen
    setIsOpen(willOpen)
    // The file list is only fetched when the menu is opened (and again after a failed attempt).
    if (willOpen && showFileList && !documents) {
      setLoadError('')
      loadDocuments(application)
        .then(setDocuments)
        .catch((error) => setLoadError(error.message || 'Daftar berkas belum dapat dimuat.'))
    }
  }

  function run(action) {
    close()
    void action()
  }

  return (
    <>
      <button
        aria-expanded={isOpen}
        aria-haspopup="menu"
        aria-label={`Unduh untuk ${application.applicant_name}`}
        className="admin-small-button application-download-trigger"
        disabled={isBusy}
        onClick={toggleMenu}
        ref={triggerRef}
        type="button"
      >
        <Download aria-hidden="true" size={14} />
        {isBusy ? 'Menyiapkan...' : 'Unduh'}
        <ChevronDown aria-hidden="true" className="application-download-chevron" size={14} />
      </button>
      {isOpen && (
        <div
          className="application-download-menu"
          ref={menuRef}
          role="menu"
          style={{ top: position.top, left: position.left, width: MENU_WIDTH }}
        >
          <button className="application-download-item" onClick={() => run(() => onDownloadData(application))} role="menuitem" type="button">
            <Table2 aria-hidden="true" size={16} />
            <span><strong>Data pelamar</strong><small>Ringkasan lamaran (PDF)</small></span>
          </button>
          {canDownloadDocuments && filesCount === 1 && (
            <button className="application-download-item" onClick={() => run(() => onDownloadPrimary(application))} role="menuitem" type="button">
              <FileText aria-hidden="true" size={16} />
              <span><strong>CV/berkas</strong><small>1 berkas (PDF)</small></span>
            </button>
          )}
          {showFileList && (
            <>
              <div aria-hidden="true" className="application-download-divider" />
              <button className="application-download-item" onClick={() => run(() => onDownloadArchive(application))} role="menuitem" type="button">
                <FileArchive aria-hidden="true" size={16} />
                <span><strong>Semua berkas (.zip)</strong><small>{filesCount} berkas dalam satu arsip</small></span>
              </button>
              <p className="application-download-heading">Berkas ({filesCount})</p>
              {loadError ? (
                <p className="application-download-note" role="alert">{loadError}</p>
              ) : !documents ? (
                <p className="application-download-note">Memuat daftar berkas...</p>
              ) : documents.map((file) => (
                <button
                  className="application-download-item"
                  key={file.id}
                  onClick={() => run(() => onDownloadDocument(application, file))}
                  role="menuitem"
                  type="button"
                >
                  <FileText aria-hidden="true" size={16} />
                  <span>
                    <strong>{DOCUMENT_TYPE_LABELS[file.document_type] || 'Dokumen'}</strong>
                    <small>{file.file_name}{formatFileSize(file.file_size) && ` · ${formatFileSize(file.file_size)}`}</small>
                  </span>
                </button>
              ))}
            </>
          )}
          {canDownloadDocuments && filesCount === 0 && (
            <p className="application-download-note">Belum ada berkas dokumen.</p>
          )}
        </div>
      )}
    </>
  )
}
