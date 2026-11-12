import { useCallback, useEffect, useState } from 'react'

// Routes are real URL paths (e.g. /admin/manajemen-akun) via the History API.
// Old hash links (#/admin/manajemen-akun) are still understood and rewritten to a path.
function readRoute(routes, defaultRoute) {
  const path = window.location.pathname.replace(/^\/+|\/+$/g, '')
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
    if (window.location.pathname !== `/${nextRoute}`) {
      window.history.pushState(null, '', `/${nextRoute}`)
    }
    setRoute(nextRoute)
  }, [routes])

  return [route, navigate]
}
