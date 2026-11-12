import { useCallback, useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import JobCatalog from './features/applicant/JobCatalog'
import FirstLoginPasswordChange from './features/auth/FirstLoginPasswordChange'
import AdminDashboard from './features/admin/AdminDashboard'
import { apiRequest } from './api'
import '../css/App.css'

const APPLICANT_SESSION_KEY = 'talent-mobility:applicant-session'
const ADMIN_SESSION_KEY = 'talent-mobility:admin-session'

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
  const storedSessionExists = useRef(Boolean(session || adminSession))
  const restoreSessionRequest = useRef(null)

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
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch((error) => {
      console.error('PWA service worker registration failed.', error)
    })
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

  async function handleLogout() {
    authenticatedDuringRestore.current = true
    await apiRequest('/logout', { method: 'POST' })
    localStorage.removeItem(APPLICANT_SESSION_KEY)
    queryClient.clear()
    setSession(null)
    setSessionNotice('')
  }

  async function handleAdminLogout() {
    authenticatedDuringRestore.current = true
    await apiRequest('/admin/logout', { method: 'POST' })
    localStorage.removeItem(ADMIN_SESSION_KEY)
    queryClient.clear()
    setAdminSession(null)
    setSessionNotice('')
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


  if (adminSession) {
    return <AdminDashboard onLogout={handleAdminLogout} onProfileUpdated={handleProfileUpdated} session={adminSession} />
  }

  if (session?.applicant?.must_change_password) {
    return <FirstLoginPasswordChange onComplete={handleLogin} onLogout={handleLogout} />
  }

  return <JobCatalog onLogin={handleLogin} onLogout={handleLogout} onProfileUpdated={handleProfileUpdated} session={session} sessionNotice={sessionNotice} />
}
