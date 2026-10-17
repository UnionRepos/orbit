import { useCallback, useEffect, useRef, useState } from 'react'

/** Chromium's `beforeinstallprompt` event, which has no DOM lib type. */
export interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

export type InstallOutcome = 'accepted' | 'dismissed' | 'unavailable'

/** True while the browser believes it has a network connection. */
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine !== false,
  )

  useEffect(() => {
    const update = () => setOnline(navigator.onLine !== false)
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  }, [])

  return online
}

/** Holds a prompt captured before React mounted, so no install offer is lost. */
let earlyPrompt: BeforeInstallPromptEvent | null = null
const INSTALL_EVENT = 'orbit:installprompt'

/** Called once from `main.tsx`, before the first render. */
export function captureInstallPrompt(): void {
  if (typeof window === 'undefined') return
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault()
    earlyPrompt = event as BeforeInstallPromptEvent
    window.dispatchEvent(new Event(INSTALL_EVENT))
  })
  window.addEventListener('appinstalled', () => {
    earlyPrompt = null
  })
}

/** Tracks whether the app can be installed and drives the native prompt. */
export function useInstallPrompt() {
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(earlyPrompt)
  const [installed, setInstalled] = useState(false)

  useEffect(() => {
    const onPrompt = (event: Event) => {
      // Keep the event so the top bar can trigger the native install flow.
      event.preventDefault()
      setPrompt(event as BeforeInstallPromptEvent)
    }
    const onCaptured = () => setPrompt(earlyPrompt)
    const onInstalled = () => {
      earlyPrompt = null
      setInstalled(true)
      setPrompt(null)
    }
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener(INSTALL_EVENT, onCaptured)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener(INSTALL_EVENT, onCaptured)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  const promptInstall = useCallback(async (): Promise<InstallOutcome> => {
    if (!prompt) return 'unavailable'
    const event = prompt
    earlyPrompt = null
    setPrompt(null)
    await event.prompt()
    const choice = await event.userChoice
    return choice.outcome
  }, [prompt])

  return { canInstall: Boolean(prompt) && !installed, promptInstall }
}

const SW_URL = '/sw.js'

export function serviceWorkerSupported(): boolean {
  return typeof navigator !== 'undefined' && 'serviceWorker' in navigator
}

/**
 * Registers the generated worker in production and reports when a newer build
 * is waiting. `reload` asks that build to take over and refreshes the page.
 */
export function useServiceWorkerUpdate() {
  const [updateReady, setUpdateReady] = useState(false)
  const registration = useRef<ServiceWorkerRegistration | null>(null)
  const waiting = useRef<ServiceWorker | null>(null)
  const reloading = useRef(false)

  useEffect(() => {
    if (!import.meta.env.PROD || !serviceWorkerSupported() || !window.isSecureContext) return

    let disposed = false

    const announce = (worker: ServiceWorker | null) => {
      // A waiting worker only matters once this page is already controlled;
      // before that the browser is still completing the first install.
      if (!worker || !navigator.serviceWorker.controller) return
      waiting.current = worker
      setUpdateReady(true)
    }

    const register = async () => {
      try {
        const registered = await navigator.serviceWorker.register(SW_URL, {
          scope: '/',
          updateViaCache: 'none',
        })
        if (disposed) return
        registration.current = registered

        announce(registered.waiting)

        registered.addEventListener('updatefound', () => {
          const installing = registered.installing
          if (!installing) return
          installing.addEventListener('statechange', () => {
            if (installing.state === 'installed') announce(installing)
          })
        })
      } catch (error) {
        console.warn('[orbit pwa] service worker registration failed', error)
      }
    }

    const onControllerChange = () => {
      if (!reloading.current) return
      window.location.reload()
    }
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange)

    const onLoad = () => void register()
    if (document.readyState === 'complete') onLoad()
    else window.addEventListener('load', onLoad, { once: true })

    return () => {
      disposed = true
      window.removeEventListener('load', onLoad)
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange)
    }
  }, [])

  const reload = useCallback(() => {
    const worker = waiting.current ?? registration.current?.waiting
    if (!worker) {
      window.location.reload()
      return
    }
    reloading.current = true
    worker.postMessage({ type: 'SKIP_WAITING' })
    // `controllerchange` normally reloads first; don't hang if it never fires.
    window.setTimeout(() => window.location.reload(), 1500)
  }, [])

  return { updateReady, reload }
}
