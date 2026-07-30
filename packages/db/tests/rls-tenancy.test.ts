// Attempt-the-violation RLS tests for the tenancy core, run against the real
// Supabase database. These assert on ROW COUNTS from real queries as the
// `authenticated` role (via withUser) — never on the presence of policies.
//
// The scenario is the hardest real case from the spec: two competing planner
// agencies, plus a production company granted cross-org FULL access to one
// agency's project. The competitor must never see the other's project; the
// collaborator must see exactly the project it was granted.
//
// Run:  node --import tsx --test packages/db/tests/rls-tenancy.test.ts

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { withUser, withSystem, closePools } from '@vivahsync/db'

// We create auth.users directly via the privileged connection rather than the
// GoTrue Admin API (this project uses ES256 signing keys, which the pasted
// service-role key can't drive). Tests never authenticate as these users
// through GoTrue — withUser() injects their id into request.jwt.claims directly.

function defaultForType(dataType: string): unknown {
  if (dataType === 'uuid') return '00000000-0000-0000-0000-000000000000'
  if (dataType === 'boolean') return false
  if (dataType === 'jsonb' || dataType === 'json') return '{}'
  if (dataType.startsWith('timestamp')) return new Date().toISOString()
  return '' // text / character varying / etc.
}

async function createAuthUser(email: string): Promise<string> {
  const id = crypto.randomUUID()
  await withSystem(async (tx) => {
    // Adapt to whatever this GoTrue version marks NOT NULL without a default.
    const cols = await tx.query<{ column_name: string; data_type: string }>(
      `select column_name, data_type from information_schema.columns
        where table_schema = 'auth' and table_name = 'users'
          and is_nullable = 'NO' and column_default is null`,
    )
    const provided: Record<string, unknown> = {
      id,
      email,
      aud: 'authenticated',
      role: 'authenticated',
      email_confirmed_at: new Date().toISOString(),
    }
    for (const c of cols.rows) {
      if (c.column_name in provided) continue
      provided[c.column_name] = defaultForType(c.data_type)
    }
    const names = Object.keys(provided)
    const placeholders = names.map((_, i) => `$${i + 1}`)
    await tx.query(
      `insert into auth.users (${names.join(', ')}) values (${placeholders.join(', ')})`,
      names.map((n) => provided[n]),
    )
  })
  return id
}

async function deleteAuthUser(id: string): Promise<void> {
  await withSystem((tx) => tx.query('delete from auth.users where id = $1', [id])).catch(() => {})
}

const tag = crypto.randomUUID().slice(0, 8)
const ids = { userA: '', userB: '', userC: '', orgA: '', orgB: '', orgC: '', projA: '', projB: '' }

before(async () => {
  ids.userA = await createAuthUser(`vivah-a-${tag}@example.com`)
  ids.userB = await createAuthUser(`vivah-b-${tag}@example.com`)
  ids.userC = await createAuthUser(`vivah-c-${tag}@example.com`)

  // Agency A (planner) onboards and creates a wedding project.
  ids.orgA = (
    await withUser(ids.userA, (tx) =>
      tx.query<{ onboard_planner: string }>('select app.onboard_planner($1) as onboard_planner', [
        `Agency A ${tag}`,
      ]),
    )
  ).rows[0].onboard_planner
  ids.projA = (
    await withUser(ids.userA, (tx) =>
      tx.query<{ id: string }>(
        `insert into projects (owner_org_id, name, city, start_date, end_date, expected_guest_count)
         values ($1, 'Mehra-Kapoor', 'Jaipur', '2026-12-05', '2026-12-09', 400) returning id`,
        [ids.orgA],
      ),
    )
  ).rows[0].id

  // Agency B (competing planner) onboards and creates its own project.
  ids.orgB = (
    await withUser(ids.userB, (tx) =>
      tx.query<{ onboard_planner: string }>('select app.onboard_planner($1) as onboard_planner', [
        `Agency B ${tag}`,
      ]),
    )
  ).rows[0].onboard_planner
  ids.projB = (
    await withUser(ids.userB, (tx) =>
      tx.query<{ id: string }>(
        `insert into projects (owner_org_id, name, city, start_date, end_date)
         values ($1, 'Rao-Iyer', 'Udaipur', '2026-11-20', '2026-11-22') returning id`,
        [ids.orgB],
      ),
    )
  ).rows[0].id

  // Production company C exists (already onboarded elsewhere).
  ids.orgC = (
    await withSystem(async (tx) => {
      await tx.query('insert into app_users (id) values ($1) on conflict do nothing', [ids.userC])
      const r = await tx.query<{ id: string }>(
        `insert into organizations (type, name) values ('PRODUCTION', $1) returning id`,
        [`Production C ${tag}`],
      )
      await tx.query('insert into memberships (user_id, org_id, role) values ($1, $2, $3)', [
        ids.userC,
        r.rows[0].id,
        'OWNER',
      ])
      return r
    })
  ).rows[0].id

  // Agency A grants the production company FULL cross-org access to project A.
  await withUser(ids.userA, (tx) =>
    tx.query(
      `insert into project_grants (project_id, org_id, role, scope)
       values ($1, $2, 'COLLABORATOR', 'FULL')`,
      [ids.projA, ids.orgC],
    ),
  )
})

after(async () => {
  await withSystem(async (tx) => {
    await tx.query('delete from projects where owner_org_id = any($1)', [[ids.orgA, ids.orgB]])
    await tx.query('delete from organizations where id = any($1)', [[ids.orgA, ids.orgB, ids.orgC]])
  }).catch(() => {})
  await Promise.all([ids.userA, ids.userB, ids.userC].filter(Boolean).map(deleteAuthUser))
  await closePools()
})

test('planner A sees exactly its own project', async () => {
  const r = await withUser(ids.userA, (tx) =>
    tx.query<{ id: string }>('select id from projects'),
  )
  assert.equal(r.rows.length, 1)
  assert.equal(r.rows[0].id, ids.projA)
})

test('competing planner B CANNOT see agency A\'s project (the leak we prevent)', async () => {
  const r = await withUser(ids.userB, (tx) =>
    tx.query<{ id: string }>('select id from projects'),
  )
  assert.equal(r.rows.length, 1)
  assert.equal(r.rows[0].id, ids.projB)
  assert.ok(!r.rows.some((row) => row.id === ids.projA), 'B must not see A\'s project')
})

test('production collaborator C sees the granted project, and nothing else', async () => {
  const r = await withUser(ids.userC, (tx) =>
    tx.query<{ id: string; scope: string }>(
      `select p.id, pa.scope from projects p join project_access pa on pa.project_id = p.id`,
    ),
  )
  assert.equal(r.rows.length, 1)
  assert.equal(r.rows[0].id, ids.projA)
  assert.equal(r.rows[0].scope, 'FULL')
})

test('competitor B cannot read agency A\'s cross-org grants', async () => {
  const r = await withUser(ids.userB, (tx) =>
    tx.query('select * from project_grants where project_id = $1', [ids.projA]),
  )
  assert.equal(r.rows.length, 0)
})

test('org visibility follows the grant: A sees production C; B sees neither A nor C', async () => {
  const aSeesC = await withUser(ids.userA, (tx) =>
    tx.query('select 1 from organizations where id = $1', [ids.orgC]),
  )
  assert.equal(aSeesC.rows.length, 1, 'A shares a project grant with C, so A can see C')

  const bSeesA = await withUser(ids.userB, (tx) =>
    tx.query('select 1 from organizations where id = any($1)', [[ids.orgA, ids.orgC]]),
  )
  assert.equal(bSeesA.rows.length, 0, 'B must not enumerate competitor or its collaborators')
})

test('the raw project_access row for C reflects FULL scope (flattening works)', async () => {
  const r = await withUser(ids.userC, (tx) =>
    tx.query<{ scope: string }>('select scope from project_access'),
  )
  assert.equal(r.rows.length, 1)
  assert.equal(r.rows[0].scope, 'FULL')
})
