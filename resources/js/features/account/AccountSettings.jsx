import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, Camera, KeyRound, UserRound } from 'lucide-react'
import { apiRequest } from '../../api'
import { AccountAvatar } from '../../components/account/AccountSettingsMenu'
import PasswordInput from '../../components/PasswordInput'
import PasswordRequirements from '../../components/PasswordRequirements'
import { meetsPasswordRequirements } from '../../components/passwordValidation'
import SuccessPopup from '../../components/SuccessPopup'

export function AccountSettingsPage({
  avatarUrl,
  onAvatarChanged,
  onBack,
  onProfileUpdated,
  onSectionChange,
  section,
  session,
}) {
  const [name, setName] = useState(session.user.name)
  const [email, setEmail] = useState(session.user.email)
  const [selectedPhoto, setSelectedPhoto] = useState(null)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isSavingProfile, setIsSavingProfile] = useState(false)
  const [isSavingPhoto, setIsSavingPhoto] = useState(false)
  const [isSavingPassword, setIsSavingPassword] = useState(false)
  const photoInput = useRef(null)

  useEffect(() => {
    let active = true
    apiRequest('/account/profile')
      .then((profile) => {
        if (!active) return
        setName(profile.name)
        setEmail(profile.email)
      })
      .catch((requestError) => {
        if (active) setError(requestError.message)
      })
      .finally(() => {
        if (active) setIsLoading(false)
      })
    return () => { active = false }
  }, [session.role])

  async function saveProfile(event) {
    event.preventDefault()
    setError('')
    setNotice('')
    setIsSavingProfile(true)
    try {
      const profile = await apiRequest('/account/profile', {
        method: 'PATCH',
        body: JSON.stringify({ name: name.trim() }),
      })
      setName(profile.name)
      setEmail(profile.email)
      onProfileUpdated(profile)
      setNotice('Profil berhasil diperbarui.')
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setIsSavingProfile(false)
    }
  }

  async function savePhoto() {
    if (!selectedPhoto) return
    setError('')
    setNotice('')
    setIsSavingPhoto(true)
    try {
      const formData = new FormData()
      formData.append('photo', selectedPhoto)
      await apiRequest('/account/avatar', {
        method: 'POST',
        body: formData,
      })
      setSelectedPhoto(null)
      if (photoInput.current) photoInput.current.value = ''
      onAvatarChanged()
      setNotice('Foto profil berhasil diperbarui.')
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setIsSavingPhoto(false)
    }
  }

  async function removePhoto() {
    setError('')
    setNotice('')
    setIsSavingPhoto(true)
    try {
      await apiRequest('/account/avatar', { method: 'DELETE' })
      onAvatarChanged()
      setNotice('Foto profil berhasil dihapus.')
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setIsSavingPhoto(false)
    }
  }

  async function savePassword(event) {
    event.preventDefault()
    setError('')
    setNotice('')
    if (newPassword !== confirmPassword) {
      setError('Konfirmasi kata sandi baru tidak sama.')
      return
    }
    if (!meetsPasswordRequirements(newPassword)) {
      setError('Kata sandi belum memenuhi semua persyaratan.')
      return
    }
    setIsSavingPassword(true)
    try {
      const response = await apiRequest('/account/password', {
        method: 'POST',
        body: JSON.stringify({
          current_password: currentPassword,
          new_password: newPassword,
        }),
      })
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setNotice(response.message)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setIsSavingPassword(false)
    }
  }

  return (
    <section aria-labelledby="account-settings-title" className="account-settings-page">
      <div className="account-settings-page-heading">
        <button className="back-button account-settings-back" onClick={onBack} type="button">
          <ArrowLeft aria-hidden="true" size={16} />
          Kembali
        </button>
        <div>
          <span className="section-kicker">PENGATURAN AKUN</span>
          <h1 id="account-settings-title">{section === 'profile' ? 'Profil' : 'Keamanan & kata sandi'}</h1>
          <p>Kelola informasi dan keamanan akun Anda.</p>
        </div>
      </div>
      <nav aria-label="Bagian pengaturan akun" className="account-settings-tabs">
        <button className={section === 'profile' ? 'active' : ''} onClick={() => onSectionChange('profile')} type="button">
          <UserRound size={16} /> Profil
        </button>
        <button className={section === 'security' ? 'active' : ''} onClick={() => onSectionChange('security')} type="button">
          <KeyRound size={16} /> Keamanan &amp; kata sandi
        </button>
      </nav>
      {isLoading ? <p className="admin-loading">Memuat profil...</p> : (
        <>
          {section === 'profile' && (
            <>
            <section className="account-settings-photo">
              <AccountAvatar alt="Foto profil" avatarUrl={avatarUrl} className="account-settings-avatar" iconSize={40} />
              <div>
                <strong>Foto profil</strong>
                <span>JPG, PNG, atau WebP · maksimal 2 MB</span>
                <input
                  accept="image/jpeg,image/png,image/webp"
                  aria-label="Pilih foto profil"
                  onChange={(event) => {
                    setError('')
                    setSelectedPhoto(event.target.files?.[0] || null)
                  }}
                  ref={photoInput}
                  type="file"
                />
                <div className="account-settings-actions">
                  <button className="admin-small-button" disabled={!selectedPhoto || isSavingPhoto} onClick={() => void savePhoto()} type="button">
                    <Camera size={15} /> {isSavingPhoto ? 'Menyimpan...' : 'Pasang foto'}
                  </button>
                  {avatarUrl && <button className="detail-button" disabled={isSavingPhoto} onClick={() => void removePhoto()} type="button">Hapus foto</button>}
                </div>
              </div>
            </section>
            <form className="account-settings-form" onSubmit={(event) => void saveProfile(event)}>
              <label>Nama
                <input autoComplete="name" maxLength={200} onChange={(event) => setName(event.target.value)} required value={name} />
              </label>
              <label>Email akun
                <input autoComplete="email" readOnly value={email} />
              </label>
              <button className="apply-button" disabled={isSavingProfile} type="submit">
                {isSavingProfile ? 'Menyimpan...' : 'Simpan profil'}
              </button>
            </form>
            </>
          )}
          {section === 'security' && (
            <form className="account-settings-form" onSubmit={(event) => void savePassword(event)}>
              <h3><KeyRound size={17} /> Ganti kata sandi</h3>
              <label>Kata sandi saat ini
                <PasswordInput autoComplete="current-password" maxLength={128} onChange={(event) => setCurrentPassword(event.target.value)} required value={currentPassword} />
              </label>
              <label>Kata sandi baru
                <PasswordInput autoComplete="new-password" maxLength={128} minLength={8} onChange={(event) => setNewPassword(event.target.value)} placeholder="Min. 8 karakter, huruf besar/kecil, dan angka" required value={newPassword} />
              </label>
              <label>Konfirmasi kata sandi baru
                <PasswordInput autoComplete="new-password" maxLength={128} onChange={(event) => setConfirmPassword(event.target.value)} required value={confirmPassword} />
              </label>
              <PasswordRequirements confirmation={confirmPassword} password={newPassword} />
              <button className="apply-button" disabled={isSavingPassword} type="submit">
                {isSavingPassword ? 'Menyimpan...' : 'Ganti kata sandi'}
              </button>
            </form>
          )}
        </>
      )}
      {error && <p className="login-error" role="alert">{error}</p>}
      <SuccessPopup message={notice} onClose={setNotice} />
    </section>
  )
}
