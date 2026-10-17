import { useEffect, useLayoutEffect, useRef } from 'react'
import { recallScroll, rememberScroll } from '../lib/scrollMemory.ts'

/** How many frames to wait for the list to grow tall enough to reach the offset. */
const MAX_RESTORE_FRAMES = 24

/**
 * Keeps the scroll offset of a list route in sync with `scrollMemory`:
 * offsets are recorded while scrolling and restored once `ready` reports that
 * the list content is on screen again.
 */
export function useScrollRestore(key: string, ready: boolean) {
  const target = useRef<number | undefined>(undefined)
  const restoring = useRef(false)

  // Pick up the saved offset for this key whenever the route changes.
  useEffect(() => {
    target.current = recallScroll(key)
    restoring.current = target.current !== undefined
  }, [key])

  // Record the live offset so the position survives unmounting the list. A
  // layout effect guarantees the listener is gone before the next route resets
  // the scroll, otherwise that reset would overwrite the saved offset.
  useLayoutEffect(() => {
    let frame = 0
    const record = () => {
      frame = 0
      if (restoring.current) return
      rememberScroll(key, window.scrollY)
    }
    const onScroll = () => {
      if (frame) return
      frame = requestAnimationFrame(record)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [key])

  // Restore once the content is rendered. The list refetches when it mounts, so
  // the document may still be too short: retry for a few frames, then clamp.
  useEffect(() => {
    if (!ready || !restoring.current) return
    const offset = target.current
    if (offset === undefined) return

    let frame = 0
    let attempts = 0
    const apply = () => {
      const maxTop = Math.max(0, document.documentElement.scrollHeight - window.innerHeight)
      if (maxTop + 1 < offset && attempts < MAX_RESTORE_FRAMES) {
        attempts += 1
        frame = requestAnimationFrame(apply)
        return
      }
      window.scrollTo({ top: Math.min(offset, maxTop), behavior: 'auto' })
      target.current = undefined
      restoring.current = false
    }

    frame = requestAnimationFrame(apply)
    return () => {
      if (frame) cancelAnimationFrame(frame)
    }
  }, [key, ready])
}
