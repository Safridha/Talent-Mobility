const API_URL = import.meta.env.VITE_API_URL || '/api'

export async function apiRequest(path, { token, ...options } = {}) {
  const headers = new Headers(options.headers)
  headers.set('Accept', 'application/json')
  if (options.body) headers.set('Content-Type', 'application/json')
  if (token) headers.set('Authorization', `Bearer ${token}`)

  const response = await fetch(`${API_URL}${path}`, { ...options, headers })
  const payload = await response.json().catch(() => ({}))

  if (!response.ok) {
    throw new Error(payload.message || 'Permintaan gagal. Silakan coba lagi.')
  }

  return payload
}
