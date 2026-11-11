import { useState } from 'react'
import { ArrowRight, X } from 'lucide-react'
import { apiRequest } from '../../api'
import ModalBackdrop from '../../components/ModalBackdrop'
import PasswordInput from '../../components/PasswordInput'
import PasswordRequirements from '../../components/PasswordRequirements'
import { meetsPasswordRequirements } from '../../components/passwordValidation'
import SuccessPopup from '../../components/SuccessPopup'

export default function AuthDialog({ initialMode, onClose, onSuccess }) {
  const [mode, setMode] = useState(initialMode)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  function changeMode(nextMode) {
    setMode(nextMode)
    setPassword('')
    setConfirmPassword('')
    setError('')
    setNotice('')
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    setNotice('')
    if (mode === 'register' && !meetsPasswordRequirements(password)) {
      setError('Kata sandi belum memenuhi semua persyaratan.')
      return
    }
    if (mode === 'register' && password !== confirmPassword) {
      setError('Konfirmasi kata sandi tidak sama.')
      return
    }
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
      const session = await apiRequest(mode === 'register' ? '/register' : '/login', {
        method: 'POST',
        body: JSON.stringify(
          mode === 'register'
            ? { name: name.trim(), email: email.trim(), password }
            : { email: email.trim(), password },
        ),
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
        className={`detail-modal auth-dialog${mode === 'register' ? ' auth-dialog-register' : ''}`}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className="modal-heading">
          <button aria-label="Tutup" className="icon-button" onClick={onClose} type="button"><X size={20} /></button>
        </div>
        <div className="auth-dialog-content">
          <h2 id="auth-title">{mode === 'register' ? 'Buat akun pelamar' : mode === 'forgot' ? 'Lupa kata sandi?' : 'Masuk ke akun Anda'}</h2>
          <p className="login-description">
            {mode === 'register'
              ? 'Daftar untuk melanjutkan proses lamaran posisi yang Anda pilih.'
              : mode === 'forgot'
                ? 'Masukkan email akun Anda. Jika terdaftar, tautan reset akan dikirim.'
                : 'Masuk untuk melanjutkan proses lamaran posisi yang Anda pilih.'}
          </p>
          <form className="login-form" onSubmit={handleSubmit}>
            {mode === 'register' && (
              <>
                <label htmlFor="register-name">Nama lengkap</label>
                <input autoComplete="name" id="register-name" maxLength={200} onChange={(event) => setName(event.target.value)} placeholder="Masukkan nama lengkap" required value={name} />
              </>
            )}
            <label htmlFor="auth-email">Email</label>
            <input autoComplete="email" id="auth-email" onChange={(event) => setEmail(event.target.value)} placeholder="nama@email.com" required type="email" value={email} />
            {mode !== 'forgot' && (
              <>
                <label htmlFor="auth-password">Kata sandi</label>
                <PasswordInput
                  autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                  id="auth-password"
                  key={`auth-password-${mode}`}
                  maxLength={128}
                  minLength={mode === 'register' ? 8 : undefined}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder={mode === 'register' ? 'Min. 8 karakter, huruf besar/kecil, dan angka' : 'Masukkan kata sandi'}
                  required
                  value={password}
                />
                {mode === 'register' && (
                  <>
                    <label htmlFor="auth-confirm-password">Konfirmasi kata sandi</label>
                    <PasswordInput
                      autoComplete="new-password"
                      id="auth-confirm-password"
                      key={`auth-confirm-password-${mode}`}
                      maxLength={128}
                      minLength={8}
                      onChange={(event) => setConfirmPassword(event.target.value)}
                      placeholder="Ulangi kata sandi"
                      required
                      value={confirmPassword}
                    />
                    <PasswordRequirements confirmation={confirmPassword} password={password} />
                  </>
                )}
              </>
            )}
            {error && <p className="login-error" role="alert">{error}</p>}
            <SuccessPopup message={notice} onClose={setNotice} />
            <button className="primary-button login-submit" disabled={isSubmitting} type="submit">
              <span>
                {isSubmitting
                  ? (mode === 'register' ? 'Membuat akun...' : mode === 'forgot' ? 'Mengirim...' : 'Memeriksa akun...')
                  : (mode === 'register' ? 'Buat akun & lanjutkan' : mode === 'forgot' ? 'Kirim tautan reset' : 'Masuk')}
              </span>
              {mode === 'register' && <ArrowRight size={17} />}
            </button>
          </form>
          {mode === 'login' && (
            <button className="auth-forgot-button" onClick={() => changeMode('forgot')} type="button">
              Lupa kata sandi?
            </button>
          )}
          <p className="auth-switch">
            {mode === 'forgot' ? 'Ingat kata sandi?' : mode === 'register' ? 'Sudah punya akun?' : 'Belum punya akun?'}{' '}
            <button onClick={() => changeMode(mode === 'register' || mode === 'forgot' ? 'login' : 'register')} type="button">
              {mode === 'forgot' ? 'Masuk' : mode === 'register' ? 'Masuk' : 'Buat akun'}
            </button>
          </p>
        </div>
      </section>
    </ModalBackdrop>
  )
}
