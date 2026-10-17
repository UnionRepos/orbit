import fs from 'node:fs'

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))
pkg.scripts.test =
  'node --test --test-concurrency=1 "server/**/*.test.ts" "src/**/*.test.ts"'
fs.writeFileSync('package.json', `${JSON.stringify(pkg, null, 2)}\n`)
