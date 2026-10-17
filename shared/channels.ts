import type { ChannelId } from './types.ts'

export interface ChannelMeta {
  id: ChannelId
  label: string
  short: string
  description: string
  accent: string
  icon: 'flame' | 'trending' | 'zap' | 'gem' | 'heart' | 'star'
}

export const CHANNELS: ChannelMeta[] = [
  {
    id: 'trending',
    label: 'Trending',
    short: 'Trending',
    description: 'Breakout projects created in the last 90 days',
    accent: '#ff9f5a',
    icon: 'flame',
  },
  {
    id: 'rising',
    label: 'Rising fast',
    short: 'Rising',
    description: 'New repositories gathering momentum this fortnight',
    accent: '#5eead4',
    icon: 'trending',
  },
  {
    id: 'fresh',
    label: 'Active now',
    short: 'Active',
    description: 'Established projects shipping code in the last week',
    accent: '#7c9cff',
    icon: 'zap',
  },
  {
    id: 'gems',
    label: 'Hidden gems',
    short: 'Gems',
    description: 'Under the radar repositories worth a closer look',
    accent: '#c084fc',
    icon: 'gem',
  },
  {
    id: 'first',
    label: 'Good first issues',
    short: 'First issues',
    description: 'Friendly projects looking for new contributors',
    accent: '#f472b6',
    icon: 'heart',
  },
  {
    id: 'stars',
    label: 'All-time greats',
    short: 'Greats',
    description: 'The most starred open-source projects on the planet',
    accent: '#fbbf24',
    icon: 'star',
  },
]

export function channelMeta(id: ChannelId): ChannelMeta {
  return CHANNELS.find((c) => c.id === id) ?? CHANNELS[0]
}
