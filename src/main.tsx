import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/inter'
import '@fontsource-variable/jetbrains-mono'
import './styles.css'
import App from './App.tsx'
import { captureInstallPrompt } from './hooks/usePwa.ts'
import { prefetchFeed } from './lib/api.ts'
import { feedParamsFromRoute } from './lib/feed.ts'
import { parseRoute } from './lib/router.ts'

// The app restores list offsets itself; native restoration would fight it.
if ('scrollRestoration' in window.history) window.history.scrollRestoration = 'manual'

// Listen before React mounts so an early install prompt is not missed.
captureInstallPrompt()

// Start the first feed request before the tree mounts: the list data then
// arrives while React is still rendering instead of one effect later.
const initialRoute = parseRoute()
if (initialRoute.name === 'feed') prefetchFeed(feedParamsFromRoute(initialRoute))

const container = document.getElementById('root')
if (!container) throw new Error('Root element not found')

// Drop the static boot shell so React owns the container from here on.
document.getElementById('boot-shell')?.remove()

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
