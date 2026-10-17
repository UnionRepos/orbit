import assert from 'node:assert/strict'
import { after, describe, it } from 'node:test'
import {
  bytesLabel,
  compactNumber,
  fullNumber,
  hostname,
  relativeTime,
  slugify,
  starVelocity,
  timeUntil,
} from './format.ts'
import { setActiveLocale } from '../i18n/core.ts'

describe('numbers', () => {
  it('compacts thousands and handles null', () => {
    assert.equal(compactNumber(999), '999')
    assert.equal(compactNumber(12_500), '12.5K')
    assert.equal(compactNumber(null), '0')
    assert.equal(fullNumber(1_234_567), '1,234,567')
  })

  it('formats velocity tiers', () => {
    assert.equal(starVelocity(0), '—')
    assert.equal(starVelocity(0.5), '0.50/day')
    assert.equal(starVelocity(2.5), '2.5/day')
    assert.equal(starVelocity(42.4), '42/day')
  })

  it('formats bytes', () => {
    assert.equal(bytesLabel(512), '512 B')
    assert.equal(bytesLabel(2048), '2.0 KB')
    assert.equal(bytesLabel(5 * 1024 * 1024), '5.0 MB')
  })
})

describe('time', () => {
  it('describes recent timestamps', () => {
    const now = Date.now()
    assert.equal(relativeTime(new Date(now - 30_000).toISOString()), 'just now')
    assert.equal(relativeTime(new Date(now - 5 * 60_000).toISOString()), '5m ago')
    assert.equal(relativeTime(new Date(now - 3 * 3_600_000).toISOString()), '3h ago')
    assert.equal(relativeTime(new Date(now - 2 * 86_400_000).toISOString()), '2d ago')
    assert.equal(relativeTime(null), 'unknown')
  })

  it('counts down to a rate-limit reset', () => {
    assert.equal(timeUntil(Math.floor(Date.now() / 1000) - 10), 'now')
    assert.match(timeUntil(Math.floor(Date.now() / 1000) + 30), /^\d+m$/)
  })
})

describe('locale awareness', () => {
  after(() => setActiveLocale('en'))

  it('translates relative times and velocity for Chinese', () => {
    setActiveLocale('zh')
    const now = Date.now()
    assert.equal(relativeTime(new Date(now - 5 * 60_000).toISOString()), '5 分钟前')
    assert.equal(relativeTime(new Date(now - 2 * 86_400_000).toISOString()), '2 天前')
    assert.equal(relativeTime(null), '未知')
    assert.equal(starVelocity(2.5), '2.5/天')
    assert.equal(timeUntil(Math.floor(now / 1000) + 30), '1 分钟')
    setActiveLocale('en')
    assert.equal(relativeTime(new Date(now - 5 * 60_000).toISOString()), '5m ago')
  })
})

describe('text helpers', () => {
  it('slugifies headings', () => {
    assert.equal(slugify('Hello, World! 2024'), 'hello-world-2024')
  })

  it('extracts hostnames from URLs without protocols', () => {
    assert.equal(hostname('https://www.example.com/path'), 'example.com')
    assert.equal(hostname('docs.example.com'), 'docs.example.com')
    assert.equal(hostname(null), '')
  })
})
