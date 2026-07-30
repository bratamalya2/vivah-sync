// Forward-only migration runner. Applies supabase/migrations/*.sql in filename
// order against the privileged connection (WORKER_DATABASE_URL / session pooler),
// tracking applied files in public._vivah_migrations. Idempotent: already-applied
// files are skipped. Each file runs inside a single transaction (atomic).
//
// This is the no-Docker, non-interactive runner. The same SQL files are valid
// `supabase db push` migrations — Supabase SQL remains the canonical source.
//
// Run:  npm run db:apply

import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { config } from 'dotenv'
import pg from 'pg'

config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)) })

const url = process.env.WORKER_DATABASE_URL || process.env.DIRECT_URL
if (!url) { console.error('Missing WORKER_DATABASE_URL / DIRECT_URL'); process.exit(1) }

const migrationsDir = fileURLToPath(new URL('../../../supabase/migrations', import.meta.url))
const files = readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort()

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
await client.connect()

try {
  await client.query(`
    create table if not exists public._vivah_migrations (
      name text primary key,
      applied_at timestamptz not null default now()
    )`)
  const done = new Set(
    (await client.query('select name from public._vivah_migrations')).rows.map((r) => r.name),
  )

  let applied = 0
  for (const f of files) {
    if (done.has(f)) { console.log(`  skip   ${f}`); continue }
    const sql = readFileSync(`${migrationsDir}/${f}`, 'utf8')
    process.stdout.write(`  apply  ${f} ... `)
    try {
      await client.query('begin')
      await client.query(sql)
      await client.query('insert into public._vivah_migrations (name) values ($1)', [f])
      await client.query('commit')
      console.log('ok')
      applied++
    } catch (e) {
      await client.query('rollback').catch(() => {})
      console.log('FAILED')
      console.error(`\n${e.message}\n`)
      process.exit(1)
    }
  }
  console.log(`\n${applied} migration(s) applied, ${files.length - applied} already current.`)
} finally {
  await client.end()
}
