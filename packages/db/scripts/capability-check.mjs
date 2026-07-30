// Supabase capability + security-primitive check for VivahSync.
//
// This is the single most important thing to verify BEFORE building the schema
// on top of it. It proves, with real queries (not feature-existence checks):
//   1. The privileged connection can install btree_gist + pg_trgm.
//   2. The app connection (transaction pooler, 6543) can set identity
//      transaction-locally AND that identity does NOT leak across pooled
//      transactions.
//   3. SET LOCAL ROLE authenticated makes RLS actually engage, and auth.uid()
//      reflects the injected JWT claim.
//   4. Whether the raw app connection (no SET ROLE) bypasses RLS as table owner
//      — which is exactly why withUser() must always SET LOCAL ROLE.
//
// Run:  npm run db:check   (from repo root)

import { fileURLToPath } from 'node:url'
import { config } from 'dotenv'
import pg from 'pg'

config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)) })

const APP_URL = process.env.DATABASE_URL // transaction pooler, 6543
const ADMIN_URL = process.env.WORKER_DATABASE_URL || process.env.DIRECT_URL // session, 5432

if (!APP_URL || !ADMIN_URL) {
  console.error('Missing DATABASE_URL or WORKER_DATABASE_URL/DIRECT_URL in .env')
  process.exit(1)
}

const ssl = { rejectUnauthorized: false }
const UUID_A = '11111111-1111-1111-1111-111111111111'
const UUID_B = '22222222-2222-2222-2222-222222222222'

const results = []
const record = (name, ok, detail) => {
  results.push({ name, ok, detail })
  const tag = ok === true ? 'PASS' : ok === false ? 'FAIL' : 'INFO'
  console.log(`  [${tag}] ${name}${detail ? ` — ${detail}` : ''}`)
}

const claims = (sub) => JSON.stringify({ sub, role: 'authenticated' })

async function main() {
  console.log('\n=== VivahSync Supabase capability check ===\n')

  // ---------------------------------------------------------------------------
  // 1. Privileged connection (session pooler): version, role, extensions
  // ---------------------------------------------------------------------------
  console.log('1. Privileged connection (WORKER_DATABASE_URL / session pooler)')
  const admin = new pg.Client({ connectionString: ADMIN_URL, ssl })
  await admin.connect()
  try {
    const v = await admin.query('select version()')
    record('connect (privileged)', true, v.rows[0].version.split(' ').slice(0, 2).join(' '))

    const who = await admin.query(
      "select current_user, current_setting('is_superuser') as superuser"
    )
    record('privileged role', 'info', `current_user=${who.rows[0].current_user}, superuser=${who.rows[0].superuser}`)

    for (const ext of ['btree_gist', 'pg_trgm']) {
      try {
        await admin.query(`create extension if not exists ${ext}`)
        record(`extension ${ext}`, true, 'available')
      } catch (e) {
        record(`extension ${ext}`, false, e.message)
      }
    }

    const authUid = await admin.query("select to_regprocedure('auth.uid()') is not null as present")
    record('auth.uid() function', authUid.rows[0].present === true, authUid.rows[0].present ? 'present' : 'MISSING (Supabase auth schema not found)')

    const gru = await admin.query('select gen_random_uuid() as u')
    record('gen_random_uuid()', !!gru.rows[0].u, gru.rows[0].u)

    // Build a self-contained RLS fixture we can probe from the app connection.
    await admin.query('drop table if exists public.cap_check_rls')
    await admin.query(
      'create table public.cap_check_rls (id uuid primary key default gen_random_uuid(), owner uuid not null, note text)'
    )
    await admin.query('alter table public.cap_check_rls enable row level security')
    await admin.query(
      `create policy cap_sel on public.cap_check_rls for select to authenticated using (owner = auth.uid())`
    )
    await admin.query('grant select on public.cap_check_rls to authenticated')
    await admin.query('insert into public.cap_check_rls (owner, note) values ($1, $2), ($3, $4)', [
      UUID_A, 'row-of-A', UUID_B, 'row-of-B',
    ])
    record('RLS fixture created', true, '2 rows (owner A, owner B), policy owner = auth.uid()')
  } finally {
    // keep fixture for the app-connection probes; cleaned at the end
  }

  // ---------------------------------------------------------------------------
  // 2. App connection (transaction pooler): identity, transaction-locality, leak
  // ---------------------------------------------------------------------------
  console.log('\n2. App connection (DATABASE_URL / transaction pooler, 6543)')
  const pool = new pg.Pool({ connectionString: APP_URL, ssl, max: 3 })

  // role + bypassrls of the raw app role
  {
    const r = await pool.query(
      "select current_user, current_setting('is_superuser') as su, " +
        '(select rolbypassrls from pg_roles where rolname = current_user) as bypassrls'
    )
    record('app role', 'info', `current_user=${r.rows[0].current_user}, superuser=${r.rows[0].su}, bypassrls=${r.rows[0].bypassrls}`)
  }

  // withUser()-style transaction for user A
  async function asUser(sub, fn) {
    const client = await pool.connect()
    try {
      await client.query('begin')
      await client.query('set local role authenticated')
      await client.query("select set_config('request.jwt.claims', $1, true)", [claims(sub)])
      const out = await fn(client)
      await client.query('commit')
      return out
    } catch (e) {
      await client.query('rollback').catch(() => {})
      throw e
    } finally {
      client.release()
    }
  }

  // 2a. identity is set inside the transaction
  {
    const r = await asUser(UUID_A, (c) =>
      c.query("select current_user, auth.uid() as uid, current_setting('request.jwt.claims', true) as claims")
    )
    const row = r.rows[0]
    const ok = row.current_user === 'authenticated' && row.uid === UUID_A
    record('SET LOCAL ROLE + txn-local claims', ok, `current_user=${row.current_user}, auth.uid()=${row.uid}`)
  }

  // 2b. identity does NOT persist after the transaction (pooled connection reuse)
  {
    const r = await pool.query(
      "select current_user, coalesce(current_setting('request.jwt.claims', true), '') as claims, auth.uid() as uid"
    )
    const row = r.rows[0]
    const ok = row.current_user !== 'authenticated' && !row.claims && row.uid === null
    record('identity is transaction-local (no leak after commit)', ok, `current_user=${row.current_user}, claims='${row.claims}', auth.uid()=${row.uid}`)
  }

  // 2c. two sequential users on the same pool don't cross-contaminate
  {
    const a = await asUser(UUID_A, (c) => c.query('select auth.uid() as uid'))
    const b = await asUser(UUID_B, (c) => c.query('select auth.uid() as uid'))
    const ok = a.rows[0].uid === UUID_A && b.rows[0].uid === UUID_B
    record('no identity bleed between pooled transactions', ok, `A=${a.rows[0].uid}, B=${b.rows[0].uid}`)
  }

  // ---------------------------------------------------------------------------
  // 3. RLS actually engages under authenticated, driven by auth.uid()
  // ---------------------------------------------------------------------------
  console.log('\n3. RLS enforcement (the core guarantee)')
  {
    const a = await asUser(UUID_A, (c) => c.query('select count(*)::int as n, min(note) as note from public.cap_check_rls'))
    const ok = a.rows[0].n === 1 && a.rows[0].note === 'row-of-A'
    record('user A sees only A\'s row (RLS engaged)', ok, `rows=${a.rows[0].n}, note=${a.rows[0].note}`)

    const b = await asUser(UUID_B, (c) => c.query('select count(*)::int as n, min(note) as note from public.cap_check_rls'))
    const okB = b.rows[0].n === 1 && b.rows[0].note === 'row-of-B'
    record('user B sees only B\'s row', okB, `rows=${b.rows[0].n}, note=${b.rows[0].note}`)
  }

  // 3b. raw app connection WITHOUT set role — does it bypass RLS as table owner?
  {
    const raw = await pool.query('select count(*)::int as n from public.cap_check_rls')
    const bypasses = raw.rows[0].n === 2
    record(
      'raw app conn (no SET ROLE) bypasses RLS',
      'info',
      bypasses
        ? `YES — sees all ${raw.rows[0].n} rows. => withUser() MUST always SET LOCAL ROLE authenticated (fail-open otherwise).`
        : `no — sees ${raw.rows[0].n} rows even without SET ROLE.`
    )
  }

  // ---------------------------------------------------------------------------
  // cleanup
  // ---------------------------------------------------------------------------
  await admin.query('drop table if exists public.cap_check_rls')
  await admin.end()
  await pool.end()

  const failed = results.filter((r) => r.ok === false)
  console.log(`\n=== ${failed.length === 0 ? 'ALL CHECKS PASSED' : failed.length + ' CHECK(S) FAILED'} ===\n`)
  if (failed.length) {
    for (const f of failed) console.log(`  FAILED: ${f.name} — ${f.detail}`)
    process.exit(1)
  }
}

main().catch((e) => {
  console.error('\ncapability check crashed:', e)
  process.exit(1)
})
