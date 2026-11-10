import { Download, Search, Trash2, X } from 'lucide-react'
import ModalBackdrop from '../../components/ModalBackdrop'

export function AdminTableToolbar({
  search,
  onSearchChange,
  searchPlaceholder,
  filters = [],
  resultCount,
  totalCount,
  onDownloadCsv,
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
      {filters.map((filter) => (
        <label className="admin-table-filter" key={filter.label}>
          <span>{filter.label}</span>
          <select onChange={(event) => filter.onChange(event.target.value)} value={filter.value}>
            <option value="all">{filter.allLabel || 'Semua'}</option>
            {filter.options.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
      ))}
      <span className="admin-table-count">Menampilkan <strong>{resultCount}</strong> dari {totalCount}</span>
      {onDownloadCsv && (
        <button className="admin-small-button admin-export-button" disabled={downloadDisabled} onClick={onDownloadCsv} type="button">
          <Download aria-hidden="true" size={15} /> Unduh CSV
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
