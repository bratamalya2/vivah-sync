// Verifies SUPABASE_SERVICE_ROLE_KEY works against the GoTrue Admin API.
// Reads from repo-root .env. Prints only pass/fail + non-secret key metadata.
//
// Run:  node packages/db/scripts/verify-service-key.mjs

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const envPath = fileURLToPath(new URL('../../../.env', import.meta.url))
const env = {}
for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m) env[m[1]] = m[2]
}

const url = env.NEXT_PUBLIC_SUPABASE_URL
const key = env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env')
  process.exit(1)
}

const format = key.startsWith('sb_secret_')
  ? 'new secret key (sb_secret_…)'
  : key.startsWith('sb_publishable_')
    ? 'WRONG: publishable/client key (sb_publishable_…)'
    : key.startsWith('eyJ')
      ? 'legacy JWT (eyJ…)'
      : 'unrecognized format'

console.log(`\nKey format: ${format}  (length ${key.length})`)

if (key.startsWith('sb_publishable_')) {
  console.log('\n[FAIL] That is the client/publishable key, not the secret key.\n')
  process.exit(1)
}

const res = await fetch(`${url}/auth/v1/admin/users?page=1&per_page=1`, {
  headers: { apikey: key, authorization: `Bearer ${key}` },
})

if (res.ok) {
  const body = await res.json()
  const count = Array.isArray(body?.users) ? body.users.length : 0
  console.log(`\n[PASS] Admin API accepted the key (HTTP ${res.status}). Users page returned ${count} row(s).\n`)
  process.exit(0)
} else {
  const text = await res.text()
  console.log(`\n[FAIL] Admin API rejected the key (HTTP ${res.status}): ${text.slice(0, 200)}\n`)
  process.exit(1)
}
