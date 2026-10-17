import assert from 'node:assert/strict'
import { test } from 'node:test'
import { CHANNELS } from '../../shared/channels.ts'
import { TOPIC_FILTERS } from '../../shared/languages.ts'
import {
  DICTIONARIES,
  LOCALES,
  detectLocale,
  normalizeLocale,
  setActiveLocale,
  t,
  tp,
  translate,
  translatePlural,
} from './core.ts'
import { en } from './en.ts'
import { zh } from './zh.ts'

const keys = Object.keys(en) as (keyof typeof en)[]

test('every locale defines the same keys as English', () => {
  for (const locale of LOCALES) {
    assert.deepEqual(
      Object.keys(DICTIONARIES[locale.id]).sort(),
      [...keys].sort(),
      `${locale.id} keys diverge from en`,
    )
  }
})

test('no translation is blank', () => {
  for (const locale of LOCALES) {
    for (const [key, value] of Object.entries(DICTIONARIES[locale.id])) {
      assert.equal(value.trim().length > 0, true, `${locale.id}:${key} is empty`)
    }
  }
})

test('placeholders match across locales', () => {
  // Plural templates repeat their placeholders per variant, so compare the set.
  const placeholders = (value: string) =>
    [...new Set([...value.matchAll(/\{(\w+)\}/g)].map((match) => match[1]))].sort()

  for (const key of keys) {
    assert.deepEqual(placeholders(zh[key]), placeholders(en[key]), `placeholder drift in ${key}`)
  }
})

test('only English uses plural variants', () => {
  assert.equal(zh['feed.results'].includes('|'), false)
  assert.equal(en['feed.results'].includes('|'), true)
})

test('translate interpolates and falls back to the key', () => {
  assert.equal(translate('en', 'saved.statSaved'), 'saved projects')
  assert.equal(translate('en', 'feed.chip.stars', { count: 100 }), '100+ stars')
  assert.equal(translate('zh', 'feed.chip.stars', { count: 100 }), '100+ 星标')
  // Unknown placeholders are left untouched rather than rendering "undefined".
  assert.equal(translate('en', 'feed.chip.stars', {}), '{count}+ stars')
})

test('plural forms follow English and Chinese rules', () => {
  assert.equal(translatePlural('en', 'feed.results', 1), '1 project')
  assert.equal(translatePlural('en', 'feed.results', 7), '7 projects')
  assert.equal(translatePlural('zh', 'feed.results', 1), '1 个项目')
  assert.equal(translatePlural('zh', 'feed.results', 7), '7 个项目')
})

test('locale tags normalise to supported locales', () => {
  assert.equal(normalizeLocale('zh-Hans-CN'), 'zh')
  assert.equal(normalizeLocale('zh_TW'), 'zh')
  assert.equal(normalizeLocale('en-GB'), 'en')
  assert.equal(normalizeLocale('fr-FR'), null)
  assert.equal(normalizeLocale(undefined), null)
})

test('detectLocale falls back to English without a stored preference', () => {
  assert.equal(detectLocale(), 'en')
})

test('t() and tp() follow the active locale', () => {
  try {
    setActiveLocale('zh')
    assert.equal(t('topbar.discover'), '发现')
    assert.equal(tp('feed.results', 3), '3 个项目')
  } finally {
    setActiveLocale('en')
  }
  assert.equal(t('topbar.discover'), 'Discover')
})

test('every channel and topic has translated copy', () => {
  for (const channel of CHANNELS) {
    for (const field of ['label', 'short', 'description'] as const) {
      const key = `channel.${channel.id}.${field}` as keyof typeof en
      assert.equal(key in en, true, `missing ${key}`)
      assert.equal(key in zh, true, `missing zh ${key}`)
    }
  }
  for (const topic of TOPIC_FILTERS) {
    const key = `topic.${topic.id}.label` as keyof typeof en
    assert.equal(key in en, true, `missing ${key}`)
    assert.equal(key in zh, true, `missing zh ${key}`)
  }
})
