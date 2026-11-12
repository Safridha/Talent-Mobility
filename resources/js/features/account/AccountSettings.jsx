import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, Camera, KeyRound, Trash2, UserRound, X } from 'lucide-react'
import { apiRequest } from '../../api'
import { AccountAvatar } from '../../components/account/AccountSettingsMenu'
import PasswordInput from '../../components/PasswordInput'
import PasswordRequirements from '../../components/PasswordRequirements'
import { meetsPasswordRequirements } from '../../components/passwordValidation'
import SuccessPopup from '../../components/SuccessPopup'
import { prepareAvatar } from './prepareAvatar'
import { EDUCATION_OPTIONS } from './employeeOptions'
import SearchableSelect from '../../components/SearchableSelect'

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
  const [email, setEmail] = useState(session.user.email || '')
  const [employeeNumber, setEmployeeNumber] = useState(session.user.employee_number || '')
  const isApplicant = session.role === 'applicant'
  const [master, setMaster] = useState({ divisions: [], departments: [] })
  const [divisionId, setDivisionId] = useState('')
  const [departmentId, setDepartmentId] = useState('')
  const [positionTitle, setPositionTitle] = useState('')
  const [lastEducation, setLastEducation] = useState('')
  const [selectedPhoto, setSelectedPhoto] = useState(null)
  const [photoPreview, setPhotoPreview] = useState('')
  const [isPreparingPhoto, setIsPreparingPhoto] = useState(false)
  // Applicants may add/remove an optional email; only the Super Admin may change an admin's email.
  const canEditEmail = session.role === 'applicant' || session.user.admin_role === 'super_admin'
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

  function applyEmployeeProfile(profile) {
    setDivisionId(profile.division_id ? String(profile.division_id) : '')
    setDepartmentId(profile.department_id ? String(profile.department_id) : '')
    setPositionTitle(profile.position_title || '')
    setLastEducation(profile.last_education || '')
  }

  useEffect(() => {
    if (!isApplicant) return undefined
    let active = true
    apiRequest('/account/employee-master')
      .then((response) => { if (active) setMaster(response) })
      .catch(() => {})
    return () => { active = false }
  }, [isApplicant])

  useEffect(() => {
    let active = true
    apiRequest('/account/profile')
      .then((profile) => {
        if (!active) return
        setName(profile.name)
        setEmail(profile.email || '')
        setEmployeeNumber(profile.employee_number || '')
        applyEmployeeProfile(profile)
      })
      .catch((requestError) => {
        if (active) setError(requestError.message)
      })
      .finally(() => {
        if (active) setIsLoading(false)
      })
    return () => { active = false }
  }, [session.role])

  useEffect(() => {
    if (!selectedPhoto) {
      setPhotoPreview('')
      return undefined
    }
    const url = URL.createObjectURL(selectedPhoto)
    setPhotoPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [selectedPhoto])

  async function choosePhoto(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setError('')
    setIsPreparingPhoto(true)
    try {
      setSelectedPhoto(await prepareAvatar(file))
    } catch (photoError) {
      setSelectedPhoto(null)
      setError(photoError.message)
    } finally {
      setIsPreparingPhoto(false)
    }
  }

  function cancelPhoto() {
    setSelectedPhoto(null)
    setError('')
  }

  async function saveProfile(event) {
    event.preventDefault()
    setError('')
    setNotice('')
    setIsSavingProfile(true)
    try {
      const profile = await apiRequest('/account/profile', {
        method: 'PATCH',
        body: JSON.stringify(canEditEmail ? { name: name.trim(), email: email.trim() } : { name: name.trim() }),
      })
      let saved = profile
      if (isApplicant) {
        saved = await apiRequest('/account/employee-profile', {
          method: 'PUT',
          body: JSON.stringify({
            division_id: divisionId ? Number(divisionId) : null,
            department_id: departmentId ? Number(departmentId) : null,
            position_title: positionTitle.trim(),
            last_education: lastEducation,
          }),
        })
        applyEmployeeProfile(saved)
      }
      setName(saved.name)
      setEmail(saved.email || '')
      setEmployeeNumber(saved.employee_number || '')
      onProfileUpdated(saved)
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
              {photoPreview
                ? <img alt="Pratinjau foto profil" className="account-avatar account-settings-avatar" src={photoPreview} />
                : <AccountAvatar alt="Foto profil" avatarUrl={avatarUrl} className="account-settings-avatar" iconSize={40} />}
              <div>
                <strong>Foto profil</strong>
                <span>JPG, PNG, atau WebP. Ukuran foto disesuaikan otomatis.</span>
                <input
                  accept="image/jpeg,image/png,image/webp"
                  aria-label="Pilih foto profil"
                  className="account-photo-input"
                  onChange={(event) => void choosePhoto(event)}
                  ref={photoInput}
                  type="file"
                />
                <div className="account-settings-actions">
                  {selectedPhoto ? (
                    <>
                      <button className="admin-small-button primary" disabled={isSavingPhoto} onClick={() => void savePhoto()} type="button">
                        <Camera size={15} /> {isSavingPhoto ? 'Menyimpan...' : 'Simpan foto'}
                      </button>
                      <button className="admin-small-button" disabled={isSavingPhoto} onClick={cancelPhoto} type="button">
                        <X size={15} /> Batal
                      </button>
                    </>
                  ) : (
                    <>
                      <button className="admin-small-button" disabled={isPreparingPhoto || isSavingPhoto} onClick={() => photoInput.current?.click()} type="button">
                        <Camera size={15} /> {isPreparingPhoto ? 'Memproses...' : avatarUrl ? 'Ganti foto' : 'Pilih foto'}
                      </button>
                      {avatarUrl && (
                        <button className="admin-small-button danger" disabled={isSavingPhoto} onClick={() => void removePhoto()} type="button">
                          <Trash2 size={15} /> Hapus foto
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            </section>
            <form className="account-settings-form" onSubmit={(event) => void saveProfile(event)}>
              <label>Nama
                <input autoComplete="name" maxLength={200} onChange={(event) => setName(event.target.value)} required value={name} />
              </label>
              {employeeNumber && (
                <label>NIP
                  <input readOnly value={employeeNumber} />
                </label>
              )}
              {isApplicant && (
                <>
                  <label>Divisi
                    <SearchableSelect
                      onChange={(value) => { setDivisionId(value); setDepartmentId('') }}
                      options={[{ value: '', label: 'Belum diisi' }, ...master.divisions.map((item) => ({ value: String(item.id), label: item.name }))]}
                      placeholder="Pilih divisi"
                      value={divisionId}
                    />
                  </label>
                  {divisionId && (
                    <label>Departemen (Unit Kerja)
                      <SearchableSelect
                        onChange={setDepartmentId}
                        options={[
                          { value: '', label: 'Belum diisi' },
                          ...master.departments
                            .filter((item) => String(item.division_id) === divisionId)
                            .map((item) => ({ value: String(item.id), label: item.name })),
                        ]}
                        placeholder="Pilih departemen"
                        value={departmentId}
                      />
                    </label>
                  )}
                  <label>Jabatan
                    <input maxLength={200} onChange={(event) => setPositionTitle(event.target.value)} value={positionTitle} />
                  </label>
                  <label>Pendidikan terakhir
                    <SearchableSelect
                      onChange={setLastEducation}
                      options={[
                        { value: '', label: 'Belum diisi' },
                        ...[...new Set([...EDUCATION_OPTIONS, lastEducation].filter(Boolean))].map((item) => ({ value: item, label: item })),
                      ]}
                      placeholder="Pilih pendidikan"
                      value={lastEducation}
                    />
                  </label>
                </>
              )}
              {canEditEmail ? (
                <label>{session.role === 'applicant' ? 'Email (opsional)' : 'Email akun'}
                  <input
                    autoComplete="email"
                    maxLength={254}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder={session.role === 'applicant' ? 'nama@email.com (boleh dikosongkan)' : 'nama@email.com'}
                    required={session.role !== 'applicant'}
                    type="email"
                    value={email}
                  />
                </label>
              ) : (email || !employeeNumber) && (
                <label>Email akun
                  <input autoComplete="email" readOnly value={email} />
                </label>
              )}
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
