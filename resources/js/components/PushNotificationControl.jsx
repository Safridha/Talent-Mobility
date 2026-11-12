import { useEffect, useState } from 'react'
import { Bell, BellOff, BellPlus, BellRing, LoaderCircle } from 'lucide-react'
import { apiRequest } from '../api'

function decodeApplicationServerKey(value) {
  const padded = value + '='.repeat((4 - value.length % 4) % 4)
  const decoded = window.atob(padded.replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(decoded, (character) => character.charCodeAt(0))
}

async function getPushRegistration() {
  await navigator.serviceWorker.register('/sw.js', { scope: '/' })
  return navigator.serviceWorker.ready
}

export default function PushNotificationControl() {
  const [config, setConfig] = useState(null)
  const [subscription, setSubscription] = useState(null)
  const [permission, setPermission] = useState('default')
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [supported, setSupported] = useState(true)

  useEffect(() => {
    let active = true
    async function loadPushState() {
      try {
        const pushConfig = await apiRequest('/push/config')
        if (!active) return
        setConfig(pushConfig)
        if (!pushConfig.enabled) return

        const browserSupportsPush = window.isSecureContext
          && 'Notification' in window
          && 'serviceWorker' in navigator
          && 'PushManager' in window
        setSupported(browserSupportsPush)
        if (!browserSupportsPush) return

        setPermission(Notification.permission)
        const registration = await getPushRegistration()
        const existingSubscription = await registration.pushManager.getSubscription()
        if (!active) return
        setSubscription(existingSubscription)
        if (existingSubscription) {
          await apiRequest('/push/subscriptions', {
            method: 'PUT',
            body: JSON.stringify(existingSubscription.toJSON()),
          })
        }
      } catch (requestError) {
        if (active) setError(requestError.message)
      } finally {
        if (active) setIsLoading(false)
      }
    }

    void loadPushState()
    return () => { active = false }
  }, [])

  async function enablePush() {
    setError('')
    setNotice('')
    setIsSaving(true)
    let createdSubscription = null
    try {
      const nextPermission = await Notification.requestPermission()
      setPermission(nextPermission)
      if (nextPermission !== 'granted') {
        throw new Error('Izin notifikasi tidak diberikan. Periksa pengaturan situs di browser.')
      }
      const registration = await getPushRegistration()
      const existingSubscription = await registration.pushManager.getSubscription()
      createdSubscription = existingSubscription || await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: decodeApplicationServerKey(config.public_key),
      })
      try {
        await apiRequest('/push/subscriptions', {
          method: 'PUT',
          body: JSON.stringify(createdSubscription.toJSON()),
        })
      } catch (requestError) {
        if (!existingSubscription) await createdSubscription.unsubscribe()
        throw requestError
      }
      setSubscription(createdSubscription)
      setNotice('Notifikasi push berhasil diaktifkan di perangkat ini.')
    } catch (requestError) {
      setError(requestError.message || 'Notifikasi push belum dapat diaktifkan.')
    } finally {
      setIsSaving(false)
    }
  }

  async function disablePush() {
    if (!subscription) return
    setError('')
    setNotice('')
    setIsSaving(true)
    try {
      await apiRequest('/push/subscriptions', {
        method: 'DELETE',
        body: JSON.stringify({ endpoint: subscription.endpoint }),
      })
      await subscription.unsubscribe()
      setSubscription(null)
      setNotice('Notifikasi push dinonaktifkan di perangkat ini.')
    } catch (requestError) {
      setError(requestError.message || 'Notifikasi push belum dapat dinonaktifkan.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <section aria-label="Pengaturan notifikasi push" className="push-notification-control">
      <div className="push-notification-copy">
        {subscription ? <BellRing aria-hidden="true" size={18} /> : <Bell aria-hidden="true" size={18} />}
        <div>
          <strong>Notifikasi perangkat</strong>
          <span>
            {isLoading
              ? 'Memeriksa dukungan perangkat...'
              : !config?.enabled
                ? 'Web Push belum dikonfigurasi di server.'
                : !supported
                  ? 'Perlu browser yang mendukung notifikasi dan koneksi HTTPS.'
                  : permission === 'denied'
                    ? 'Izin notifikasi diblokir pada pengaturan browser.'
                    : subscription
                      ? 'Push aktif untuk perangkat ini.'
                      : 'Terima pembaruan meski halaman tidak sedang dibuka.'}
          </span>
        </div>
      </div>
      {config?.enabled && supported && permission !== 'denied' && (
        <button
          aria-label={subscription ? 'Nonaktifkan notifikasi perangkat' : 'Aktifkan notifikasi perangkat'}
          className={`push-notification-toggle${subscription ? ' is-active' : ''}`}
          disabled={isLoading || isSaving}
          onClick={() => void (subscription ? disablePush() : enablePush())}
          title={isSaving ? 'Menyimpan...' : subscription ? 'Nonaktifkan notifikasi' : 'Aktifkan notifikasi'}
          type="button"
        >
          {isSaving
            ? <LoaderCircle aria-hidden="true" className="push-notification-spinner" size={16} />
            : subscription
              ? <BellOff aria-hidden="true" size={16} />
              : <BellPlus aria-hidden="true" size={16} />}
        </button>
      )}
      {notice && <p className="push-notification-message" role="status">{notice}</p>}
      {error && <p className="push-notification-message error" role="alert">{error}</p>}
    </section>
  )
}
