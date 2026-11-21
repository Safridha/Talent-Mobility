import { useEffect, useMemo, useRef, useState } from 'react'
import { Search } from 'lucide-react'

const GROUPS = [
  { label: 'Utama', ids: ['dashboard', 'applications'] },
  { label: 'Pengaturan', ids: ['accounts', 'units', 'batches', 'application-limit'] },
  { label: 'Keamanan', ids: ['audit'] },
]

/** Desktop/tablet sidebar: menu search (Ctrl/⌘ + K), grouped sections and a count badge. Mobile uses AdminBottomNav. */
export function AdminSidebar({ views, activeView, onNavigate, badges = {} }) {
  const [query, setQuery] = useState('')
  const inputRef = useRef(null)
  const shortcut = typeof navigator !== 'undefined' && /mac|iphone|ipad/i.test(navigator.platform || navigator.userAgent) ? '⌘K' : 'Ctrl K'

  useEffect(() => {
    function onKeyDown(event) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        inputRef.current?.focus()
        inputRef.current?.select()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])

  const sections = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('id')
    const byId = new Map(views.map((view) => [view.id, view]))
    const known = new Set(GROUPS.flatMap((group) => group.ids))
    const groups = [...GROUPS, { label: 'Lainnya', ids: views.filter((view) => !known.has(view.id)).map((view) => view.id) }]
    return groups
      .map((group) => ({
        label: group.label,
        items: group.ids.map((id) => byId.get(id)).filter((view) => view && (!needle || view.label.toLocaleLowerCase('id').includes(needle))),
      }))
      .filter((group) => group.items.length)
  }, [query, views])

  function onSearchKeyDown(event) {
    if (event.key === 'Enter' && sections[0]?.items[0]) {
      onNavigate(sections[0].items[0].id)
      setQuery('')
      inputRef.current?.blur()
    } else if (event.key === 'Escape') {
      setQuery('')
      inputRef.current?.blur()
    }
  }

  return (
    <nav aria-label="Navigasi dashboard admin" className="admin-tabs admin-sidebar">
      <label className="admin-sidebar-search">
        <Search aria-hidden="true" size={16} />
        <input
          aria-label="Cari menu"
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={onSearchKeyDown}
          placeholder="Cari menu"
          ref={inputRef}
          type="search"
          value={query}
        />
        <kbd aria-hidden="true">{shortcut}</kbd>
      </label>
      {sections.map((group) => (
        <div className="admin-sidebar-group" key={group.label}>
          <span className="admin-sidebar-heading">{group.label}</span>
          {group.items.map((view) => {
            const badge = badges[view.id]
            return (
              <button
                aria-current={activeView === view.id ? 'page' : undefined}
                className={`admin-tab admin-sidebar-item${activeView === view.id ? ' active' : ''}`}
                key={view.id}
                onClick={() => onNavigate(view.id)}
                type="button"
              >
                {view.icon}
                <span>{view.label}</span>
                {badge > 0 && <em aria-label={`${badge} belum dibaca`}>{badge > 99 ? '99+' : badge}</em>}
              </button>
            )
          })}
        </div>
      ))}
      {!sections.length && <p className="admin-sidebar-empty">Menu tidak ditemukan.</p>}
    </nav>
  )
}
