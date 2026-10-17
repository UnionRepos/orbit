import { useEffect, useLayoutEffect, useRef } from 'react'
import { nextRestoreAction } from '../lib/scrollRestore.ts'
import { recallScroll, rememberScroll } from '../lib/scrollMemory.ts'

/** What the restored list can do to grow taller than its first page. */
export interface ScrollRestoreFeed {
  hasMore: boolean
  loadMore: () => void
}

/**
 * Keeps the scroll offset of a list route in sync with `scrollMemory`:
 * offsets are recorded while scrolling and restored once `ready` reports that
 * the list content is on screen again.
 *
 * A list only renders its first page when it remounts, so a remembered offset
 * from further down is not reachable at first. The restore therefore keeps the
 * target pending while the document grows and asks the list for another page
 * whenever it stops growing, instead of clamping to the end of page one.
 */
export function useScrollRestore(key: string, ready: boolean, feed?: ScrollRestoreFeed) {
  const target = useRef<number | undefined>(undefined)
  const restoring = useRef(false)
  const feedRef = useRef(feed)
  feedRef.current = feed

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

  // Replay the offset once the content is rendered, pulling in further pages
  // for as long as the document is too short to hold it.
  useEffect(() => {
    if (!ready || !restoring.current) return
    const offset = target.current
    if (offset === undefined) return

    let frame = 0
    let lastHeight = 0
    let idleSince = performance.now()
    let lastPull = 0
    let pulls = 0

    const stop = () => {
      if (!frame) return
      cancelAnimationFrame(frame)
      frame = 0
    }

    const finish = (top: number) => {
      stop()
      window.scrollTo({ top, behavior: 'auto' })
      target.current = undefined
      restoring.current = false
    }

    const apply = () => {
      frame = 0
      const now = performance.now()
      const height = document.documentElement.scrollHeight
      const maxTop = Math.max(0, height - window.innerHeight)
      if (height > lastHeight) {
        lastHeight = height
        idleSince = now
      }

      const source = feedRef.current
      const action = nextRestoreAction({
        target: offset,
        maxTop,
        idleMs: now - idleSince,
        sincePullMs: now - lastPull,
        pulls,
        hasMore: Boolean(source?.hasMore),
      })

      if (action === 'done') {
        finish(offset)
        return
      }
      if (action === 'clamp') {
        finish(maxTop)
        return
      }
      if (action === 'pull' && source) {
        pulls += 1
        lastPull = now
        idleSince = now
        source.loadMore()
      }
      frame = requestAnimationFrame(apply)
    }

    frame = requestAnimationFrame(apply)

    // Wheel, touch and key input mean the user wants to scroll themselves: drop
    // the pending restore rather than yank the page once the list grows.
    const cancel = () => {
      stop()
      target.current = undefined
      restoring.current = false
    }
    window.addEventListener('wheel', cancel, { passive: true })
    window.addEventListener('touchstart', cancel, { passive: true })
    window.addEventListener('keydown', cancel)

    return () => {
      stop()
      window.removeEventListener('wheel', cancel)
      window.removeEventListener('touchstart', cancel)
      window.removeEventListener('keydown', cancel)
    }
  }, [key, ready])
}
