const API_URL = import.meta.env.VITE_API_URL || '/api'

const NETWORK_ERROR_MESSAGE = 'Tidak dapat terhubung ke server. Periksa koneksi internet Anda lalu coba lagi.'
const SERVER_UNAVAILABLE_MESSAGE = 'Server sedang sibuk atau dalam pemeliharaan. Silakan coba lagi beberapa saat lagi.'

function requiresSession(path) {
  return /^\/(account|admin|applications|notifications|push\/subscriptions|session)(\/|$)/.test(path)
    || path === '/logout'
}

export async function apiRequest(path, { suppressSessionExpired = false, ...options } = {}) {
  const headers = new Headers(options.headers)
  headers.set('Accept', 'application/json')
  if (options.body && !(options.body instanceof FormData)) headers.set('Content-Type', 'application/json')

  let response
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...options,
      credentials: 'same-origin',
      headers,
    })
  } catch (networkError) {
    if (networkError?.name === 'AbortError') throw networkError
    throw new Error(NETWORK_ERROR_MESSAGE)
  }
  const contentType = response.headers.get('content-type') || ''
  if (!contentType.toLowerCase().includes('json')) {
    if (response.status >= 500) throw new Error(SERVER_UNAVAILABLE_MESSAGE)
    throw new Error('Respons dari server tidak valid. Silakan muat ulang halaman lalu coba lagi.')
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

// `onProgress(fraction)` is called while the body streams in (0..1), or once with null when the
// server did not send a Content-Length, so callers can show a determinate or indeterminate bar.
export async function apiDownload(path, { onProgress, ...options } = {}) {
  const headers = new Headers(options.headers)
  headers.set('Accept', 'application/pdf')

  let response
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...options,
      credentials: 'same-origin',
      headers,
    })
  } catch (networkError) {
    if (networkError?.name === 'AbortError') throw networkError
    throw new Error(NETWORK_ERROR_MESSAGE)
  }
  if (!response.ok) {
    if (response.status === 401 && requiresSession(path)) {
      window.dispatchEvent(new Event('talent-mobility:session-expired'))
    }
    const payload = await response.json().catch(() => ({}))
    throw new Error(payload.message || 'Dokumen belum dapat diunduh.')
  }

  const total = Number(response.headers.get('content-length')) || 0
  if (!onProgress || !response.body || !total) {
    onProgress?.(null)
    return response.blob()
  }
  const reader = response.body.getReader()
  const chunks = []
  let loaded = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    loaded += value.length
    onProgress(Math.min(1, loaded / total))
  }
  return new Blob(chunks, { type: response.headers.get('content-type') || 'application/pdf' })
}

// fetch cannot report upload progress, so large uploads (several PDFs) use XMLHttpRequest. Same JSON/error
// contract as apiRequest; `onProgress` receives a number between 0 and 1.
export function apiUpload(path, { method = 'POST', body, headers = {}, onProgress } = {}) {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest()
    request.open(method, `${API_URL}${path}`)
    request.setRequestHeader('Accept', 'application/json')
    for (const [name, value] of Object.entries(headers)) request.setRequestHeader(name, value)
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(event.loaded / event.total)
    }
    request.onerror = () => reject(new Error('Koneksi terputus saat mengunggah. Coba lagi; berkas yang sama tidak akan terkirim dua kali.'))
    request.onabort = () => reject(new Error('Pengunggahan dibatalkan.'))
    request.ontimeout = () => reject(new Error('Pengunggahan terlalu lama. Periksa koneksi lalu coba lagi.'))
    request.onload = () => {
      let payload = {}
      try {
        payload = JSON.parse(request.responseText || '{}')
      } catch {
        reject(new Error('Respons API tidak valid. Silakan coba lagi.'))
        return
      }
      if (request.status === 401 && requiresSession(path)) {
        window.dispatchEvent(new Event('talent-mobility:session-expired'))
      }
      if (request.status >= 200 && request.status < 300) {
        onProgress?.(1)
        resolve(payload)
      } else {
        reject(new Error(payload.message || 'Permintaan gagal. Silakan coba lagi.'))
      }
    }
    request.send(body)
  })
}
