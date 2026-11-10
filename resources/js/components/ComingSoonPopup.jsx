import { Megaphone, X } from 'lucide-react'
import ModalBackdrop from './ModalBackdrop'

export default function ComingSoonPopup({ onClose }) {
  return (
    <ModalBackdrop className="modal-backdrop coming-soon-backdrop" onDismiss={onClose}>
      <section
        aria-labelledby="coming-soon-title"
        aria-modal="true"
        className="detail-modal coming-soon-dialog"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <button
          aria-label="Tutup pengumuman"
          className="icon-button coming-soon-close"
          onClick={onClose}
          type="button"
        >
          <X size={19} />
        </button>
        <span aria-hidden="true" className="coming-soon-icon"><Megaphone size={27} /></span>
        <span className="coming-soon-kicker">Informasi pengembangan</span>
        <h2 id="coming-soon-title">Coming soon</h2>
        <p>Portal Talent Mobility masih dalam proses pengembangan.</p>
        <p>Jika menemukan bug atau error, silakan konfirmasi kepada admin dengan menyertakan halaman dan kendalanya.</p>
        <button className="primary-button coming-soon-action" onClick={onClose} type="button">
          Mengerti
        </button>
      </section>
    </ModalBackdrop>
  )
}
