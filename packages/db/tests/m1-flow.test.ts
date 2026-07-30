// M1 end-to-end integration test: exercises the REAL flow the UI uses.
//   Supabase Auth sign-up  ->  onboardPlanner()  ->  createProject()  ->  listProjects()
// plus a second (competing) agency to prove RLS isolation holds through the
// same data-access functions the server actions call.
//
// Run:  node --import tsx --test packages/db/tests/m1-flow.test.ts

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createClient } from '@supabase/supabase-js'
import {
  withSystem,
  closePools,
  onboardPlanner,
  createProject,
  listProjects,
  getMyContext,
} from '@vivahsync/db'

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

async function signUp(email: string): Promise<string> {
  const supabase = createClient(SUPA_URL, ANON, { auth: { persistSession: false } })
  const { data, error } = await supabase.auth.signUp({
    email,
    password: `Pw-${crypto.randomUUID()}`,
  })
  if (error) throw new Error(`signUp failed: ${error.message}`)
  if (!data.user) throw new Error('signUp returned no user (email confirmation may be required)')
  return data.user.id
}

const tag = crypto.randomUUID().slice(0, 8)
const s = { u1: '', u2: '', org1: '', org2: '', proj1: '' }

before(async () => {
  s.u1 = await signUp(`m1-a-${tag}@example.com`)
  s.u2 = await signUp(`m1-b-${tag}@example.com`)

  s.org1 = await onboardPlanner(s.u1, {
    orgName: `Agency A ${tag}`,
    fullName: 'Planner A',
    email: `m1-a-${tag}@example.com`,
  })
  s.org2 = await onboardPlanner(s.u2, {
    orgName: `Agency B ${tag}`,
    fullName: 'Planner B',
    email: `m1-b-${tag}@example.com`,
  })

  s.proj1 = (
    await createProject(s.u1, {
      ownerOrgId: s.org1,
      name: 'Mehra-Kapoor',
      city: 'Jaipur',
      startDate: '2026-12-05',
      endDate: '2026-12-09',
      guestCount: 400,
    })
  ).id
})

after(async () => {
  await withSystem(async (tx) => {
    await tx.query('delete from projects where owner_org_id = any($1)', [[s.org1, s.org2]])
    await tx.query('delete from organizations where id = any($1)', [[s.org1, s.org2]])
    await tx.query('delete from auth.users where id = any($1)', [[s.u1, s.u2]])
  }).catch(() => {})
  await closePools()
})

test('a signed-up user is onboarded into their agency', async () => {
  const ctx = await getMyContext(s.u1)
  assert.equal(ctx.onboarded, true)
  assert.equal(ctx.org?.id, s.org1)
  assert.equal(ctx.org?.name, `Agency A ${tag}`)
  assert.equal(ctx.org?.type, 'PLANNER')
})

test('the agency sees the wedding it created', async () => {
  const projects = await listProjects(s.u1)
  assert.equal(projects.length, 1)
  assert.equal(projects[0].id, s.proj1)
  assert.equal(projects[0].name, 'Mehra-Kapoor')
  assert.equal(projects[0].city, 'Jaipur')
  assert.equal(projects[0].expected_guest_count, 400)
  assert.equal(projects[0].status, 'DRAFT')
})

test('a competing agency sees none of it (RLS via the real data path)', async () => {
  const projects = await listProjects(s.u2)
  assert.equal(projects.length, 0)
})

test('a brand-new agency starts with zero weddings', async () => {
  const projects = await listProjects(s.u2)
  assert.deepEqual(projects, [])
  const ctx = await getMyContext(s.u2)
  assert.equal(ctx.org?.id, s.org2)
})
