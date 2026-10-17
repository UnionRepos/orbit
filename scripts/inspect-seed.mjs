import fs from 'node:fs'

const seed = JSON.parse(fs.readFileSync('server/seed.json', 'utf8'))
console.log(seed.items.length)
console.log(seed.items.slice(0, 5).map((r) => r.full_name))
console.log(
  'facebook/react:',
  seed.items.some((r) => r.full_name.toLowerCase() === 'facebook/react'),
)
console.log(
  'languages:',
  [...new Set(seed.items.map((r) => r.language))].slice(0, 12),
)
