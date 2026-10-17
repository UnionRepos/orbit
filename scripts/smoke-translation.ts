/** Exercise the production provider connection; /api/health cannot verify it. */
export {}
const origin = process.env.PRODUCTION_URL ?? 'https://orbit.openhub.today'
const response = await fetch(new URL('/api/translate/readme', origin), {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ target: 'zh', passages: [{ index: 0, text: 'An open-source documentation tool.' }] }),
  signal: AbortSignal.timeout(45_000),
})
if (!response.ok) throw new Error(`Translation smoke test: HTTP ${response.status}`)
const events = (await response.text()).split(/\r?\n/).filter((line) => line.startsWith('data:'))
  .map((line) => JSON.parse(line.slice(5)) as { type: string; index?: number; text?: string })
if (events.some((event) => event.type === 'blocked')) throw new Error('Translation smoke test: provider rejected the server connection; configure a working Node relay.')
if (!events.some((event) => event.type === 'done') || !events.some((event) => event.type === 'result' && event.index === 0 && /\p{Script=Han}/u.test(event.text ?? ''))) {
  throw new Error('Translation smoke test: no completed Chinese translation received.')
}
console.log('Translation smoke test passed: live provider returned a complete Chinese translation.')
