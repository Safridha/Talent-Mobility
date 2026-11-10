import { useCallback, useEffect, useState } from 'react'

function readRoute(routes, defaultRoute) {
  const route = window.location.hash.slice(1).replace(/^\/+/, '')
  return routes.includes(route) ? route : defaultRoute
}

export function useHashRoute(defaultRoute, routes) {
  const [route, setRoute] = useState(() => readRoute(routes, defaultRoute))

  useEffect(() => {
    function syncRoute() {
      setRoute(readRoute(routes, defaultRoute))
    }

    window.addEventListener('hashchange', syncRoute)
    window.addEventListener('popstate', syncRoute)
    return () => {
      window.removeEventListener('hashchange', syncRoute)
      window.removeEventListener('popstate', syncRoute)
    }
  }, [defaultRoute, routes])

  const navigate = useCallback((nextRoute) => {
    if (!routes.includes(nextRoute)) {
      throw new Error(`Rute tidak dikenal: ${nextRoute}`)
    }
    if (window.location.hash !== `#/${nextRoute}`) {
      window.location.hash = `/${nextRoute}`
    }
    setRoute(nextRoute)
  }, [routes])

  return [route, navigate]
}
