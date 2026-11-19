import { useEffect, useRef, useState } from 'react'
import { Minus, Plus } from 'lucide-react'
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'
import { PdfLoadingBar, PdfSkeletonPage } from './PdfLoading'

// Phones (notably Chrome on Android) cannot show a PDF inside the page, so the preview renders
// the pages itself with pdf.js. This file is loaded lazily, only when a mobile admin opens a preview.
const ZOOM_STEPS = [1, 1.5, 2, 3]
const MAX_CANVAS_WIDTH = 2400
const MAX_PAGE_WIDTH = 900

export default function PdfJsViewer({ blob }) {
  const scrollRef = useRef(null)
  const pagesRef = useRef(null)
  const [pdf, setPdf] = useState(null)
  const [zoomIndex, setZoomIndex] = useState(0)
  const [renderedPages, setRenderedPages] = useState(0)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    let loadingTask = null
    async function load() {
      try {
        const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
        pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
        const data = new Uint8Array(await blob.arrayBuffer())
        loadingTask = pdfjs.getDocument({ data })
        const loaded = await loadingTask.promise
        if (cancelled) {
          void loaded.destroy()
          return
        }
        setPdf(loaded)
      } catch {
        if (!cancelled) setError('Dokumen tidak dapat ditampilkan. Gunakan tombol Unduh untuk membukanya.')
      }
    }
    void load()
    return () => {
      cancelled = true
      void loadingTask?.destroy()
    }
  }, [blob])

  useEffect(() => {
    if (!pdf || !pagesRef.current || !scrollRef.current) return undefined
    const container = pagesRef.current
    const zoom = ZOOM_STEPS[zoomIndex]
    // Full-screen on a wide desktop would otherwise stretch one page across the whole monitor.
    const availableWidth = Math.min(MAX_PAGE_WIDTH, Math.max(200, scrollRef.current.clientWidth - 24))
    let cancelled = false
    let currentTask = null
    container.replaceChildren()

    async function renderPages() {
      try {
        for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
          const page = await pdf.getPage(pageNumber)
          if (cancelled) return
          const base = page.getViewport({ scale: 1 })
          const cssWidth = availableWidth * zoom
          const cssScale = cssWidth / base.width
          // Sharp on high-density screens, but capped so a zoomed page never needs a huge canvas.
          const outputScale = Math.min(window.devicePixelRatio || 1, 2, MAX_CANVAS_WIDTH / cssWidth)
          const viewport = page.getViewport({ scale: cssScale * outputScale })
          const canvas = document.createElement('canvas')
          canvas.className = 'pdf-viewer-page'
          canvas.width = Math.floor(viewport.width)
          canvas.height = Math.floor(viewport.height)
          canvas.style.width = `${cssWidth}px`
          canvas.style.height = `${base.height * cssScale}px`
          canvas.setAttribute('role', 'img')
          canvas.setAttribute('aria-label', `Halaman ${pageNumber} dari ${pdf.numPages}`)
          container.append(canvas)
          currentTask = page.render({ canvas, viewport })
          await currentTask.promise
          if (cancelled) return
          page.cleanup()
          setRenderedPages(pageNumber)
        }
      } catch (renderError) {
        if (cancelled || renderError?.name === 'RenderingCancelledException') return
        setError('Sebagian halaman tidak dapat ditampilkan. Gunakan tombol Unduh untuk membuka dokumen.')
      }
    }
    void renderPages()
    return () => {
      cancelled = true
      currentTask?.cancel()
      // iOS Safari keeps canvas bitmaps alive after unmount; zeroing them frees the memory so
      // closing the preview does not leave the page blank.
      container.querySelectorAll('canvas').forEach((canvas) => { canvas.width = 0; canvas.height = 0 })
      container.replaceChildren()
    }
  }, [pdf, zoomIndex])

  useEffect(() => () => { void pdf?.destroy() }, [pdf])

  function changeZoom(step) {
    const next = Math.min(ZOOM_STEPS.length - 1, Math.max(0, zoomIndex + step))
    if (next === zoomIndex) return
    setRenderedPages(0)
    setZoomIndex(next)
  }

  const totalPages = pdf?.numPages ?? 0
  const isRendering = Boolean(pdf) && renderedPages < totalPages && !error

  return (
    <div className="pdf-viewer">
      <div className="pdf-viewer-toolbar">
        <button aria-label="Perkecil" className="pdf-viewer-zoom" disabled={zoomIndex === 0} onClick={() => changeZoom(-1)} type="button"><Minus aria-hidden="true" size={16} /></button>
        <span aria-live="polite">{Math.round(ZOOM_STEPS[zoomIndex] * 100)}%</span>
        <button aria-label="Perbesar" className="pdf-viewer-zoom" disabled={zoomIndex === ZOOM_STEPS.length - 1} onClick={() => changeZoom(1)} type="button"><Plus aria-hidden="true" size={16} /></button>
        <small>
          {!pdf ? 'Memuat dokumen...' : isRendering ? `Memuat halaman ${renderedPages + 1} dari ${totalPages}` : `${totalPages} halaman`}
        </small>
      </div>
      {(!pdf || isRendering) && !error && (
        <PdfLoadingBar label="Memuat halaman" value={pdf ? renderedPages / totalPages : null} />
      )}
      {error && <p className="pdf-preview-message" role="alert">{error}</p>}
      <div className="pdf-viewer-scroll" ref={scrollRef}>
        {renderedPages === 0 && !error && (
          <div className="pdf-viewer-skeleton"><PdfSkeletonPage /></div>
        )}
        <div className="pdf-viewer-pages" ref={pagesRef} />
      </div>
    </div>
  )
}
