const API_URL = import.meta.env.VITE_API_URL || '/api'

function requiresSession(path) {
  return /^\/(account|admin|applications|notifications|push\/subscriptions|session)(\/|$)/.test(path)
    || path === '/logout'
}

export async function apiRequest(path, { suppressSessionExpired = false, ...options } = {}) {
  const headers = new Headers(options.headers)
  headers.set('Accept', 'application/json')
  if (options.body && !(options.body instanceof FormData)) headers.set('Content-Type', 'application/json')

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    credentials: 'same-origin',
    headers,
  })
  const contentType = response.headers.get('content-type') || ''
  if (!contentType.toLowerCase().includes('json')) {
    throw new Error('Respons API tidak valid. Pastikan backend sudah diperbarui.')
  }
  let payload
  try {
    payload = await response.json()
  } catch {
    throw new Error('Respons API tidak valid. Silakan coba lagi.')
  }

  if (response.status === 401) {
    if (suppressSessionExpired) return null
    if (requiresSession(path)) {
      window.dispatchEvent(new Event('talent-mobility:session-expired'))
    }
  }

  if (!response.ok) {
    throw new Error(payload.message || 'Permintaan gagal. Silakan coba lagi.')
  }

  return payload
}

export async function apiDownload(path, options = {}) {
  const headers = new Headers(options.headers)
  headers.set('Accept', 'application/pdf')

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    credentials: 'same-origin',
    headers,
  })
  if (!response.ok) {
    if (response.status === 401 && requiresSession(path)) {
      window.dispatchEvent(new Event('talent-mobility:session-expired'))
    }
    const payload = await response.json().catch(() => ({}))
    throw new Error(payload.message || 'Dokumen belum dapat diunduh.')
  }

  return response.blob()
}
