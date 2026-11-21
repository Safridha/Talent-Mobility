import { useEffect, useRef } from 'react'

const SITE_KEY = (import.meta.env.VITE_TURNSTILE_SITE_KEY || '').trim()
const SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'

export const isTurnstileEnabled = SITE_KEY !== ''

let scriptPromise = null
function loadTurnstile() {
  if (window.turnstile) return Promise.resolve(window.turnstile)
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script')
      script.src = SCRIPT_URL
      script.async = true
      script.onload = () => resolve(window.turnstile)
      script.onerror = () => {
        scriptPromise = null
        reject(new Error('Turnstile gagal dimuat.'))
      }
      document.head.append(script)
    })
  }
  return scriptPromise
}

/**
 * Cloudflare Turnstile challenge. Reports the token through `onToken` (empty string when it expires,
 * fails or is reset). Change `resetKey` to get a fresh challenge, e.g. after a failed login, because a
 * token can only be used once. Renders nothing when no site key is configured.
 */
export default function TurnstileWidget({ onToken, onError, resetKey = 0 }) {
  const containerRef = useRef(null)
  const widgetIdRef = useRef(null)
  const callbacksRef = useRef({ onToken, onError })

  useEffect(() => {
    callbacksRef.current = { onToken, onError }
  })

  useEffect(() => {
    if (!isTurnstileEnabled || !containerRef.current) return undefined
    let cancelled = false
    loadTurnstile()
      .then((turnstile) => {
        if (cancelled || !containerRef.current) return
        widgetIdRef.current = turnstile.render(containerRef.current, {
          sitekey: SITE_KEY,
          theme: 'light',
          language: 'id',
          callback: (token) => callbacksRef.current.onToken(token),
          'expired-callback': () => callbacksRef.current.onToken(''),
          'error-callback': () => {
            callbacksRef.current.onToken('')
            callbacksRef.current.onError?.('Verifikasi keamanan tidak dapat dimuat. Periksa koneksi lalu muat ulang halaman.')
          },
        })
      })
      .catch(() => callbacksRef.current.onError?.('Verifikasi keamanan tidak dapat dimuat. Periksa koneksi lalu muat ulang halaman.'))
    return () => {
      cancelled = true
      if (widgetIdRef.current !== null && window.turnstile) window.turnstile.remove(widgetIdRef.current)
      widgetIdRef.current = null
    }
  }, [])

  useEffect(() => {
    if (resetKey > 0 && widgetIdRef.current !== null && window.turnstile) {
      callbacksRef.current.onToken('')
      window.turnstile.reset(widgetIdRef.current)
    }
  }, [resetKey])

  if (!isTurnstileEnabled) return null
  return <div className="turnstile-box" ref={containerRef} />
}
