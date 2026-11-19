import { useEffect, useRef } from 'react'

/**
 * Gives an open dialog its own browser-history entry so the phone's Back button / swipe-back closes
 * just that dialog instead of leaving the app (which showed up as a blank white page).
 * Each dialog tags its entry; a popstate only closes the dialog whose entry was popped, so stacked
 * dialogs (review -> PDF preview) unwind one at a time.
 */
export function useCloseOnBack(onClose, enabled = true) {
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return undefined
    const tag = `modal-${Math.random().toString(36).slice(2)}`
    let pushed = false
    let poppedByUser = false

    // Deferred so React StrictMode's throw-away first mount never touches history.
    const timer = window.setTimeout(() => {
      window.history.pushState({ ...(window.history.state || {}), __modal: tag }, '')
      pushed = true
    }, 0)

    function onPop() {
      if (!pushed || window.history.state?.__modal === tag) return
      poppedByUser = true
      pushed = false
      closeRef.current?.()
    }
    window.addEventListener('popstate', onPop)

    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('popstate', onPop)
      // Closed with a button: drop the entry we added so Back does not need an extra press.
      if (pushed && !poppedByUser && window.history.state?.__modal === tag) window.history.back()
    }
  }, [enabled])
}
