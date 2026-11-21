import { useState } from 'react'
import { X } from 'lucide-react'
import { apiRequest } from '../../api'
import ModalBackdrop from '../../components/ModalBackdrop'
import PasswordInput from '../../components/PasswordInput'
import TurnstileWidget, { isTurnstileEnabled } from '../../components/TurnstileWidget'

export default function AuthDialog({ onClose, onSuccess }) {
  const [nip, setNip] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [turnstileToken, setTurnstileToken] = useState('')
  const [turnstileReset, setTurnstileReset] = useState(0)

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    if (isTurnstileEnabled && !turnstileToken) {
      setError('Selesaikan verifikasi keamanan terlebih dahulu.')
      return
    }
    setIsSubmitting(true)
    try {
      const session = await apiRequest('/login', {
        method: 'POST',
        body: JSON.stringify({ identifier: nip.trim(), password, turnstile_token: turnstileToken || undefined }),
      })
      onSuccess(session)
    } catch (requestError) {
      setError(requestError.message)
      // A Turnstile token works once; ask for a fresh challenge after any failed attempt.
      setTurnstileReset((current) => current + 1)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <ModalBackdrop className="modal-backdrop auth-backdrop" onDismiss={onClose}>
      <section
        aria-labelledby="auth-title"
        aria-modal="true"
        className="detail-modal auth-dialog"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className="modal-heading">
          <button aria-label="Tutup" className="icon-button" onClick={onClose} type="button"><X size={20} /></button>
        </div>
        <div className="auth-dialog-content">
          <h2 id="auth-title">Masuk ke akun Anda</h2>
          <p className="login-description">
            Masukkan NIP dan kata sandi Anda untuk melanjutkan.
          </p>
          <form className="login-form" onSubmit={handleSubmit}>
            <label htmlFor="auth-nip">NIP</label>
            <input
              autoComplete="username"
              id="auth-nip"
              maxLength={254}
              onChange={(event) => setNip(event.target.value)}
              placeholder="Masukkan NIP Anda"
              required
              type="text"
              value={nip}
            />
            <label htmlFor="auth-password">Kata sandi</label>
            <PasswordInput
              autoComplete="current-password"
              id="auth-password"
              maxLength={128}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Masukkan kata sandi"
              required
              value={password}
            />
            <TurnstileWidget onError={setError} onToken={setTurnstileToken} resetKey={turnstileReset} />
            {error && <p className="login-error" role="alert">{error}</p>}
            <button className="primary-button login-submit" disabled={isSubmitting || (isTurnstileEnabled && !turnstileToken)} type="submit">
              <span>{isSubmitting ? 'Memeriksa akun...' : 'Masuk'}</span>
            </button>
          </form>
          <p className="auth-switch">
            Belum memiliki akun atau lupa kata sandi? Hubungi administrator.
          </p>
        </div>
      </section>
    </ModalBackdrop>
  )
}
