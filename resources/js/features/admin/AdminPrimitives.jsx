import { useEffect, useId, useRef, useState } from 'react'
import { Download, Search, Trash2, X } from 'lucide-react'
import ModalBackdrop from '../../components/ModalBackdrop'

function AdminTableFilter({ filter }) {
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef(null)
  const triggerRef = useRef(null)
  const optionRefs = useRef([])
  const labelId = useId()
  const listId = useId()
  const valueId = useId()
  const options = [
    { value: 'all', label: filter.allLabel || 'Semua' },
    ...filter.options,
  ]
  const selectedOption = options.find((option) => option.value === filter.value) || options[0]

  useEffect(() => {
    if (!isOpen) return undefined

    function closeOnOutsideClick(event) {
      if (!containerRef.current?.contains(event.target)) setIsOpen(false)
    }

    document.addEventListener('pointerdown', closeOnOutsideClick)
    return () => document.removeEventListener('pointerdown', closeOnOutsideClick)
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
    const selectedIndex = optionRefs.current.findIndex(
      (option) => option?.dataset.value === String(filter.value),
    )
    optionRefs.current[Math.max(0, selectedIndex)]?.focus()
  }, [isOpen, filter.value])

  function handleKeyDown(event) {
    if (event.key === 'Escape') {
      event.preventDefault()
      setIsOpen(false)
      triggerRef.current?.focus()
      return
    }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return

    event.preventDefault()
    if (!isOpen) {
      setIsOpen(true)
      return
    }

    const currentIndex = optionRefs.current.indexOf(document.activeElement)
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? options.length - 1
        : Math.min(
            options.length - 1,
            Math.max(0, currentIndex + (event.key === 'ArrowDown' ? 1 : -1)),
          )
    optionRefs.current[nextIndex]?.focus()
  }

  function chooseOption(value) {
    filter.onChange(value)
    setIsOpen(false)
    triggerRef.current?.focus()
  }

  return (
    <div className={`admin-table-filter${isOpen ? ' is-open' : ''}`}>
      <span id={labelId}>{filter.label}</span>
      <div
        className="admin-table-filter-select"
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) setIsOpen(false)
        }}
        onKeyDown={handleKeyDown}
        ref={containerRef}
      >
        <button
          aria-controls={listId}
          aria-expanded={isOpen}
          aria-haspopup="listbox"
          aria-labelledby={`${labelId} ${valueId}`}
          className="admin-table-filter-trigger"
          onClick={() => setIsOpen((open) => !open)}
          ref={triggerRef}
          type="button"
        >
          <span className="admin-table-filter-value" id={valueId}>{selectedOption.label}</span>
          <span aria-hidden="true" className={`admin-table-filter-chevron${isOpen ? ' is-open' : ''}`} />
        </button>
        {isOpen && (
          <div aria-labelledby={labelId} className="admin-table-filter-menu" id={listId} role="listbox">
            {options.map((option, index) => (
              <button
                aria-selected={option.value === filter.value}
                className="admin-table-filter-option"
                data-value={option.value}
                key={option.value}
                onClick={() => chooseOption(option.value)}
                ref={(element) => { optionRefs.current[index] = element }}
                role="option"
                type="button"
              >
                {option.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export function AdminTableToolbar({
  search,
  onSearchChange,
  searchPlaceholder,
  filters = [],
  resultCount,
  totalCount,
  onDownloadPdf,
  downloadDisabled = false,
}) {
  return (
    <div className="admin-table-toolbar">
      <label className="admin-table-search">
        <Search aria-hidden="true" size={16} />
        <input
          aria-label={searchPlaceholder}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder={searchPlaceholder}
          value={search}
        />
      </label>
      {filters.map((filter) => <AdminTableFilter filter={filter} key={filter.label} />)}
      <span className="admin-table-count">Menampilkan <strong>{resultCount}</strong> dari {totalCount}</span>
      {onDownloadPdf && (
        <button className="admin-small-button admin-export-button" disabled={downloadDisabled} onClick={onDownloadPdf} type="button">
          <Download aria-hidden="true" size={15} /> Unduh PDF
        </button>
      )}
    </div>
  )
}

export function ConfirmDialog({ title, message, error, isBusy, onCancel, onConfirm }) {
  return (
    <ModalBackdrop className="modal-backdrop admin-confirm-backdrop" canDismiss={!isBusy} onDismiss={onCancel}>
      <section
        aria-labelledby="admin-confirm-title"
        aria-modal="true"
        className="detail-modal admin-confirm-dialog"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className="admin-confirm-icon"><Trash2 size={21} /></div>
        <h2 id="admin-confirm-title">{title}</h2>
        <p>{message}</p>
        {error && <p className="admin-alert error" role="alert">{error}</p>}
        <div className="admin-confirm-actions">
          <button className="detail-button" disabled={isBusy} onClick={onCancel} type="button">Batal</button>
          <button className="admin-danger-button" disabled={isBusy} onClick={onConfirm} type="button">
            {isBusy ? 'Menghapus...' : 'Hapus'}
          </button>
        </div>
      </section>
    </ModalBackdrop>
  )
}

export function AdminFormDialog({ title, onClose, children, className = '' }) {
  return (
    <ModalBackdrop onDismiss={onClose}>
      <section
        aria-labelledby="admin-form-dialog-title"
        aria-modal="true"
        className={`detail-modal admin-editor-modal ${className}`}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className="modal-heading">
          <h2 id="admin-form-dialog-title">{title}</h2>
          <button aria-label="Tutup form" className="icon-button" onClick={onClose} type="button"><X size={20} /></button>
        </div>
        {children}
      </section>
    </ModalBackdrop>
  )
}
