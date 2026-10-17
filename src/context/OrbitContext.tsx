import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { HealthResponse, RepoSummary } from '../../shared/types.ts'
import { getHealth } from '../lib/api.ts'
import { loadJSON, saveJSON } from '../lib/storage.ts'
import { cacheRepo } from '../lib/repoCache.ts'

export type Theme = 'dark' | 'light'

export interface SavedEntry {
  repo: RepoSummary
  savedAt: number
  note: string
}

export interface RecentEntry {
  repo: RepoSummary
  viewedAt: number
}

export interface Toast {
  id: number
  message: string
  kind: 'info' | 'success' | 'error'
}

interface OrbitContextValue {
  theme: Theme
  toggleTheme: () => void
  saved: SavedEntry[]
  isSaved: (fullName: string) => boolean
  toggleSave: (repo: RepoSummary) => boolean
  removeSaved: (fullName: string) => void
  updateNote: (fullName: string, note: string) => void
  clearSaved: () => void
  recent: RecentEntry[]
  addRecent: (repo: RepoSummary) => void
  clearRecent: () => void
  paletteOpen: boolean
  openPalette: () => void
  closePalette: () => void
  toasts: Toast[]
  toast: (message: string, kind?: Toast['kind']) => void
  dismissToast: (id: number) => void
  health: HealthResponse | null
  refreshHealth: () => void
}

const OrbitContext = createContext<OrbitContextValue | null>(null)

const SAVED_KEY = 'orbit:saved:v1'
const RECENT_KEY = 'orbit:recent:v1'
const THEME_KEY = 'orbit:theme:v1'

function initialTheme(): Theme {
  const stored = loadJSON<string>(THEME_KEY, '')
  if (stored === 'dark' || stored === 'light') return stored
  try {
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
  } catch {
    return 'dark'
  }
}

export function OrbitProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(initialTheme)
  const [saved, setSaved] = useState<SavedEntry[]>(() => loadJSON<SavedEntry[]>(SAVED_KEY, []))
  const [recent, setRecent] = useState<RecentEntry[]>(() => loadJSON<RecentEntry[]>(RECENT_KEY, []))
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [toasts, setToasts] = useState<Toast[]>([])
  const [health, setHealth] = useState<HealthResponse | null>(null)
  const timers = useRef(new Map<number, number>())

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    saveJSON(THEME_KEY, theme)
    const meta = document.querySelector('meta[name="theme-color"]')
    if (meta) meta.setAttribute('content', theme === 'dark' ? '#191b19' : '#f8f7f4')
  }, [theme])

  useEffect(() => {
    saveJSON(SAVED_KEY, saved)
  }, [saved])

  useEffect(() => {
    saveJSON(RECENT_KEY, recent)
  }, [recent])

  useEffect(() => {
    for (const entry of saved) cacheRepo(entry.repo)
  }, [saved])

  const fetchHealth = useCallback(() => {
    const controller = new AbortController()
    getHealth(controller.signal)
      .then((data) => setHealth(data))
      .catch(() => {
        // Health is decorative; the feed surfaces real errors.
      })
    return () => controller.abort()
  }, [])

  useEffect(() => {
    const cancel = fetchHealth()
    const interval = window.setInterval(() => fetchHealth(), 60_000)
    return () => {
      cancel()
      window.clearInterval(interval)
    }
  }, [fetchHealth])

  const dismissToast = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id))
    const timer = timers.current.get(id)
    if (timer) {
      window.clearTimeout(timer)
      timers.current.delete(id)
    }
  }, [])

  const toast = useCallback(
    (message: string, kind: Toast['kind'] = 'info') => {
      const id = Date.now() + Math.random()
      setToasts((current) => [...current.slice(-2), { id, message, kind }])
      const timer = window.setTimeout(() => {
        setToasts((current) => current.filter((item) => item.id !== id))
        timers.current.delete(id)
      }, 3600)
      timers.current.set(id, timer)
    },
    [],
  )

  useEffect(() => {
    const storedTimers = timers.current
    return () => {
      for (const timer of storedTimers.values()) window.clearTimeout(timer)
    }
  }, [])

  const toggleTheme = useCallback(() => {
    setTheme((current) => (current === 'dark' ? 'light' : 'dark'))
  }, [])

  const isSaved = useCallback(
    (fullName: string) => saved.some((entry) => entry.repo.fullName === fullName),
    [saved],
  )

  const toggleSave = useCallback(
    (repo: RepoSummary) => {
      const exists = saved.some((entry) => entry.repo.fullName === repo.fullName)
      setSaved((current) =>
        exists
          ? current.filter((entry) => entry.repo.fullName !== repo.fullName)
          : [{ repo, savedAt: Date.now(), note: '' }, ...current].slice(0, 200),
      )
      return !exists
    },
    [saved],
  )

  const removeSaved = useCallback((fullName: string) => {
    setSaved((current) => current.filter((entry) => entry.repo.fullName !== fullName))
  }, [])

  const updateNote = useCallback((fullName: string, note: string) => {
    setSaved((current) =>
      current.map((entry) =>
        entry.repo.fullName === fullName ? { ...entry, note: note.slice(0, 600) } : entry,
      ),
    )
  }, [])

  const clearSaved = useCallback(() => setSaved([]), [])

  const addRecent = useCallback((repo: RepoSummary) => {
    cacheRepo(repo)
    setRecent((current) => {
      const filtered = current.filter((entry) => entry.repo.fullName !== repo.fullName)
      return [{ repo, viewedAt: Date.now() }, ...filtered].slice(0, 12)
    })
  }, [])

  const clearRecent = useCallback(() => setRecent([]), [])

  const openPalette = useCallback(() => setPaletteOpen(true), [])
  const closePalette = useCallback(() => setPaletteOpen(false), [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const meta = event.metaKey || event.ctrlKey
      if (meta && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setPaletteOpen((open) => !open)
      }
      if (event.key === 'Escape') setPaletteOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const value = useMemo<OrbitContextValue>(
    () => ({
      theme,
      toggleTheme,
      saved,
      isSaved,
      toggleSave,
      removeSaved,
      updateNote,
      clearSaved,
      recent,
      addRecent,
      clearRecent,
      paletteOpen,
      openPalette,
      closePalette,
      toasts,
      toast,
      dismissToast,
      health,
      refreshHealth: fetchHealth,
    }),
    [
      theme,
      toggleTheme,
      saved,
      isSaved,
      toggleSave,
      removeSaved,
      updateNote,
      clearSaved,
      recent,
      addRecent,
      clearRecent,
      paletteOpen,
      openPalette,
      closePalette,
      toasts,
      toast,
      dismissToast,
      health,
      fetchHealth,
    ],
  )

  return <OrbitContext.Provider value={value}>{children}</OrbitContext.Provider>
}

export function useOrbit(): OrbitContextValue {
  const context = useContext(OrbitContext)
  if (!context) throw new Error('useOrbit must be used within OrbitProvider')
  return context
}
