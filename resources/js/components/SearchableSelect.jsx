import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, Search } from 'lucide-react'

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
  const [isOpen, setIsOpen] = useState(false)
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

  function openDropdown() {
    if (disabled) return
    const selectedIndex = options.findIndex((option) => String(option.value) === String(value))
    setActiveIndex(Math.max(0, selectedIndex))
    setQuery('')
    setIsOpen(true)
  }

  function chooseOption(option) {
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

  return (
    <div
      className={`searchable-select${isOpen ? ' is-open' : ''}${disabled ? ' is-disabled' : ''}`}
      onBlur={(event) => {
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
