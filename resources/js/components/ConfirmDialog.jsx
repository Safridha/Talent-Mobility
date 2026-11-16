import { useEffect, useRef } from 'react'
import { HelpCircle } from 'lucide-react'
import ModalBackdrop from './ModalBackdrop'

export default function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Ya, lanjutkan',
  cancelLabel = 'Batal',
  onConfirm,
  onCancel,
}) {
  const confirmRef = useRef(null)

  useEffect(() => {
    confirmRef.current?.focus()
    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onCancel()
      }
    }
    document.addEventListener('keydown', handleKeyDown, true)
    return () => document.removeEventListener('keydown', handleKeyDown, true)
  }, [onCancel])

  return (
    <ModalBackdrop className="confirm-dialog-backdrop" onDismiss={onCancel}>
      <section
        aria-describedby="confirm-dialog-message"
        aria-labelledby="confirm-dialog-title"
        aria-modal="true"
        className="confirm-dialog"
        onClick={(event) => event.stopPropagation()}
        role="alertdialog"
      >
        <span aria-hidden="true" className="confirm-dialog-icon"><HelpCircle size={34} /></span>
        <h2 id="confirm-dialog-title">{title}</h2>
        <p id="confirm-dialog-message">{message}</p>
        <div className="confirm-dialog-actions">
          <button className="detail-button" onClick={onCancel} type="button">{cancelLabel}</button>
          <button className="apply-button" onClick={onConfirm} ref={confirmRef} type="button">{confirmLabel}</button>
        </div>
      </section>
    </ModalBackdrop>
  )
}
