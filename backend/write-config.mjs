// Writes backend/functions/api/catalyst-config.json with runtime env vars read from backend/.secrets/env
// (the generated file is git-ignored, so secrets never land in the repo or in logs).
import fs from 'node:fs'
import path from 'node:path'
const dir = path.dirname(new URL(import.meta.url).pathname)
const env = Object.fromEntries(
  fs.readFileSync(path.join(dir, '.secrets/env'), 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]),
)
if (!env.ZAD_SECRET) throw new Error('ZAD_SECRET missing in backend/.secrets/env')
const config = {
  deployment: {
    name: 'api',
    stack: 'node20',
    type: 'advancedio',
    // the seed secret is intentionally NOT deployed: /admin/seed is only usable via local `catalyst serve`
    env_variables: { ZAD_SECRET: env.ZAD_SECRET, ZAD_ORIGINS: env.ZAD_ORIGINS ?? 'https://meat.erpdemo.xyz,http://localhost:5240,http://localhost:5242' },
  },
  execution: { main: 'index.js' },
}
fs.writeFileSync(path.join(dir, 'functions/api/catalyst-config.json'), JSON.stringify(config, null, '\t') + '\n')
console.log('wrote functions/api/catalyst-config.json (env: ' + Object.keys(config.deployment.env_variables).join(', ') + ')')
