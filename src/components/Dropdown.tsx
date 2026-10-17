import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown } from 'lucide-react'
import {
  activeOnOpen,
  lastEnabled,
  optionIndex,
  placeMenu,
  sameLayout,
  stepIndex,
  typeaheadIndex,
  type DropdownOption,
  type MenuLayout,
} from '../lib/dropdown.ts'

const TYPEAHEAD_TIMEOUT_MS = 600

export interface DropdownProps<T extends string> {
  /** Accessible name for the control. */
  label: string
  value: T
  options: readonly DropdownOption<T>[]
  onChange: (value: T) => void
  /** Icon shown before the current value. */
  leading?: ReactNode
  /** Applied to the trigger button, so context styles keep working. */
  className?: string
  disabled?: boolean
  /** Which trigger edge the menu lines up with. */
  align?: 'start' | 'end'
  /** Narrowest the menu may get; short triggers still get a readable list. */
  minWidth?: number
}

/**
 * A listbox dropdown that replaces native `<select>` elements.
 *
 * Native selects cannot be styled, differ per platform and render an OS menu
 * that ignores the app's theme. This component renders its own menu in a
 * portal, so it is not clipped by scrolling containers, and implements the
 * listbox keyboard contract: arrows/Home/End move, Enter/Space commit, Escape
 * cancels, letters jump by typeahead, and clicking outside closes.
 */
export function Dropdown<T extends string>({
  label,
  value,
  options,
  onChange,
  leading,
  className,
  disabled = false,
  align = 'start',
  minWidth = 176,
}: DropdownProps<T>) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const [layout, setLayout] = useState<MenuLayout | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const typeaheadBuffer = useRef({ text: '', at: 0 })
  const menuId = useId()

  const selected = optionIndex(options, value)
  const current = selected >= 0 ? options[selected] : undefined

  const close = useCallback((returnFocus = false) => {
    setOpen(false)
    setLayout(null)
    // Reopening starts from the committed value again, like a native select.
    setActive(-1)
    if (returnFocus) triggerRef.current?.focus()
  }, [])

  const openAt = useCallback(
    (direction: 1 | -1) => {
      if (disabled) return
      setActive((previous) => {
        if (previous >= 0) return previous
        if (direction === 1) return activeOnOpen(options, value)
        return selected >= 0 && !options[selected]?.disabled ? selected : lastEnabled(options)
      })
      setOpen(true)
    },
    [disabled, options, selected, value],
  )

  const commit = useCallback(
    (index: number) => {
      const option = options[index]
      if (!option || option.disabled) return
      if (option.value !== value) onChange(option.value)
      close(true)
    },
    [close, onChange, options, value],
  )

  // Keep the menu pinned to the trigger while the page moves under it.
  const measure = useCallback(() => {
    const trigger = triggerRef.current
    const menu = menuRef.current
    if (!trigger || !menu) return
    const rect = trigger.getBoundingClientRect()
    const next = placeMenu({
      anchor: {
        top: rect.top,
        bottom: rect.bottom,
        left: rect.left,
        right: rect.right,
        width: rect.width,
      },
      menuHeight: menu.offsetHeight,
      viewport: { width: window.innerWidth, height: window.innerHeight },
      align,
      minWidth,
    })
    setLayout((previous) => (sameLayout(previous, next) ? previous : next))
  }, [align, minWidth])

  useLayoutEffect(() => {
    if (!open) return
    measure()
  }, [open, measure])

  useEffect(() => {
    if (!open) return
    const onMove = () => measure()
    window.addEventListener('scroll', onMove, true)
    window.addEventListener('resize', onMove)
    return () => {
      window.removeEventListener('scroll', onMove, true)
      window.removeEventListener('resize', onMove)
    }
  }, [open, measure])

  // Focus the listbox so the keys below reach it and screen readers announce it.
  useEffect(() => {
    if (!open) return
    menuRef.current?.focus({ preventScroll: true })
  }, [open])

  // Keep the highlighted row visible in long lists.
  useEffect(() => {
    if (!open || active < 0) return
    const row = menuRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)
    row?.scrollIntoView({ block: 'nearest' })
  }, [open, active])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null
      if (!target) return
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return
      close()
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    return () => document.removeEventListener('pointerdown', onPointerDown, true)
  }, [close, open])

  const onTriggerKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowUp':
        event.preventDefault()
        openAt(event.key === 'ArrowDown' ? 1 : -1)
        break
      case 'Enter':
      case ' ':
        event.preventDefault()
        if (open) close(true)
        else openAt(1)
        break
      case 'Escape':
        if (open) {
          event.preventDefault()
          close()
        }
        break
      default:
        break
    }
  }

  const onMenuKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const { key } = event

    if (key === 'Tab') {
      close()
      return
    }
    if (key === 'Escape') {
      event.preventDefault()
      close(true)
      return
    }
    if (key === 'Enter' || key === ' ') {
      event.preventDefault()
      commit(active)
      return
    }
    if (key === 'ArrowDown' || key === 'ArrowUp') {
      event.preventDefault()
      const next = stepIndex(options, active, key === 'ArrowDown' ? 1 : -1)
      if (next >= 0) setActive(next)
      return
    }
    if (key === 'Home' || key === 'End') {
      event.preventDefault()
      const next = stepIndex(options, -1, key === 'Home' ? 1 : -1)
      if (next >= 0) setActive(next)
      return
    }
    if (key.length !== 1 || event.metaKey || event.ctrlKey || event.altKey) return

    // Typeahead: consecutive letters build a prefix, a pause starts a new one.
    const now = Date.now()
    const buffer = typeaheadBuffer.current
    buffer.text = now - buffer.at > TYPEAHEAD_TIMEOUT_MS ? key : buffer.text + key
    buffer.at = now

    const match = typeaheadIndex(options, buffer.text, active)
    if (match >= 0) setActive(match)
  }

  const menu = open
    ? createPortal(
        <div
          ref={menuRef}
          id={menuId}
          role="listbox"
          aria-label={label}
          aria-activedescendant={active >= 0 ? `${menuId}-${active}` : undefined}
          tabIndex={-1}
          className="dropdown-menu"
          data-placement={layout?.placement ?? 'below'}
          style={{
            top: layout?.top ?? 0,
            left: layout?.left ?? 0,
            width: layout?.width,
            maxHeight: layout?.maxHeight,
            visibility: layout ? 'visible' : 'hidden',
          }}
          onKeyDown={onMenuKeyDown}
        >
          {options.map((option, index) => (
            <div
              key={option.value}
              id={`${menuId}-${index}`}
              role="option"
              aria-selected={index === selected}
              aria-disabled={option.disabled || undefined}
              tabIndex={-1}
              data-index={index}
              className={`dropdown-option${index === active ? ' is-active' : ''}`}
              onPointerMove={() => {
                if (!option.disabled) setActive(index)
              }}
              onClick={() => commit(index)}
            >
              <span className="dropdown-option-label">{option.label}</span>
              <Check size={13} className="dropdown-check" aria-hidden="true" />
            </div>
          ))}
        </div>,
        document.body,
      )
    : null

  return (
    <div className={`dropdown${open ? ' is-open' : ''}`}>
      <button
        ref={triggerRef}
        type="button"
        className={className ? `dropdown-trigger ${className}` : 'dropdown-trigger'}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={label}
        disabled={disabled}
        onClick={() => {
          if (open) close(true)
          else openAt(1)
        }}
        onKeyDown={onTriggerKeyDown}
      >
        {leading}
        <span className="dropdown-value">{current?.label ?? value}</span>
        <ChevronDown size={12} className="dropdown-caret" aria-hidden="true" />
      </button>
      {menu}
    </div>
  )
}
