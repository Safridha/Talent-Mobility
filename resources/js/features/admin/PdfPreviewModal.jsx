import { Component, lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Download, FileText, X } from 'lucide-react'
import ModalBackdrop from '../../components/ModalBackdrop'
import { PdfLoadingPane } from './PdfLoading'

// pdf.js is only needed on phones, so it stays out of the admin bundle until then.
const PdfJsViewer = lazy(() => import('./PdfJsViewer'))

// Desktop browsers show PDFs natively inside an <iframe>; phones (and any browser without a built-in
// PDF viewer) get the pdf.js renderer instead.
function canUseNativePdfViewer() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  const isDesktopPointer = window.matchMedia('(min-width: 701px) and (pointer: fine)').matches
  return isDesktopPointer && window.navigator.pdfViewerEnabled !== false
}

/**
 * Pop-up preview of one PDF. `loadBlob` fetches the file with the admin's session (same permission and
 * unit scope as downloading it), so nothing is exposed through a public URL.
 */
// A failure inside the viewer must never take the whole page down with it.
class PreviewBoundary extends Component {
  state = { failed: false }

  static getDerivedStateFromError() { return { failed: true } }

  render() {
    if (this.state.failed) {
      return <p className="pdf-preview-message" role="alert">Dokumen tidak dapat ditampilkan. Gunakan tombol Unduh untuk membukanya.</p>
    }
    return this.props.children
  }
}

export function PdfPreviewModal({ title, fileName, loadBlob, onDownload, onClose }) {
  const [blob, setBlob] = useState(null)
  const [error, setError] = useState('')
  const [progress, setProgress] = useState(null)
  const [frameReady, setFrameReady] = useState(false)
  const closeButtonRef = useRef(null)
  const loadBlobRef = useRef(loadBlob)
  const useNative = useMemo(() => canUseNativePdfViewer(), [])

  // The file is fetched once per opened preview, whatever the parent re-renders do.
  useEffect(() => {
    let cancelled = false
    loadBlobRef.current(setProgress)
      .then((file) => { if (!cancelled) setBlob(file) })
      .catch((loadError) => { if (!cancelled) setError(loadError.message || 'Dokumen belum dapat dimuat.') })
    return () => { cancelled = true }
  }, [])

  const objectUrl = useMemo(() => (blob && useNative ? URL.createObjectURL(blob) : ''), [blob, useNative])
  useEffect(() => () => { if (objectUrl) URL.revokeObjectURL(objectUrl) }, [objectUrl])

  useEffect(() => {
    closeButtonRef.current?.focus()
    function onKeyDown(event) {
      if (event.key !== 'Escape') return
      event.stopPropagation()
      onClose()
    }
    document.addEventListener('keydown', onKeyDown, true)
    return () => document.removeEventListener('keydown', onKeyDown, true)
  }, [onClose])

  return createPortal(
    <ModalBackdrop className="pdf-preview-backdrop" onDismiss={onClose}>
      <section aria-label={`Pratinjau ${title}`} aria-modal="true" className="pdf-preview-dialog" role="dialog">
        <header className="pdf-preview-header">
          <span aria-hidden="true" className="pdf-preview-icon"><FileText size={18} /></span>
          <div className="pdf-preview-title">
            <strong>{title}</strong>
            <small>{fileName}</small>
          </div>
          <button className="admin-small-button pdf-preview-download" onClick={onDownload} type="button">
            <Download aria-hidden="true" size={15} /> <span>Unduh</span>
          </button>
          <button aria-label="Tutup pratinjau" className="icon-button" onClick={(event) => { event.preventDefault(); event.stopPropagation(); onClose() }} ref={closeButtonRef} type="button"><X size={20} /></button>
        </header>
        <div className="pdf-preview-body">
          {error ? (
            <p className="pdf-preview-message" role="alert">{error}</p>
          ) : (
            <>
              {!blob && <PdfLoadingPane label="Memuat dokumen" value={progress} />}
              {blob && useNative && !frameReady && <PdfLoadingPane label="Membuka dokumen" value={null} />}
              {blob && useNative && (
                <iframe className="pdf-preview-frame" onLoad={() => setFrameReady(true)} src={objectUrl} title={`Pratinjau ${fileName}`} />
              )}
              {blob && !useNative && (
                <PreviewBoundary>
                  <Suspense fallback={<PdfLoadingPane label="Menyiapkan penampil PDF" value={null} />}>
                    <PdfJsViewer blob={blob} />
                  </Suspense>
                </PreviewBoundary>
              )}
            </>
          )}
        </div>
      </section>
    </ModalBackdrop>,
    document.body,
  )
}
