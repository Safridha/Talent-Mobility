import { useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'

const COUNTDOWN_SECONDS = 5
const RING_LENGTH = 2 * Math.PI * 14

function getBuildAssetSignature(documentNode) {
  return [...documentNode.querySelectorAll('script[type="module"][src], link[rel="stylesheet"][href]')]
    .map((asset) => asset.getAttribute('src') || asset.getAttribute('href'))
    .sort()
    .join('|')
}

/**
 * Tells people when a newer build has been deployed: a small toast counts down from 5 and reloads.
 * There is no polling. The server keeps one open event stream; a deploy restarts the server, the stream
 * reconnects to the new version, and that reconnect (plus returning to the tab) triggers one check.
 */
export default function AppUpdateNotice() {
  const [secondsLeft, setSecondsLeft] = useState(null)

  useEffect(() => {
    const currentBuild = getBuildAssetSignature(document)
    if (!currentBuild) return undefined

    let isChecking = false
    async function checkForUpdate() {
      if (isChecking || document.visibilityState === 'hidden') return
      isChecking = true
      try {
        const response = await fetch(`/?__app_build_check=${Date.now()}`, {
          cache: 'no-store',
          headers: { Accept: 'text/html' },
        })
        if (!response.ok) throw new Error(`Build check returned HTTP ${response.status}.`)
        const latestDocument = new DOMParser().parseFromString(await response.text(), 'text/html')
        const latestBuild = getBuildAssetSignature(latestDocument)
        if (latestBuild && latestBuild !== currentBuild) {
          setSecondsLeft((current) => (current === null ? COUNTDOWN_SECONDS : current))
        }
      } catch (error) {
        console.error('App update check failed.', error)
      } finally {
        isChecking = false
      }
    }

    let stream = null
    if (typeof EventSource !== 'undefined') {
      stream = new EventSource('/api/app-updates')
      // Fires on the first connection and on every reconnect after the server restarts.
      stream.onopen = () => void checkForUpdate()
    }
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') void checkForUpdate()
    }
    window.addEventListener('focus', checkForUpdate)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      stream?.close()
      window.removeEventListener('focus', checkForUpdate)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [])

  useEffect(() => {
    if (secondsLeft === null) return undefined
    if (secondsLeft <= 0) {
      window.location.reload()
      return undefined
    }
    const timer = window.setTimeout(() => setSecondsLeft((current) => (current === null ? null : current - 1)), 1000)
    return () => window.clearTimeout(timer)
  }, [secondsLeft])

  if (secondsLeft === null) return null

  const progress = Math.max(0, secondsLeft) / COUNTDOWN_SECONDS

  return (
    <div aria-live="polite" className="app-update-notice" role="status">
      <div aria-hidden="true" className="app-update-ring">
        <svg viewBox="0 0 34 34">
          <circle className="app-update-ring-track" cx="17" cy="17" r="14" />
          <circle
            className="app-update-ring-fill"
            cx="17"
            cy="17"
            r="14"
            style={{ strokeDasharray: RING_LENGTH, strokeDashoffset: RING_LENGTH * (1 - progress) }}
          />
        </svg>
        <b>{secondsLeft}</b>
      </div>
      <div className="app-update-text">
        <strong><RefreshCw aria-hidden="true" size={12} /> Pembaruan tersedia</strong>
        <small>Dimuat ulang otomatis dalam {secondsLeft} detik.</small>
        <button className="app-update-primary" onClick={() => window.location.reload()} type="button">Muat ulang sekarang</button>
      </div>
    </div>
  )
}
