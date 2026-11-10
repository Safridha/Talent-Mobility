import { useEffect } from 'react'
import { CheckCircle2, X } from 'lucide-react'

export default function SuccessPopup({ message, onClose }) {
  useEffect(() => {
    if (!message) return undefined
    const timeout = window.setTimeout(() => onClose(''), 4000)
    return () => window.clearTimeout(timeout)
  }, [message, onClose])

  if (!message) return null
  return (
    <div className="success-popup-backdrop">
      <section aria-live="polite" className="success-popup" role="status">
        <button aria-label="Tutup notifikasi" className="success-popup-close" onClick={() => onClose('')} type="button">
          <X size={17} />
        </button>
        <span aria-hidden="true" className="success-popup-icon"><CheckCircle2 size={36} /></span>
        <strong>Berhasil</strong>
        <p>{message}</p>
      </section>
    </div>
  )
}
