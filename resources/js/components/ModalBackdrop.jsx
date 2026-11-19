import { useRef } from 'react'
import { useCloseOnBack } from './useCloseOnBack'

export default function ModalBackdrop({
  children,
  className = 'modal-backdrop',
  canDismiss = true,
  onDismiss,
}) {
  const pointer = useRef(null)
  useCloseOnBack(onDismiss, canDismiss && typeof onDismiss === 'function')

  function handlePointerDown(event) {
    pointer.current = event.target === event.currentTarget
      ? { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false }
      : null
  }

  function handlePointerMove(event) {
    const gesture = pointer.current
    if (gesture?.id === event.pointerId && Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) > 12) {
      gesture.moved = true
    }
  }

  function handleClick(event) {
    const gesture = pointer.current
    pointer.current = null
    if (canDismiss && event.target === event.currentTarget && gesture && !gesture.moved) {
      onDismiss()
    }
  }

  return (
    <div
      className={className}
      onClick={handleClick}
      onPointerCancel={() => { pointer.current = null }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      role="presentation"
    >
      {children}
    </div>
  )
}
