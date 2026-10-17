const numberFormat = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 })
const fullFormat = new Intl.NumberFormat('en')

export function compactNumber(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '0'
  if (value < 1000) return String(value)
  return numberFormat.format(value)
}

export function fullNumber(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '0'
  return fullFormat.format(value)
}

export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return 'unknown'
  const then = Date.parse(iso)
  if (!Number.isFinite(then)) return 'unknown'
  const diff = Date.now() - then
  if (diff < 0) return 'just now'
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  const weeks = Math.floor(days / 7)
  if (weeks < 5) return `${weeks}w ago`
  const months = Math.floor(days / 30)
  if (months < 12) return `${months}mo ago`
  const years = Math.floor(days / 365)
  return `${years}y ago`
}

export function dateLabel(iso: string | null | undefined): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' })
}

export function monthYear(iso: string | null | undefined): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('en', { month: 'long', year: 'numeric' })
}

export function timeUntil(epochSeconds: number | null | undefined): string {
  if (!epochSeconds) return 'soon'
  const diff = epochSeconds * 1000 - Date.now()
  if (diff <= 0) return 'now'
  const minutes = Math.ceil(diff / 60_000)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.ceil(minutes / 60)
  if (hours < 24) return `${hours}h`
  return `${Math.ceil(hours / 24)}d`
}

export function starVelocity(value: number): string {
  if (!value || value <= 0) return '—'
  if (value >= 1000) return `${compactNumber(value)}/day`
  if (value >= 10) return `${Math.round(value)}/day`
  if (value >= 1) return `${value.toFixed(1)}/day`
  return `${value.toFixed(2)}/day`
}

export function bytesLabel(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 60)
}

export function hostname(url: string | null | undefined): string {
  if (!url) return ''
  try {
    return new URL(url.startsWith('http') ? url : `https://${url}`).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}
