import { useEffect, useRef, useState } from 'react'
import { ChevronDown, FileText, KeyRound, LogOut, UserRound } from 'lucide-react'

type AccountSection = 'profile' | 'security'

type AccountAvatarProps = {
  avatarUrl?: string | null
  alt?: string
  className?: string
  iconSize?: number
}

type AccountSettingsMenuProps = {
  applicationCount?: number
  avatarUrl?: string | null
  email: string
  name: string
  onApplications?: () => void
  onLogout: () => void | Promise<void>
  onSelect: (section: AccountSection) => void
}

export function AccountAvatar({
  avatarUrl,
  alt = '',
  className = 'account-avatar',
  iconSize = 24,
}: AccountAvatarProps) {
  const [failedAvatarUrl, setFailedAvatarUrl] = useState<string | null>(null)

  if (avatarUrl && avatarUrl !== failedAvatarUrl) {
    return <img alt={alt} className={className} onError={() => setFailedAvatarUrl(avatarUrl)} src={avatarUrl} />
  }
  return <UserRound aria-hidden="true" className={`${className} account-avatar-fallback`} size={iconSize} />
}

export default function AccountSettingsMenu({
  applicationCount = 0,
  avatarUrl,
  email,
  name,
  onApplications,
  onLogout,
  onSelect,
}: AccountSettingsMenuProps) {
  const [isOpen, setIsOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function closeOnOutsideClick(event: PointerEvent) {
      if (event.target instanceof Node && !menuRef.current?.contains(event.target)) setIsOpen(false)
    }
    document.addEventListener('pointerdown', closeOnOutsideClick)
    return () => document.removeEventListener('pointerdown', closeOnOutsideClick)
  }, [])

  return (
    <div className="account-settings-menu" ref={menuRef}>
      <button
        aria-expanded={isOpen}
        aria-haspopup="menu"
        aria-label={`Menu akun ${name}`}
        className="account-settings-trigger"
        onClick={() => setIsOpen((current) => !current)}
        title="Menu akun"
        type="button"
      >
        <AccountAvatar avatarUrl={avatarUrl} />
        <span className="account-settings-identity">
          <strong>{name}</strong>
          <small>{email}</small>
        </span>
        <ChevronDown aria-hidden="true" size={15} />
      </button>
      {isOpen && (
        <div className="account-settings-dropdown" role="menu">
          <button className="account-settings-option" onClick={() => { setIsOpen(false); onSelect('profile') }} role="menuitem" type="button">
            <UserRound size={16} /> Profil
          </button>
          <button className="account-settings-option" onClick={() => { setIsOpen(false); onSelect('security') }} role="menuitem" type="button">
            <KeyRound size={16} /> Keamanan &amp; kata sandi
          </button>
          {onApplications && (
            <button className="account-settings-option" onClick={() => { setIsOpen(false); onApplications() }} role="menuitem" type="button">
              <FileText size={16} /> Lamaran Saya <span className="account-menu-count">{applicationCount}</span>
            </button>
          )}
          <button className="account-settings-option account-settings-logout" onClick={() => { setIsOpen(false); void onLogout() }} role="menuitem" type="button">
            <LogOut size={16} /> Keluar
          </button>
        </div>
      )}
    </div>
  )
}
