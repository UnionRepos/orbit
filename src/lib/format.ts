import { getLocale, intlLocale, t } from '../i18n/core.ts'

const compactFormats = new Map<string, Intl.NumberFormat>()
const fullFormats = new Map<string, Intl.NumberFormat>()

function compactFormat(): Intl.NumberFormat {
  const locale = intlLocale()
  let format = compactFormats.get(locale)
  if (!format) {
    format = new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 })
    compactFormats.set(locale, format)
  }
  return format
}

function fullFormat(): Intl.NumberFormat {
  const locale = intlLocale()
  let format = fullFormats.get(locale)
  if (!format) {
    format = new Intl.NumberFormat(locale)
    fullFormats.set(locale, format)
  }
  return format
}

export function compactNumber(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '0'
  if (value < 1000) return String(value)
  return compactFormat().format(value)
}

export function fullNumber(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '0'
  return fullFormat().format(value)
}

export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return t('time.unknown')
  const then = Date.parse(iso)
  if (!Number.isFinite(then)) return t('time.unknown')
  const diff = Date.now() - then
  if (diff < 0) return t('time.justNow')
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 1) return t('time.justNow')
  if (minutes < 60) return t('time.minutes', { count: minutes })
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return t('time.hours', { count: hours })
  const days = Math.floor(hours / 24)
  if (days < 7) return t('time.days', { count: days })
  const weeks = Math.floor(days / 7)
  if (weeks < 5) return t('time.weeks', { count: weeks })
  const months = Math.floor(days / 30)
  if (months < 12) return t('time.months', { count: months })
  const years = Math.floor(days / 365)
  return t('time.years', { count: years })
}

export function dateLabel(iso: string | null | undefined): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString(intlLocale(), {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export function monthYear(iso: string | null | undefined): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  // Chinese month names read better as numeric ("2026年10月") than "2026年十月".
  const month = getLocale() === 'zh' ? 'numeric' : 'long'
  return date.toLocaleDateString(intlLocale(), { month, year: 'numeric' })
}

export function timeUntil(epochSeconds: number | null | undefined): string {
  if (!epochSeconds) return t('time.soon')
  const diff = epochSeconds * 1000 - Date.now()
  if (diff <= 0) return t('time.now')
  const minutes = Math.ceil(diff / 60_000)
  if (minutes < 60) return t('time.shortMinutes', { count: minutes })
  const hours = Math.ceil(minutes / 60)
  if (hours < 24) return t('time.shortHours', { count: hours })
  return t('time.shortDays', { count: Math.ceil(hours / 24) })
}

export function starVelocity(value: number): string {
  if (!value || value <= 0) return '—'
  if (value >= 1000) return t('velocity.perDay', { value: compactNumber(value) })
  if (value >= 10) return t('velocity.perDay', { value: Math.round(value) })
  if (value >= 1) return t('velocity.perDay', { value: value.toFixed(1) })
  return t('velocity.perDay', { value: value.toFixed(2) })
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
