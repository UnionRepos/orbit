import type { ChannelId } from './types.ts'

/** Visual identity only — all channel copy lives in `src/i18n`. */
export interface ChannelMeta {
  id: ChannelId
  accent: string
  icon: 'flame' | 'trending' | 'zap' | 'gem' | 'heart' | 'star'
}

export const CHANNELS: ChannelMeta[] = [
  { id: 'trending', accent: '#ff9f5a', icon: 'flame' },
  { id: 'rising', accent: '#5eead4', icon: 'trending' },
  { id: 'fresh', accent: '#7c9cff', icon: 'zap' },
  { id: 'gems', accent: '#c084fc', icon: 'gem' },
  { id: 'first', accent: '#f472b6', icon: 'heart' },
  { id: 'stars', accent: '#fbbf24', icon: 'star' },
]
