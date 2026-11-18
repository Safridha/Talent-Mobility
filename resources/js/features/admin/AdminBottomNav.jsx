import { useEffect, useRef, useState } from 'react'
import { Ellipsis, X } from 'lucide-react'

const MAX_BAR_ITEMS = 5

/**
 * Mobile navigation: a floating bar at the bottom of the screen (hidden on desktop by CSS). The active
 * item's icon lifts into a bubble that slides sideways to the new item, so switching menus animates.
 * With more than five views the first four stay on the bar and the rest open from "Lainnya".
 */
export function AdminBottomNav({ views, activeView, onNavigate }) {
  const [isMoreOpen, setIsMoreOpen] = useState(false)
  const moreButtonRef = useRef(null)
  const sheetRef = useRef(null)

  const hasOverflow = views.length > MAX_BAR_ITEMS
  const barViews = hasOverflow ? views.slice(0, MAX_BAR_ITEMS - 1) : views
  const moreViews = hasOverflow ? views.slice(MAX_BAR_ITEMS - 1) : []
  const items = hasOverflow ? [...barViews, { id: '__more', label: 'Lainnya', icon: null }] : barViews
  const activeInMore = moreViews.some((view) => view.id === activeView)
  const activeIndex = activeInMore
    ? items.length - 1
    : barViews.findIndex((view) => view.id === activeView)

  useEffect(() => {
    if (!isMoreOpen) return undefined
    function onKeyDown(event) {
      if (event.key === 'Escape') {
        setIsMoreOpen(false)
        moreButtonRef.current?.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    sheetRef.current?.querySelector('button')?.focus()
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [isMoreOpen])

  if (!items.length) return null

  function choose(view) {
    setIsMoreOpen(false)
    onNavigate(view.id)
  }

  return (
    <>
      <nav
        aria-label="Navigasi admin"
        className={`admin-bottom-nav${activeIndex < 0 ? ' has-no-active' : ''}`}
        style={{ '--nav-count': items.length, '--nav-active': Math.max(activeIndex, 0) }}
      >
        <span aria-hidden="true" className="admin-bottom-nav-bubble" />
        {items.map((item, index) => {
          const isMore = item.id === '__more'
          const isActive = index === activeIndex
          return (
            <button
              aria-controls={isMore ? 'admin-more-sheet' : undefined}
              aria-current={isActive && !isMore ? 'page' : undefined}
              aria-expanded={isMore ? isMoreOpen : undefined}
              className={`admin-bottom-nav-item${isActive ? ' is-active' : ''}`}
              key={item.id}
              onClick={() => (isMore ? setIsMoreOpen((open) => !open) : choose(item))}
              ref={isMore ? moreButtonRef : undefined}
              type="button"
            >
              <span aria-hidden="true" className="admin-bottom-nav-icon">{isMore ? <Ellipsis size={22} /> : item.barIcon}</span>
              <span className="admin-bottom-nav-label">{isMore ? item.label : item.shortLabel || item.label}</span>
            </button>
          )
        })}
      </nav>
      {hasOverflow && (
        <div aria-hidden={!isMoreOpen} className={`admin-more-layer${isMoreOpen ? ' is-open' : ''}`}>
          <button aria-label="Tutup menu lainnya" className="admin-more-backdrop" onClick={() => setIsMoreOpen(false)} tabIndex={isMoreOpen ? 0 : -1} type="button" />
          <section aria-label="Menu lainnya" className="admin-more-sheet" id="admin-more-sheet" ref={sheetRef}>
            <header>
              <strong>Menu lainnya</strong>
              <button aria-label="Tutup" onClick={() => setIsMoreOpen(false)} tabIndex={isMoreOpen ? 0 : -1} type="button"><X size={18} /></button>
            </header>
            {moreViews.map((view) => (
              <button
                aria-current={view.id === activeView ? 'page' : undefined}
                className={`admin-more-item${view.id === activeView ? ' is-active' : ''}`}
                key={view.id}
                onClick={() => choose(view)}
                tabIndex={isMoreOpen ? 0 : -1}
                type="button"
              >
                <span aria-hidden="true">{view.icon}</span>
                {view.label}
              </button>
            ))}
          </section>
        </div>
      )}
    </>
  )
}
