// "Golden Path" wedding templates — deep-copying a template into a new project
// pre-creates its ceremonies + default vendor requirement categories, and skips
// any ceremony that falls beyond the wedding's date range.
//
// Run:  node --import tsx --test packages/db/tests/templates.test.ts

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createClient } from '@supabase/supabase-js'
import {
  withUser, withSystem, closePools,
  onboardPlanner, createProject, applyWeddingTemplate, listEvents, listProjectRequirements,
} from '@vivahsync/db'

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
async function signUp(email: string): Promise<string> {
  const supabase = createClient(SUPA_URL, ANON, { auth: { persistSession: false } })
  const { data, error } = await supabase.auth.signUp({ email, password: `Pw-${crypto.randomUUID()}` })
  if (error) throw new Error(`signUp failed: ${error.message}`)
  return data.user!.id
}

const tag = crypto.randomUUID().slice(0, 8)
const s = { planner: '', org: '' }

before(async () => {
  s.planner = await signUp(`tmpl-${tag}@example.com`)
  s.org = await onboardPlanner(s.planner, { orgName: `Tmpl Agency ${tag}` })
})

after(async () => {
  await withSystem(async (tx) => {
    await tx.query('delete from projects where owner_org_id = $1', [s.org])
    await tx.query('delete from organizations where id = $1', [s.org])
    await tx.query('delete from auth.users where id = $1', [s.planner])
  }).catch(() => {})
  await closePools()
})

test('a 3-day template fills a 3-day wedding with all its ceremonies + requirements', async () => {
  const project = (await createProject(s.planner, {
    ownerOrgId: s.org, name: 'Full', city: 'Jaipur',
    startDate: '2027-03-01', endDate: '2027-03-03', guestCount: 300,
  })).id
  const res = await applyWeddingTemplate(s.planner, { projectId: project, templateKey: '3day-destination' })
  assert.equal(res.ceremonies, 6)
  assert.ok(res.requirements >= 6, 'default vendor categories are seeded')

  const events = await listEvents(s.planner, project)
  assert.equal(events.length, 6)
  assert.ok(events.some((e) => e.name === 'Sangeet') && events.some((e) => e.name === 'Reception'))

  const reqs = await listProjectRequirements(s.planner, project)
  assert.equal(reqs.length, res.requirements)
})

test('a shorter wedding skips ceremonies that fall beyond its dates', async () => {
  const oneDay = (await createProject(s.planner, {
    ownerOrgId: s.org, name: 'OneDay', city: 'Jaipur',
    startDate: '2027-04-01', endDate: '2027-04-01', guestCount: 120,
  })).id
  const res = await applyWeddingTemplate(s.planner, { projectId: oneDay, templateKey: '3day-destination' })
  // only the day-0 ceremonies (Mehndi, Welcome Dinner) fit a single-day wedding
  assert.equal(res.ceremonies, 2)
  assert.equal((await listEvents(s.planner, oneDay)).length, 2)
})

test('an unknown template key is a no-op', async () => {
  const project = (await createProject(s.planner, {
    ownerOrgId: s.org, name: 'None', city: 'Jaipur',
    startDate: '2027-05-01', endDate: '2027-05-02', guestCount: 100,
  })).id
  const res = await applyWeddingTemplate(s.planner, { projectId: project, templateKey: 'does-not-exist' })
  assert.deepEqual(res, { ceremonies: 0, requirements: 0 })
  assert.equal((await withUser(s.planner, (tx) => tx.query('select count(*)::int as n from events where project_id = $1', [project]))).rows[0].n, 0)
})
