import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown, Search, X } from 'lucide-react'

// Phones get a bottom sheet instead of the floating menu: iOS Safari does not focus buttons on tap and zooms or
// scrolls the page when a small input gets focus, which breaks the floating menu, and the native <select> popup
// looks out of place. The sheet is plain buttons, so it behaves the same on iOS and Android.
const SHEET_QUERY = '(max-width: 700px)'
const SEARCH_THRESHOLD = 7

function isIOSDevice() {
  if (typeof navigator === 'undefined') return false
  return /iP(hone|ad|od)/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

function useSheetMode() {
  const [isSheet, setIsSheet] = useState(() => isIOSDevice() || (typeof window !== 'undefined' && window.matchMedia?.(SHEET_QUERY).matches))
  useEffect(() => {
    const media = window.matchMedia?.(SHEET_QUERY)
    if (!media) return undefined
    const update = () => setIsSheet(isIOSDevice() || media.matches)
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])
  return isSheet
}

// Title for the sheet: the <label> the control sits in or points at, if any.
function findFieldLabel(element, id) {
  const wrapping = element?.closest('label')
  const text = wrapping
    ? [...wrapping.childNodes].find((node) => node.nodeType === 3 && node.textContent.trim())?.textContent
    : id ? document.querySelector(`label[for="${id}"]`)?.textContent : ''
  return text?.trim() || ''
}

export default function SearchableSelect({
  disabled = false,
  id,
  menuPlacement = 'auto',
  name,
  onChange,
  options,
  placeholder = 'Pilih opsi',
  required = false,
  searchPlaceholder = 'Ketik untuk mencari...',
  value,
}) {
  const useSheet = useSheetMode()
  const [isSheetOpen, setIsSheetOpen] = useState(false)
  const [sheetTitle, setSheetTitle] = useState('')
  const [sheetQuery, setSheetQuery] = useState('')
  const triggerRef = useRef(null)
  const [isOpen, setIsOpen] = useState(false)
  const menuInteractionRef = useRef(false)
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const containerRef = useRef(null)
  const menuRef = useRef(null)
  const inputRef = useRef(null)
  const optionRefs = useRef([])
  const [menuPosition, setMenuPosition] = useState(null)
  const listId = useId()
  const selected = options.find((option) => String(option.value) === String(value))
  const filteredOptions = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('id')
    if (!normalizedQuery) return options
    return options.filter((option) => option.label.toLocaleLowerCase('id').includes(normalizedQuery))
  }, [options, query])

  useEffect(() => {
    if (!isOpen) return undefined

    function closeOnOutsideClick(event) {
      if (!containerRef.current?.contains(event.target) && !menuRef.current?.contains(event.target)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('pointerdown', closeOnOutsideClick)
    return () => document.removeEventListener('pointerdown', closeOnOutsideClick)
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return undefined

    function updateMenuPosition() {
      const bounds = inputRef.current?.getBoundingClientRect()
      if (!bounds) return

      const margin = 8
      const viewportHeight = window.innerHeight
      const viewportWidth = window.innerWidth
      const spaceBelow = Math.max(0, viewportHeight - bounds.bottom - margin)
      const spaceAbove = Math.max(0, bounds.top - margin)
      const expectedMenuHeight = Math.min(280, Math.max(48, options.length * 42 + 10))
      const opensAbove = menuPlacement === 'auto'
        && spaceBelow < expectedMenuHeight
        && spaceAbove > spaceBelow
      const availableHeight = opensAbove ? spaceAbove : Math.max(48, spaceBelow)
      const maxWidth = viewportWidth - margin * 2
      const width = Math.min(Math.max(bounds.width, Math.min(240, maxWidth)), maxWidth)
      const left = Math.min(
        Math.max(margin, bounds.left),
        viewportWidth - width - margin,
      )

      setMenuPosition({
        left,
        width,
        maxHeight: Math.min(280, availableHeight),
        top: opensAbove ? undefined : bounds.bottom + 5,
        bottom: opensAbove ? viewportHeight - bounds.top + 5 : undefined,
      })
    }

    updateMenuPosition()
    window.addEventListener('resize', updateMenuPosition)
    window.addEventListener('scroll', updateMenuPosition, true)
    return () => {
      window.removeEventListener('resize', updateMenuPosition)
      window.removeEventListener('scroll', updateMenuPosition, true)
    }
  }, [isOpen, menuPlacement, options.length])

  useEffect(() => {
    if (!isOpen) return
    optionRefs.current[activeIndex]?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex, isOpen])

  useEffect(() => {
    const searchHasNoSelection = isOpen && query.trim().length > 0
    inputRef.current?.setCustomValidity(
      required && (!selected || searchHasNoSelection)
        ? 'Pilih salah satu opsi dari hasil pencarian.'
        : '',
    )
  }, [isOpen, query, required, selected])

  useEffect(() => {
    if (!isSheetOpen) return undefined
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    function onKeyDown(event) {
      if (event.key === 'Escape') setIsSheetOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [isSheetOpen])

  useEffect(() => {
    if (!useSheet) setIsSheetOpen(false)
  }, [useSheet])

  function openSheet() {
    if (disabled) return
    setSheetTitle(findFieldLabel(triggerRef.current, id) || placeholder)
    setSheetQuery('')
    setIsSheetOpen(true)
  }

  function openDropdown() {
    if (disabled) return
    const selectedIndex = options.findIndex((option) => String(option.value) === String(value))
    setActiveIndex(Math.max(0, selectedIndex))
    setQuery('')
    setIsOpen(true)
  }

  function chooseOption(option) {
    menuInteractionRef.current = false
    onChange(option.value)
    inputRef.current?.setCustomValidity('')
    setQuery('')
    setIsOpen(false)
    inputRef.current?.focus()
  }

  function handleKeyDown(event) {
    if (event.key === 'Escape' && isOpen) {
      event.preventDefault()
      setQuery('')
      setIsOpen(false)
      return
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (!isOpen) {
        openDropdown()
        return
      }
      if (!filteredOptions.length) return
      const direction = event.key === 'ArrowDown' ? 1 : -1
      setActiveIndex((index) => Math.min(
        filteredOptions.length - 1,
        Math.max(0, index + direction),
      ))
      return
    }
    if (event.key === 'Enter' && isOpen && filteredOptions[activeIndex]) {
      event.preventDefault()
      chooseOption(filteredOptions[activeIndex])
    }
  }

  if (useSheet) {
    const needle = sheetQuery.trim().toLocaleLowerCase('id')
    const sheetOptions = needle ? options.filter((option) => option.label.toLocaleLowerCase('id').includes(needle)) : options
    return (
      <div className={`searchable-select is-sheet${disabled ? ' is-disabled' : ''}`}>
        <button
          aria-expanded={isSheetOpen}
          aria-haspopup="dialog"
          className="searchable-select-control searchable-select-trigger"
          disabled={disabled}
          id={id}
          onClick={openSheet}
          ref={triggerRef}
          type="button"
        >
          <Search aria-hidden="true" className="searchable-select-search-icon" size={16} />
          <span className={`searchable-select-value${selected ? '' : ' is-placeholder'}`}>{selected?.label ?? placeholder}</span>
          <ChevronDown aria-hidden="true" className="searchable-select-chevron" size={16} />
        </button>
        {name && <input name={name} type="hidden" value={String(value ?? '')} />}
        {required && <input aria-hidden="true" className="searchable-select-required" onChange={() => {}} required tabIndex={-1} value={selected ? String(selected.value) : ''} />}
        {isSheetOpen && createPortal(
          <div className="ss-sheet-layer">
            <button aria-label="Tutup" className="ss-sheet-backdrop" onClick={() => setIsSheetOpen(false)} type="button" />
            <section aria-label={sheetTitle} aria-modal="true" className="ss-sheet" role="dialog">
              <span aria-hidden="true" className="ss-sheet-grab" />
              <header>
                <strong>{sheetTitle}</strong>
                <button aria-label="Tutup" onClick={() => setIsSheetOpen(false)} type="button"><X size={18} /></button>
              </header>
              {options.length > SEARCH_THRESHOLD && (
                <label className="ss-sheet-search">
                  <Search aria-hidden="true" size={16} />
                  <input
                    aria-label="Cari pilihan"
                    autoComplete="off"
                    onChange={(event) => setSheetQuery(event.target.value)}
                    placeholder={searchPlaceholder}
                    type="search"
                    value={sheetQuery}
                  />
                </label>
              )}
              <div className="ss-sheet-list" role="listbox">
                {sheetOptions.length ? sheetOptions.map((option) => {
                  const isSelected = String(option.value) === String(value)
                  return (
                    <button
                      aria-selected={isSelected}
                      className={`ss-sheet-option${isSelected ? ' is-selected' : ''}`}
                      key={option.value}
                      onClick={() => { onChange(option.value); setIsSheetOpen(false) }}
                      ref={isSelected ? (element) => element?.scrollIntoView({ block: 'center' }) : undefined}
                      role="option"
                      type="button"
                    >
                      <span>{option.label}</span>
                      {isSelected && <Check aria-hidden="true" size={18} />}
                    </button>
                  )
                }) : <p className="searchable-select-empty">Tidak ada pilihan yang cocok.</p>}
              </div>
            </section>
          </div>,
          document.body,
        )}
      </div>
    )
  }

  return (
    <div
      className={`searchable-select${isOpen ? ' is-open' : ''}${disabled ? ' is-disabled' : ''}`}
      onBlur={(event) => {
        if (menuInteractionRef.current) return
        if (!event.currentTarget.contains(event.relatedTarget)) setIsOpen(false)
      }}
      ref={containerRef}
    >
      <div className="searchable-select-control">
        <Search aria-hidden="true" className="searchable-select-search-icon" size={16} />
        <input
          aria-activedescendant={isOpen && filteredOptions[activeIndex] ? `${listId}-option-${activeIndex}` : undefined}
          aria-autocomplete="list"
          aria-controls={listId}
          aria-expanded={isOpen}
          aria-haspopup="listbox"
          aria-required={required || undefined}
          aria-invalid={required && (!selected || (isOpen && query.trim().length > 0)) || undefined}
          autoComplete="off"
          className="searchable-select-input"
          disabled={disabled}
          id={id}
          onChange={(event) => {
            const nextQuery = event.target.value
            setQuery(nextQuery)
            setActiveIndex(0)
            setIsOpen(true)
          }}
          onClick={() => {
            if (!isOpen) openDropdown()
          }}
          onFocus={() => {
            if (!isOpen) openDropdown()
          }}
          onKeyDown={handleKeyDown}
          placeholder={isOpen ? searchPlaceholder : placeholder}
          ref={inputRef}
          required={required && !selected}
          role="combobox"
          value={isOpen ? query : selected?.label ?? ''}
        />
        <ChevronDown aria-hidden="true" className={`searchable-select-chevron${isOpen ? ' is-open' : ''}`} size={16} />
      </div>
      {name && <input name={name} type="hidden" value={String(value ?? '')} />}
      {isOpen && menuPosition && createPortal(
        <div
          className="searchable-select-menu"
          id={listId}
          onPointerDown={() => { menuInteractionRef.current = true }}
          onPointerUp={() => { window.setTimeout(() => { menuInteractionRef.current = false }, 300) }}
          onTouchStart={() => { menuInteractionRef.current = true }}
          ref={menuRef}
          role="listbox"
          style={{
            bottom: menuPosition.bottom,
            left: menuPosition.left,
            maxHeight: menuPosition.maxHeight,
            top: menuPosition.top,
            width: menuPosition.width,
          }}
        >
          {filteredOptions.length ? filteredOptions.map((option, index) => (
            <button
              aria-selected={String(option.value) === String(value)}
              className="searchable-select-option"
              data-active={index === activeIndex || undefined}
              id={`${listId}-option-${index}`}
              key={option.value}
              onClick={() => chooseOption(option)}
              onPointerDown={(event) => event.preventDefault()}
              ref={(element) => { optionRefs.current[index] = element }}
              role="option"
              type="button"
            >
              {option.label}
            </button>
          )) : (
            <p className="searchable-select-empty">Tidak ada pilihan yang cocok.</p>
          )}
        </div>,
        document.body,
      )}
    </div>
  )
}
