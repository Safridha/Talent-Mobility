import { useEffect, useState } from 'react'
import { apiDownload } from '../../api'

export function useAccountAvatar(isAuthenticated: boolean | null | undefined): [string, () => void] {
  const [avatarUrl, setAvatarUrl] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    if (!isAuthenticated) return undefined
    let active = true
    let objectUrl = ''
    apiDownload('/account/avatar')
      .then((blob) => {
        if (!active) return
        objectUrl = URL.createObjectURL(blob)
        setAvatarUrl(objectUrl)
      })
      .catch(() => {
        if (active) setAvatarUrl('')
      })
    return () => {
      active = false
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [isAuthenticated, refreshKey])

  return [avatarUrl, () => setRefreshKey((current) => current + 1)]
}
