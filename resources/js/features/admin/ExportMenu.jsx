import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ChevronDown, Download, FileSpreadsheet, FileText } from 'lucide-react'

const MENU_WIDTH = 250
const FORMATS = [
  { id: 'pdf', label: 'PDF', hint: 'Laporan rapi, siap dicetak', Icon: FileText },
  { id: 'xlsx', label: 'Excel (.xlsx)', hint: 'Semua kolom, bisa difilter', Icon: FileSpreadsheet },
]

/**
 * "Unduh" button that opens a small PDF / Excel menu. `onExport(format)` does the work (it may be
 * async); while it runs the button shows a busy label, and a failure is shown next to the button.
 * The menu is `position: fixed`, so scrolling table wrappers cannot clip it.
 */
export function ExportMenu({ onExport, disabled = false }) {
  const [isOpen, setIsOpen] = useState(false)
  const [position, setPosition] = useState({ top: 0, left: 0 })
  const [busyFormat, setBusyFormat] = useState(null)
  const [error, setError] = useState('')
  const triggerRef = useRef(null)
  const menuRef = useRef(null)
  const close = useCallback(() => setIsOpen(false), [])

  useLayoutEffect(() => {
    if (!isOpen || !triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    const left = Math.min(Math.max(8, rect.right - MENU_WIDTH), Math.max(8, window.innerWidth - MENU_WIDTH - 8))
    setPosition({ top: rect.bottom + 6, left })
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return undefined
    function onPointerDown(event) {
      if (menuRef.current?.contains(event.target) || triggerRef.current?.contains(event.target)) return
      close()
    }
    function onKeyDown(event) {
      if (event.key === 'Escape') {
        close()
        triggerRef.current?.focus()
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    window.addEventListener('resize', close)
    window.addEventListener('scroll', close, true)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('resize', close)
      window.removeEventListener('scroll', close, true)
    }
  }, [isOpen, close])

  async function run(format) {
    close()
    setError('')
    setBusyFormat(format)
    try {
      await onExport(format)
    } catch (exportError) {
      setError(exportError?.message || 'Berkas belum dapat dibuat. Silakan coba lagi.')
    } finally {
      setBusyFormat(null)
    }
  }

  return (
    <>
      <button
        aria-expanded={isOpen}
        aria-haspopup="menu"
        className="admin-small-button admin-export-button"
        disabled={disabled || busyFormat !== null}
        onClick={() => setIsOpen((open) => !open)}
        ref={triggerRef}
        type="button"
      >
        <Download aria-hidden="true" size={15} />
        {busyFormat ? 'Menyiapkan...' : 'Unduh'}
        <ChevronDown aria-hidden="true" className="application-download-chevron" size={14} />
      </button>
      {error && <span className="admin-export-error" role="alert">{error}</span>}
      {isOpen && (
        <div className="application-download-menu" ref={menuRef} role="menu" style={{ top: position.top, left: position.left, width: MENU_WIDTH }}>
          {FORMATS.map(({ id, label, hint, Icon }) => (
            <button className="application-download-item" key={id} onClick={() => void run(id)} role="menuitem" type="button">
              <Icon aria-hidden="true" size={16} />
              <span><strong>{label}</strong><small>{hint}</small></span>
            </button>
          ))}
        </div>
      )}
    </>
  )
}
