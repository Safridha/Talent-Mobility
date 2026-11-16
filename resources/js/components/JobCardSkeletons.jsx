export default function JobCardSkeletons({ count = 6 }) {
  return (
    <section aria-busy="true" aria-label="Memuat unit kerja" className="direct-application-results" role="status">
      <div className="job-grid public-job-grid direct-application-grid">
        {Array.from({ length: count }, (_, index) => (
          <article aria-hidden="true" className="job-card skeleton-card" key={index}>
            <div className="card-top">
              <span className="skeleton skeleton-pill" />
              <span className="skeleton skeleton-pill skeleton-pill-short" />
            </div>
            <span className="skeleton skeleton-title" />
            <span className="skeleton skeleton-line" />
            <span className="skeleton skeleton-line skeleton-line-short" />
            <div className="card-footer">
              <span className="skeleton skeleton-button" />
              <span className="skeleton skeleton-button" />
            </div>
          </article>
        ))}
      </div>
      <span className="sr-only-skeleton">Memuat unit kerja...</span>
    </section>
  )
}
