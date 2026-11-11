import { useState } from 'react'
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
      <div className="page-content password-reset-page">
        <section className="detail-modal password-reset-card">
          <h1>Ganti kata sandi awal</h1>
          <p>Administrator membuat akun Anda. Untuk keamanan, ganti kata sandi awal sebelum melanjutkan.</p>
          <form className="account-settings-form" onSubmit={(event) => void handleSubmit(event)}>
            <label>Kata sandi awal
              <PasswordInput autoComplete="current-password" maxLength={128} onChange={(event) => setCurrentPassword(event.target.value)} required value={currentPassword} />
            </label>
            <label>Kata sandi baru
              <PasswordInput autoComplete="new-password" maxLength={128} minLength={8} onChange={(event) => setNewPassword(event.target.value)} required value={newPassword} />
            </label>
            <label>Konfirmasi kata sandi baru
              <PasswordInput autoComplete="new-password" maxLength={128} onChange={(event) => setConfirmPassword(event.target.value)} required value={confirmPassword} />
            </label>
            <PasswordRequirements confirmation={confirmPassword} password={newPassword} />
            {error && <p className="login-error" role="alert">{error}</p>}
            <button className="apply-button" disabled={isSubmitting} type="submit">
              {isSubmitting ? 'Menyimpan...' : 'Simpan kata sandi baru'}
            </button>
            <button className="detail-button" disabled={isSubmitting} onClick={() => void handleLogout()} type="button">
              Keluar
            </button>
          </form>
        </section>
      </div>
    </main>
  )
}
