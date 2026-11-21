import { createPortal } from 'react-dom'
import { useState } from 'react'
import { Search, Trash2, X } from 'lucide-react'
import ModalBackdrop from '../../components/ModalBackdrop'
import SearchableSelect from '../../components/SearchableSelect'
import { ExportMenu } from './ExportMenu'

function AdminTableFilter({ filter, onPageChange }) {
  return (
    <label className="admin-table-filter">
      <span>{filter.label}</span>
      <SearchableSelect
        onChange={(value) => {
          filter.onChange(value)
          onPageChange?.(1)
        }}
        options={[
          { value: 'all', label: filter.allLabel || 'Semua' },
          ...filter.options,
        ]}
        placeholder={filter.allLabel || 'Semua'}
        value={filter.value}
      />
    </label>
  )
}

// "Status akun: Aktif  ·  Pencarian: "budi"" - what the exported report says it was filtered by.
function describeActiveFilters(filters, search) {
  const parts = filters
    .map((filter) => {
      const option = filter.options.find((item) => String(item.value) === String(filter.value))
      return filter.value && filter.value !== 'all' && option ? `${filter.label}: ${option.label}` : null
    })
    .filter(Boolean)
  if (search?.trim()) parts.push(`Pencarian: "${search.trim()}"`)
  return parts.length ? parts.join('  ·  ') : 'Semua data'
}

export function AdminTableToolbar({
  search,
  onSearchChange,
  searchPlaceholder,
  filters = [],
  onPageChange,
  onDownload,
  downloadDisabled = false,
}) {
  return (
    <div className="admin-table-toolbar">
      <label className="admin-table-search">
        <Search aria-hidden="true" size={16} />
        <input
          aria-label={searchPlaceholder}
          onChange={(event) => {
            onSearchChange(event.target.value)
            onPageChange?.(1)
          }}
          placeholder={searchPlaceholder}
          value={search}
        />
      </label>
      {filters.map((filter) => <AdminTableFilter filter={filter} key={filter.label} onPageChange={onPageChange} />)}
      {onDownload && (
        <ExportMenu
          disabled={downloadDisabled}
          onExport={(format) => onDownload(format, { filterText: describeActiveFilters(filters, search) })}
        />
      )}
    </div>
  )
}

// Case, extra spaces and surrounding whitespace do not matter when comparing the typed phrase.
function normalizePhrase(text) {
  return String(text ?? '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('id')
}

/**
 * Confirmation dialog. With `confirmPhrase` the user must also type that exact phrase before the confirm
 * button works (used for irreversible actions, e.g. "hapus akun 105265015"). The dialog is mounted only
 * while it is open, so the typed text always starts empty.
 */
export function ConfirmDialog({ title, message, details, error, isBusy, onCancel, onConfirm, confirmLabel = 'Hapus', busyLabel = 'Menghapus...', icon: Icon = Trash2, tone = 'danger', confirmPhrase }) {
  const [typed, setTyped] = useState('')
  const needsPhrase = Boolean(confirmPhrase)
  const phraseMatches = !needsPhrase || normalizePhrase(typed) === normalizePhrase(confirmPhrase)
  const canConfirm = phraseMatches && !isBusy

  function confirm() {
    // A phrase dialog hands the typed text to the caller (the server verifies it too).
    if (canConfirm) onConfirm(needsPhrase ? typed : undefined)
  }

  return (
    <ModalBackdrop className="modal-backdrop admin-confirm-backdrop" canDismiss={!isBusy} onDismiss={onCancel}>
      <section
        aria-labelledby="admin-confirm-title"
        aria-modal="true"
        className="detail-modal admin-confirm-dialog"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className="admin-confirm-icon"><Icon size={21} /></div>
        <h2 id="admin-confirm-title">{title}</h2>
        <p>{message}</p>
        {details?.length > 0 && (
          <ul className="admin-confirm-details">
            {details.map((detail) => <li key={detail}>{detail}</li>)}
          </ul>
        )}
        {needsPhrase && (
          <label className="admin-confirm-phrase">
            <span>Ketik <code>{confirmPhrase}</code> untuk melanjutkan</span>
            <input
              aria-invalid={typed.length > 0 && !phraseMatches}
              autoCapitalize="none"
              autoComplete="off"
              autoCorrect="off"
              autoFocus
              disabled={isBusy}
              onChange={(event) => setTyped(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  confirm()
                }
              }}
              placeholder={confirmPhrase}
              spellCheck={false}
              value={typed}
            />
            <small className={phraseMatches ? 'is-match' : ''}>
              {phraseMatches ? 'Teks cocok. Tombol hapus aktif.' : 'Teks harus sama persis, termasuk NIP.'}
            </small>
          </label>
        )}
        {error && <p className="admin-alert error" role="alert">{error}</p>}
        <div className="admin-confirm-actions">
          <button className="detail-button" disabled={isBusy} onClick={onCancel} type="button">Batal</button>
          <button className={tone === 'danger' ? 'admin-danger-button' : 'apply-button'} disabled={!canConfirm} onClick={confirm} type="button">
            {isBusy ? busyLabel : confirmLabel}
          </button>
        </div>
      </section>
    </ModalBackdrop>
  )
}

export function AdminFormDialog({ title, description = '', onClose, children, className = '', fullScreen = false }) {
  // Rendered next to the page shell instead of inside the panel that opened it, so a parent's overflow
  // or stacking context can never clip or shrink the dialog.
  const host = (typeof document !== 'undefined' && document.querySelector('.admin-shell')) || document.body
  return createPortal(
    <ModalBackdrop className={fullScreen ? 'modal-backdrop admin-fullscreen-backdrop' : 'modal-backdrop'} onDismiss={onClose}>
      <section
        aria-labelledby="admin-form-dialog-title"
        aria-modal="true"
        className={`detail-modal admin-editor-modal ${fullScreen ? 'admin-fullscreen-modal' : ''} ${className}`}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className="modal-heading">
          <div>
            <h2 id="admin-form-dialog-title">{title}</h2>
            {description && <p className="admin-form-dialog-subtitle">{description}</p>}
          </div>
          <button aria-label="Tutup form" className="icon-button" onClick={onClose} type="button"><X size={20} /></button>
        </div>
        {children}
      </section>
    </ModalBackdrop>,
    host,
  )
}
