import { useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { apiRequest } from '../../api'
import Brand from '../../components/Brand'
import SuccessPopup from '../../components/SuccessPopup'

export default function PasswordResetPage({ token }) {
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    if (newPassword !== confirmPassword) {
      setError('Konfirmasi kata sandi tidak sama.')
      return
    }
    setIsSubmitting(true)
    try {
      const response = await apiRequest('/password/reset', {
        method: 'POST',
        body: JSON.stringify({ token, new_password: newPassword }),
      })
      setNotice(response.message)
      window.history.replaceState(null, '', '/')
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="app-shell">
      <header className="site-header"><div className="header-inner"><Brand /></div></header>
      <div className="page-content password-reset-page">
        <section className="detail-modal password-reset-card">
          <h1>Atur ulang kata sandi</h1>
          {notice ? (
            <>
              <p>Kata sandi berhasil diperbarui.</p>
              <button className="back-button" onClick={() => window.location.assign('/')} type="button">
                <ArrowLeft aria-hidden="true" size={16} /> Kembali ke halaman utama
              </button>
            </>
          ) : (
            <form className="account-settings-form" onSubmit={(event) => void handleSubmit(event)}>
              <p>Tautan reset berlaku selama satu jam. Gunakan minimal 8 karakter dengan huruf besar, huruf kecil, angka, dan simbol.</p>
              <label>Kata sandi baru
                <input autoComplete="new-password" maxLength={128} minLength={8} onChange={(event) => setNewPassword(event.target.value)} placeholder="Contoh simbol: . atau !" required type="password" value={newPassword} />
              </label>
              <label>Konfirmasi kata sandi baru
                <input autoComplete="new-password" maxLength={128} onChange={(event) => setConfirmPassword(event.target.value)} required type="password" value={confirmPassword} />
              </label>
              {error && <p className="login-error" role="alert">{error}</p>}
              <button className="apply-button" disabled={isSubmitting} type="submit">
                {isSubmitting ? 'Menyimpan...' : 'Atur kata sandi'}
              </button>
            </form>
          )}
        </section>
      </div>
      <SuccessPopup message={notice} onClose={setNotice} />
    </main>
  )
}
