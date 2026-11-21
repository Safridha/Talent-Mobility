import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import { formatBatchDate, parseBatchDate, toBatchIso } from '../features/batches/batchFormat'

const WEEKDAYS = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min']
const POPOVER_WIDTH = 292
const POPOVER_HEIGHT = 340

function isIso(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value || '')
}

/**
 * Date picker where days that cannot be chosen are blocked outright (greyed out, not clickable).
 * `min` / `max` bound the range; `blocked` is a list of { start, end, name } ranges that are taken.
 */
export default function DateField({ ariaLabel, blocked = [], max = '', min = '', onChange, placeholder = 'Pilih tanggal', value }) {
  const [open, setOpen] = useState(false)
  const [view, setView] = useState(() => new Date())
  const [position, setPosition] = useState({ top: 0, left: 0 })
  const triggerRef = useRef(null)
  const popoverRef = useRef(null)
  const [todayIso] = useState(() => toBatchIso(new Date()))

  function reasonFor(day) {
    if (min && day < min) return 'Sebelum tanggal yang diperbolehkan'
    if (max && day > max) return 'Melewati batas tanggal yang diperbolehkan'
    const clash = blocked.find((range) => range.start <= day && day <= range.end)
    return clash ? `Bentrok dengan ${clash.name}` : ''
  }

  function openPicker() {
    const anchor = isIso(value) ? value : isIso(min) ? min : todayIso
    const base = parseBatchDate(anchor)
    setView(new Date(base.getFullYear(), base.getMonth(), 1))
    const rect = triggerRef.current.getBoundingClientRect()
    const fitsBelow = rect.bottom + POPOVER_HEIGHT + 8 <= window.innerHeight
    setPosition({
      top: fitsBelow ? rect.bottom + 6 : Math.max(8, rect.top - POPOVER_HEIGHT - 6),
      left: Math.min(Math.max(8, rect.left), Math.max(8, window.innerWidth - POPOVER_WIDTH - 8)),
    })
    setOpen(true)
  }

  useEffect(() => {
    if (!open) return undefined
    function onPointerDown(event) {
      if (popoverRef.current?.contains(event.target) || triggerRef.current?.contains(event.target)) return
      setOpen(false)
    }
    function onKeyDown(event) {
      if (event.key !== 'Escape') return
      event.stopPropagation()
      setOpen(false)
      triggerRef.current?.focus()
    }
    const close = () => setOpen(false)
    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('keydown', onKeyDown, true)
    window.addEventListener('resize', close)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('keydown', onKeyDown, true)
      window.removeEventListener('resize', close)
    }
  }, [open])

  const cells = useMemo(() => {
    const year = view.getFullYear()
    const month = view.getMonth()
    const offset = (new Date(year, month, 1).getDay() + 6) % 7
    const length = new Date(year, month + 1, 0).getDate()
    return [...Array.from({ length: offset }, () => null), ...Array.from({ length }, (_, index) => toBatchIso(new Date(year, month, index + 1)))]
  }, [view])

  function shiftMonth(step) {
    setView((current) => new Date(current.getFullYear(), current.getMonth() + step, 1))
  }
  function choose(day) {
    onChange(day)
    setOpen(false)
    triggerRef.current?.focus()
  }

  return (
    <>
      <button
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={ariaLabel}
        className={`date-field-trigger${isIso(value) ? '' : ' is-empty'}`}
        onClick={() => (open ? setOpen(false) : openPicker())}
        ref={triggerRef}
        type="button"
      >
        <span>{isIso(value) ? formatBatchDate(value, { day: '2-digit', month: '2-digit', year: 'numeric' }) : placeholder}</span>
        <CalendarDays aria-hidden="true" size={16} />
      </button>
      {open && createPortal(
        <div aria-label={ariaLabel || 'Pilih tanggal'} className="date-popover" ref={popoverRef} role="dialog" style={{ top: position.top, left: position.left }}>
          <div className="date-popover-head">
            <button aria-label="Bulan sebelumnya" onClick={() => shiftMonth(-1)} type="button"><ChevronLeft aria-hidden="true" size={16} /></button>
            <strong>{view.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })}</strong>
            <button aria-label="Bulan berikutnya" onClick={() => shiftMonth(1)} type="button"><ChevronRight aria-hidden="true" size={16} /></button>
          </div>
          <div className="date-popover-grid">
            {WEEKDAYS.map((weekday) => <span className="date-popover-weekday" key={weekday}>{weekday}</span>)}
            {cells.map((day, index) => {
              if (!day) return <span key={`blank-${index}`} />
              const reason = reasonFor(day)
              return (
                <button
                  aria-label={formatBatchDate(day)}
                  aria-pressed={day === value}
                  className={`date-popover-day${day === value ? ' is-selected' : ''}${day === todayIso ? ' is-today' : ''}${reason ? ' is-blocked' : ''}`}
                  disabled={Boolean(reason)}
                  key={day}
                  onClick={() => choose(day)}
                  title={reason || undefined}
                  type="button"
                >
                  {Number(day.slice(8))}
                </button>
              )
            })}
          </div>
          {(blocked.length > 0 || min || max) && <p className="date-popover-note">Tanggal abu-abu tidak dapat dipilih (bentrok dengan batch lain atau di luar urutan jadwal).</p>}
        </div>,
        document.body,
      )}
    </>
  )
}
