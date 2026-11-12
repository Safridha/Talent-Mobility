import { useState } from 'react'
import { KeyRound } from 'lucide-react'
import Brand from '../../components/Brand'
import PasswordInput from '../../components/PasswordInput'
import PasswordRequirements from '../../components/PasswordRequirements'
import { meetsPasswordRequirements } from '../../components/passwordValidation'
import { apiRequest } from '../../api'

export default function FirstLoginPasswordChange({ onComplete, onLogout }) {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    if (newPassword === currentPassword) {
      setError('Kata sandi baru harus berbeda dari kata sandi awal.')
      return
    }
    if (newPassword !== confirmPassword) {
      setError('Konfirmasi kata sandi tidak sama.')
      return
    }
    if (!meetsPasswordRequirements(newPassword)) {
      setError('Kata sandi belum memenuhi semua persyaratan.')
      return
    }

    setIsSubmitting(true)
    try {
      await apiRequest('/account/password', {
        method: 'POST',
        body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
      })
      const session = await apiRequest('/session')
      if (!session || session.applicant?.must_change_password) {
        throw new Error('Kata sandi belum berhasil diperbarui. Silakan coba lagi.')
      }
      onComplete(session)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleLogout() {
    setError('')
    try {
      await onLogout()
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  return (
    <main className="app-shell">
      <header className="site-header"><div className="header-inner"><Brand /></div></header>
      <div className="page-content first-login-page">
        <section aria-labelledby="first-login-title" className="detail-modal first-login-card">
          <header className="first-login-heading">
            <span aria-hidden="true" className="first-login-icon"><KeyRound size={22} /></span>
            <div>
              <h1 id="first-login-title">Ganti kata sandi awal</h1>
              <p>Akun Anda dibuat oleh administrator. Demi keamanan, buat kata sandi baru sebelum melanjutkan.</p>
            </div>
          </header>
          <form className="account-settings-form first-login-form" onSubmit={(event) => void handleSubmit(event)}>
            <label>Kata sandi awal
              <PasswordInput autoComplete="current-password" maxLength={128} onChange={(event) => setCurrentPassword(event.target.value)} required value={currentPassword} />
            </label>
            <hr className="first-login-divider" />
            <label>Kata sandi baru
              <PasswordInput autoComplete="new-password" maxLength={128} minLength={8} onChange={(event) => setNewPassword(event.target.value)} required value={newPassword} />
            </label>
            <label>Konfirmasi kata sandi baru
              <PasswordInput autoComplete="new-password" maxLength={128} onChange={(event) => setConfirmPassword(event.target.value)} required value={confirmPassword} />
            </label>
            <PasswordRequirements confirmation={confirmPassword} password={newPassword} />
            {error && <p className="login-error" role="alert">{error}</p>}
            <div className="first-login-actions">
              <button className="apply-button" disabled={isSubmitting} type="submit">
                {isSubmitting ? 'Menyimpan...' : 'Simpan kata sandi baru'}
              </button>
              <button className="first-login-logout" disabled={isSubmitting} onClick={() => void handleLogout()} type="button">
                Keluar
              </button>
            </div>
          </form>
        </section>
      </div>
    </main>
  )
}
