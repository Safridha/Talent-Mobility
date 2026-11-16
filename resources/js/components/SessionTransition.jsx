import { CheckCircle2, LogOut } from 'lucide-react'

const COPY = {
  login: { title: 'Berhasil masuk', text: 'Menyiapkan halaman Anda...' },
  logout: { title: 'Sedang keluar', text: 'Mengakhiri sesi Anda dengan aman...' },
}

export default function SessionTransition({ kind, leaving }) {
  const copy = COPY[kind]
  if (!copy) return null
  return (
    <div className={`session-transition${leaving ? ' is-leaving' : ''}`}>
      <section aria-live="polite" className={`session-transition-card session-transition-${kind}`} role="status">
        <span aria-hidden="true" className="session-transition-icon">
          {kind === 'login' ? <CheckCircle2 size={38} /> : <LogOut size={34} />}
        </span>
        <strong>{copy.title}</strong>
        <p>{copy.text}</p>
        <span aria-hidden="true" className="session-transition-bar" />
      </section>
    </div>
  )
}
