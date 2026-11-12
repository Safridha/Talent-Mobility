import { useCallback, useEffect, useState } from 'react'

export function readPath() {
  return window.location.pathname.replace(/^\/+|\/+$/g, '')
}

// Changes the URL and lets every listener (App, route hooks) know.
export function goTo(path, { replace = false } = {}) {
  if (replace) window.history.replaceState(null, '', path)
  else if (window.location.pathname !== path) window.history.pushState(null, '', path)
  window.dispatchEvent(new PopStateEvent('popstate'))
}

export function usePathname() {
  const [path, setPath] = useState(readPath)
  useEffect(() => {
    const sync = () => setPath(readPath())
    window.addEventListener('popstate', sync)
    window.addEventListener('hashchange', sync)
    return () => {
      window.removeEventListener('popstate', sync)
      window.removeEventListener('hashchange', sync)
    }
  }, [])
  return path
}

// Routes are real URL paths (e.g. /admin/manajemen-akun) via the History API.
// Old hash links (#/admin/manajemen-akun) are still understood and rewritten to a path.
function readRoute(routes, defaultRoute) {
  const path = readPath()
  if (routes.includes(path)) return path
  const legacy = window.location.hash.replace(/^#\/?/, '')
  if (legacy && routes.includes(legacy)) {
    window.history.replaceState(null, '', `/${legacy}`)
    return legacy
  }
  return defaultRoute
}

export function usePathRoute(defaultRoute, routes) {
  const [route, setRoute] = useState(() => readRoute(routes, defaultRoute))

  useEffect(() => {
    function syncRoute() {
      setRoute(readRoute(routes, defaultRoute))
    }

    window.addEventListener('popstate', syncRoute)
    window.addEventListener('hashchange', syncRoute)
    return () => {
      window.removeEventListener('popstate', syncRoute)
      window.removeEventListener('hashchange', syncRoute)
    }
  }, [defaultRoute, routes])

  const navigate = useCallback((nextRoute) => {
    if (!routes.includes(nextRoute)) {
      throw new Error(`Rute tidak dikenal: ${nextRoute}`)
    }
    goTo(`/${nextRoute}`)
    setRoute(nextRoute)
  }, [routes])

  return [route, navigate]
}
