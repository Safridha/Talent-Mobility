import { useEffect, useRef, useState } from 'react'
import { RefreshCw } from 'lucide-react'

const CHECK_INTERVAL_MS = 60_000
const COUNTDOWN_SECONDS = 5
const SNOOZE_MS = 5 * 60_000
const RING_LENGTH = 2 * Math.PI * 14

function getBuildAssetSignature(documentNode) {
  return [...documentNode.querySelectorAll('script[type="module"][src], link[rel="stylesheet"][href]')]
    .map((asset) => asset.getAttribute('src') || asset.getAttribute('href'))
    .sort()
    .join('|')
}

/**
 * Watches for a newer deployed build. When one is found a small toast counts down from 5 and then
 * reloads; "Tunda" pauses it for a few minutes so nobody loses what they are typing.
 */
export default function AppUpdateNotice() {
  const [secondsLeft, setSecondsLeft] = useState(null)
  const snoozeUntil = useRef(0)

  useEffect(() => {
    const currentBuild = getBuildAssetSignature(document)
    if (!currentBuild) return undefined

    let isChecking = false
    async function checkForUpdate() {
      if (isChecking || document.visibilityState === 'hidden' || Date.now() < snoozeUntil.current) return
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

    const intervalId = window.setInterval(checkForUpdate, CHECK_INTERVAL_MS)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') void checkForUpdate()
    }
    window.addEventListener('focus', checkForUpdate)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      window.clearInterval(intervalId)
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

  function snooze() {
    snoozeUntil.current = Date.now() + SNOOZE_MS
    setSecondsLeft(null)
  }

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
        <div className="app-update-actions">
          <button className="app-update-primary" onClick={() => window.location.reload()} type="button">Muat ulang</button>
          <button className="app-update-secondary" onClick={snooze} type="button">Tunda</button>
        </div>
      </div>
    </div>
  )
}
