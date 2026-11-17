/**
 * Loading feedback for the PDF preview: a thin progress bar (determinate when `value` is 0..1,
 * an animated sweep when it is null) and a skeleton of an A4 page.
 */
export function PdfLoadingBar({ value = null, label = 'Memuat dokumen' }) {
  const percent = value == null ? undefined : Math.round(Math.min(1, Math.max(0, value)) * 100)
  return (
    <div
      aria-label={label}
      aria-valuemax={100}
      aria-valuemin={0}
      aria-valuenow={percent}
      className="pdf-loading-bar"
      role="progressbar"
    >
      <span className={percent === undefined ? 'is-indeterminate' : ''} style={percent === undefined ? undefined : { width: `${percent}%` }} />
    </div>
  )
}

export function PdfSkeletonPage() {
  return (
    <div aria-hidden="true" className="pdf-skeleton-page">
      <span className="skeleton pdf-skeleton-title" />
      <span className="skeleton pdf-skeleton-line" style={{ width: '62%' }} />
      <div className="pdf-skeleton-block">
        {[96, 100, 91, 100, 84, 100, 93, 70].map((width, index) => (
          <span className="skeleton pdf-skeleton-line" key={index} style={{ width: `${width}%` }} />
        ))}
      </div>
      <div className="pdf-skeleton-block">
        {[100, 88, 97, 100, 76, 100, 90, 58].map((width, index) => (
          <span className="skeleton pdf-skeleton-line" key={index} style={{ width: `${width}%` }} />
        ))}
      </div>
    </div>
  )
}

/** Full-pane loading state: progress bar on top, skeleton page and a status line. */
export function PdfLoadingPane({ value = null, label = 'Memuat dokumen' }) {
  const percent = value == null ? null : Math.round(Math.min(1, Math.max(0, value)) * 100)
  return (
    <div className="pdf-loading-pane" role="status">
      <PdfLoadingBar label={label} value={value} />
      <div className="pdf-loading-content">
        <p aria-live="polite">{label}{percent == null ? '...' : ` ${percent}%`}</p>
        <PdfSkeletonPage />
      </div>
    </div>
  )
}
