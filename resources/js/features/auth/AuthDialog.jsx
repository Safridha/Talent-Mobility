import { useState } from 'react'
import { X } from 'lucide-react'
import { apiRequest } from '../../api'
import ModalBackdrop from '../../components/ModalBackdrop'
import PasswordInput from '../../components/PasswordInput'
import SuccessPopup from '../../components/SuccessPopup'

export default function AuthDialog({ initialMode, onClose, onSuccess }) {
  const [mode, setMode] = useState(initialMode)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  function changeMode(nextMode) {
    setMode(nextMode)
    setPassword('')
    setError('')
    setNotice('')
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    setNotice('')
    setIsSubmitting(true)
    try {
      if (mode === 'forgot') {
        const response = await apiRequest('/password/forgot', {
          method: 'POST',
          body: JSON.stringify({ email: email.trim() }),
        })
        setNotice(response.message)
        return
      }
      const session = await apiRequest('/login', {
        method: 'POST',
        body: JSON.stringify({ identifier: email.trim(), password }),
      })
      onSuccess(session)
    } catch (requestError) {
      setError(requestError.message)
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
          <h2 id="auth-title">{mode === 'forgot' ? 'Lupa kata sandi?' : 'Masuk ke akun Anda'}</h2>
          <p className="login-description">
            {mode === 'forgot'
              ? 'Masukkan email akun Anda. Jika terdaftar, tautan reset akan dikirim. Akun tanpa email: hubungi administrator.'
              : 'Masuk dengan NIP dan kata sandi Anda. Administrator dan akun ber-email dapat memakai email.'}
          </p>
          <form className="login-form" onSubmit={handleSubmit}>
            <label htmlFor="auth-email">{mode === 'forgot' ? 'Email' : 'NIP / Email'}</label>
            <input
              autoComplete={mode === 'forgot' ? 'email' : 'username'}
              id="auth-email"
              maxLength={254}
              onChange={(event) => setEmail(event.target.value)}
              placeholder={mode === 'forgot' ? 'nama@email.com' : 'Masukkan NIP'}
              required
              type={mode === 'forgot' ? 'email' : 'text'}
              value={email}
            />
            {mode !== 'forgot' && (
              <>
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
              </>
            )}
            {error && <p className="login-error" role="alert">{error}</p>}
            <SuccessPopup message={notice} onClose={setNotice} />
            <button className="primary-button login-submit" disabled={isSubmitting} type="submit">
              <span>
                {isSubmitting
                  ? (mode === 'forgot' ? 'Mengirim...' : 'Memeriksa akun...')
                  : (mode === 'forgot' ? 'Kirim tautan reset' : 'Masuk')}
              </span>
            </button>
          </form>
          {mode === 'login' && (
            <button className="auth-forgot-button" onClick={() => changeMode('forgot')} type="button">
              Lupa kata sandi?
            </button>
          )}
          <p className="auth-switch">
            {mode === 'forgot' ? 'Ingat kata sandi?' : 'Belum memiliki akun? Hubungi administrator untuk dibuatkan akun.'}{' '}
            {mode === 'forgot' && (
              <button onClick={() => changeMode('login')} type="button">Masuk</button>
            )}
          </p>
        </div>
      </section>
    </ModalBackdrop>
  )
}
