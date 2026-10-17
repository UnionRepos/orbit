/**
 * Exercise the production provider connection; /api/health cannot verify it.
 *
 * Exits non-zero only in strict mode (`TRANSLATION_SMOKE_STRICT=1`). Otherwise an
 * unavailable candidate provider is reported as a GitHub Actions warning, because
 * translation depends on an operator-supplied relay that CI cannot provision.
 */
export {}
const origin = process.env.PRODUCTION_URL ?? 'https://orbit.openhub.today'
const strict = process.env.TRANSLATION_SMOKE_STRICT === '1'
const fail = (message: string): never => {
  const text = `Translation smoke test: ${message}`
  if (strict) throw new Error(text)
  console.warn(`::warning::${text}`)
  process.exit(0)
}
const response = await fetch(new URL('/api/translate/readme', origin), {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ target: 'zh', passages: [{ index: 0, text: 'An open-source documentation tool.' }] }),
  signal: AbortSignal.timeout(45_000),
})
if (!response.ok) fail(`HTTP ${response.status}`)
const events = (await response.text()).split(/\r?\n/).filter((line) => line.startsWith('data:'))
  .map((line) => JSON.parse(line.slice(5)) as { type: string; index?: number; text?: string })
if (events.some((event) => event.type === 'blocked')) fail('provider rejected the server connection; configure a working Node relay.')
if (!events.some((event) => event.type === 'done') || !events.some((event) => event.type === 'result' && event.index === 0 && /\p{Script=Han}/u.test(event.text ?? ''))) {
  fail('no completed Chinese translation received.')
}
console.log('Translation smoke test passed: live provider returned a complete Chinese translation.')
