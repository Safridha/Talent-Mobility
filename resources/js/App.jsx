import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import JobCatalog from './features/applicant/JobCatalog'
import PasswordResetPage from './features/auth/PasswordResetPage'
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
    if (session?.token) return session
  } catch {
    localStorage.removeItem(key)
    return null
  }
  localStorage.removeItem(key)
  return null
}

export default function App() {
  const queryClient = useQueryClient()
  const [session, setSession] = useState(() => readStoredSession(APPLICANT_SESSION_KEY))
  const [adminSession, setAdminSession] = useState(() => readStoredSession(ADMIN_SESSION_KEY))
  const [sessionNotice, setSessionNotice] = useState('')
  const resetHash = window.location.hash.slice(1)
  const resetToken = resetHash.startsWith('reset_token=')
    ? new URLSearchParams(resetHash).get('reset_token')
    : null

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

  function handleLogin(newSession) {
    queryClient.clear()
    setSessionNotice('')
    if (newSession.role === 'admin' || newSession.admin) {
      localStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify(newSession))
      localStorage.removeItem(APPLICANT_SESSION_KEY)
      setSession(null)
      setAdminSession(newSession)
      return
    }
    localStorage.setItem(APPLICANT_SESSION_KEY, JSON.stringify(newSession))
    localStorage.removeItem(ADMIN_SESSION_KEY)
    setAdminSession(null)
    setSession(newSession)
  }

  async function handleLogout() {
    await apiRequest('/logout', { method: 'POST', token: session.token })
    localStorage.removeItem(APPLICANT_SESSION_KEY)
    queryClient.clear()
    setSession(null)
    setSessionNotice('')
  }

  async function handleAdminLogout() {
    await apiRequest('/admin/logout', { method: 'POST', token: adminSession.token })
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

  if (resetToken) {
    return <PasswordResetPage token={resetToken} />
  }

  if (adminSession) {
    return <AdminDashboard onLogout={handleAdminLogout} onProfileUpdated={handleProfileUpdated} session={adminSession} />
  }

  return <JobCatalog onLogin={handleLogin} onLogout={handleLogout} onProfileUpdated={handleProfileUpdated} session={session} sessionNotice={sessionNotice} />
}
