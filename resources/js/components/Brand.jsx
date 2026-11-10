export default function Brand() {
  return (
    <a className="brand" href="#home" aria-label="Empower To Produce">
      <span aria-hidden="true" className="brand-icon">
        <svg fill="none" height="24" viewBox="0 0 24 24" width="24">
          <path d="M16 12V4m0 0-4 4m4-4 4 4M16 12H5m0 0 4-4m-4 4 4 4m7-4v4a4 4 0 0 0 4 4h1" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.8" />
        </svg>
      </span>
      <span className="brand-copy">
        <span className="brand-title">Empower To Produce</span>
        <span className="brand-subtitle">From Potential To Real Contribution</span>
      </span>
    </a>
  )
}
