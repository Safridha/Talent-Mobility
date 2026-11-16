import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import JobCatalog from './features/applicant/JobCatalog'
import { apiRequest } from './api'

// The admin dashboard and the forced password-change screen are only needed by some visitors, so they
// load as separate chunks and the public job catalog stays small.
const AdminDashboard = lazy(() => import('./features/admin/AdminDashboard'))
const FirstLoginPasswordChange = lazy(() => import('./features/auth/FirstLoginPasswordChange'))
import NotFoundPage from './components/NotFoundPage'
import SessionTransition from './components/SessionTransition'
import { ADMIN_ROUTES, APPLICANT_ROUTES, GUEST_ROUTES } from './routes'
import { goTo, usePathname } from './usePathRoute'
import '../css/App.css'

const APPLICANT_SESSION_KEY = 'talent-mobility:applicant-session'
const ADMIN_SESSION_KEY = 'talent-mobility:admin-session'

function getBuildAssetSignature(documentNode) {
  return [...documentNode.querySelectorAll('script[type="module"][src], link[rel="stylesheet"][href]')]
    .map((asset) => asset.getAttribute('src') || asset.getAttribute('href'))
    .sort()
    .join('|')
}

function readStoredSession(key) {
  const stored = localStorage.getItem(key)
  if (!stored) return null
  try {
    const session = JSON.parse(stored)
    if ((session?.role === 'admin' && session.admin) || (session?.role === 'applicant' && session.applicant)) {
      const safeSession = { ...session }
      delete safeSession.token
      localStorage.setItem(key, JSON.stringify(safeSession))
      return safeSession
    }
  } catch {
    // Invalid stored session data is removed below.
  }
  localStorage.removeItem(key)
  return null
}

export default function App() {
  const queryClient = useQueryClient()
  const [session, setSession] = useState(() => readStoredSession(APPLICANT_SESSION_KEY))
  const [adminSession, setAdminSession] = useState(() => readStoredSession(ADMIN_SESSION_KEY))
  const [sessionNotice, setSessionNotice] = useState('')
  const authenticatedDuringRestore = useRef(false)
  const pathname = usePathname()
  const previousAudience = useRef(adminSession ? 'admin' : session ? 'applicant' : 'guest')
  const storedSessionExists = useRef(Boolean(session || adminSession))
  const restoreSessionRequest = useRef(null)
  const [transition, setTransition] = useState(null)
  const transitionTimers = useRef([])

  const showTransition = useCallback((kind, holdMs) => {
    transitionTimers.current.forEach(window.clearTimeout)
    setTransition({ kind, leaving: false })
    transitionTimers.current = [
      window.setTimeout(() => setTransition({ kind, leaving: true }), holdMs),
      window.setTimeout(() => setTransition(null), holdMs + 350),
    ]
  }, [])

  useEffect(() => () => transitionTimers.current.forEach(window.clearTimeout), [])

  const handleLogin = useCallback((newSession) => {
    authenticatedDuringRestore.current = true
    queryClient.clear()
    setSessionNotice('')
    const safeSession = { ...newSession }
    delete safeSession.token
    if (newSession.role === 'admin' || newSession.admin) {
      localStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify(safeSession))
      localStorage.removeItem(APPLICANT_SESSION_KEY)
      setSession(null)
      setAdminSession(safeSession)
      return
    }
    localStorage.setItem(APPLICANT_SESSION_KEY, JSON.stringify(safeSession))
    localStorage.removeItem(ADMIN_SESSION_KEY)
    setAdminSession(null)
    setSession(safeSession)
  }, [queryClient])

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }).catch((error) => {
      console.error('PWA service worker registration failed.', error)
    })
  }, [])

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
        if (latestBuild && latestBuild !== currentBuild) window.location.reload()
      } catch (error) {
        console.error('App update check failed.', error)
      } finally {
        isChecking = false
      }
    }

    const intervalId = window.setInterval(checkForUpdate, 60_000)
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
    function clearExpiredSession() {
      localStorage.removeItem(APPLICANT_SESSION_KEY)
      localStorage.removeItem(ADMIN_SESSION_KEY)
      queryClient.clear()
      setSession(null)
      setAdminSession(null)
      setSessionNotice('Sesi Anda berakhir atau akses akun berubah. Silakan masuk kembali.')
    }

    window.addEventListener('talent-mobility:session-expired', clearExpiredSession)
    return () => window.removeEventListener('talent-mobility:session-expired', clearExpiredSession)
  }, [queryClient])

  useEffect(() => {
    let active = true
    restoreSessionRequest.current ??= apiRequest('/session', { suppressSessionExpired: true })
    restoreSessionRequest.current
      .then((restoredSession) => {
        if (!active || authenticatedDuringRestore.current) return
        if (restoredSession) {
          handleLogin(restoredSession)
        } else if (storedSessionExists.current) {
          localStorage.removeItem(APPLICANT_SESSION_KEY)
          localStorage.removeItem(ADMIN_SESSION_KEY)
          queryClient.clear()
          setSession(null)
          setAdminSession(null)
        }
      })
      .catch((error) => {
        if (active) setSessionNotice(error.message)
      })
    return () => { active = false }
  }, [handleLogin, queryClient])

  // Explicit sign-in from the login dialog: same as handleLogin plus a short welcome animation.
  function handleInteractiveLogin(newSession) {
    handleLogin(newSession)
    if (!newSession.applicant?.must_change_password) showTransition('login', 1100)
  }

  async function runLogout(path, storageKey, clearSession) {
    authenticatedDuringRestore.current = true
    transitionTimers.current.forEach(window.clearTimeout)
    setTransition({ kind: 'logout', leaving: false })
    try {
      await Promise.all([
        apiRequest(path, { method: 'POST' }),
        new Promise((resolve) => window.setTimeout(resolve, 900)),
      ])
    } catch (error) {
      setTransition(null)
      throw error
    }
    localStorage.removeItem(storageKey)
    queryClient.clear()
    clearSession(null)
    setSessionNotice('')
    showTransition('logout', 150)
  }

  function handleLogout() {
    return runLogout('/logout', APPLICANT_SESSION_KEY, setSession)
  }

  function handleAdminLogout() {
    return runLogout('/admin/logout', ADMIN_SESSION_KEY, setAdminSession)
  }

  function handleProfileUpdated(profile) {
    if (profile.role === 'admin' && adminSession) {
      const updatedSession = {
        ...adminSession,
        admin: { ...adminSession.admin, name: profile.name, email: profile.email },
      }
      localStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify(updatedSession))
      setAdminSession(updatedSession)
    } else if (profile.role !== 'admin' && session) {
      const updatedSession = {
        ...session,
        applicant: { ...session.applicant, name: profile.name, email: profile.email },
      }
      localStorage.setItem(APPLICANT_SESSION_KEY, JSON.stringify(updatedSession))
      setSession(updatedSession)
    }
  }


  const audience = adminSession ? 'admin' : session ? 'applicant' : 'guest'
  const allowedRoutes = audience === 'admin' ? ADMIN_ROUTES : audience === 'applicant' ? APPLICANT_ROUTES : GUEST_ROUTES
  const isKnownPath = pathname === '' || allowedRoutes.includes(pathname)

  // Signing in or out changes what the visitor may open: leave a page that no longer applies.
  useEffect(() => {
    if (previousAudience.current !== audience) {
      previousAudience.current = audience
      if (!isKnownPath) goTo('/', { replace: true })
    }
  }, [audience, isKnownPath])

  if (!isKnownPath && !session?.applicant?.must_change_password && previousAudience.current === audience) {
    return <NotFoundPage />
  }

  let view
  if (adminSession) {
    view = <AdminDashboard onLogout={handleAdminLogout} onProfileUpdated={handleProfileUpdated} session={adminSession} />
  } else if (session?.applicant?.must_change_password) {
    view = <FirstLoginPasswordChange onComplete={handleLogin} onLogout={handleLogout} />
  } else {
    view = <JobCatalog onLogin={handleInteractiveLogin} onLogout={handleLogout} onProfileUpdated={handleProfileUpdated} session={session} sessionNotice={sessionNotice} />
  }

  return (
    <>
      <Suspense fallback={<div aria-busy="true" aria-live="polite" role="status" style={{ minHeight: '100vh' }} />}>
        {view}
      </Suspense>
      {transition &&<SessionTransition kind={transition.kind} leaving={transition.leaving} />}
    </>
  )
}
