import { useEffect, useRef, useState } from 'react'

/** Small debounce hook used by the command palette. */
export function useDebounced<T>(value: T, delay = 280): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay)
    return () => window.clearTimeout(timer)
  }, [value, delay])
  return debounced
}

/** Returns true once the referenced element scrolls into view. */
export function useInView<T extends Element>(onEnter: () => void, enabled: boolean) {
  const ref = useRef<T | null>(null)
  const callback = useRef(onEnter)
  callback.current = onEnter

  useEffect(() => {
    const node = ref.current
    if (!node || !enabled) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) callback.current()
      },
      { rootMargin: '600px 0px' },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [enabled])

  return ref
}

/** Keep keyboard focus in an open dialog, then return it to the trigger. */
export function useDialogFocus<T extends HTMLElement>(open: boolean) {
  const ref = useRef<T | null>(null)
  useEffect(() => {
    if (!open || !ref.current) return
    const dialog = ref.current
    const previous = document.activeElement as HTMLElement | null
    const focusable = () => Array.from(dialog.querySelectorAll<HTMLElement>(
      'button:not(:disabled), a[href], input, select, textarea, summary, [tabindex="0"]',
    )).filter((element) => element.getClientRects().length > 0)
    ;(focusable()[0] ?? dialog).focus()
    const keepFocus = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return
      const items = focusable()
      const first = items[0] ?? dialog
      const last = items[items.length - 1] ?? dialog
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    dialog.addEventListener('keydown', keepFocus)
    return () => {
      dialog.removeEventListener('keydown', keepFocus)
      previous?.focus()
    }
  }, [open])
  return ref
}
