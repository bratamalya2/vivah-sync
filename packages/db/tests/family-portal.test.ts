// BR-561 family read-only portal — the sharpest RLS test in the build.
// A family member (READ_ONLY) must:
//   * see the project and a REDACTED run-sheet (schedule, spaces, vendor arrival
//     times) with NO phone numbers
//   * read ZERO rows from every operational/commercial/audit table, even by
//     querying it directly (FR-561.1)
// while the planner (FULL) is completely unaffected.
//
// Run:  node --import tsx --test packages/db/tests/family-portal.test.ts

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createClient } from '@supabase/supabase-js'
import {
  withUser, withSystem, closePools,
  onboardPlanner, createProject, createVenue, createSpace, scheduleEvent,
  createVendor, addRequirement, createBooking, transitionBooking,
  addVenueOverride, generatePlaybook, listProjects,
  inviteFamily, listProjectInvitations, claimFamilyInvitations, familyRunsheet,
} from '@vivahsync/db'

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
async function signUp(email: string): Promise<string> {
  const supabase = createClient(SUPA_URL, ANON, { auth: { persistSession: false } })
  const { data, error } = await supabase.auth.signUp({ email, password: `Pw-${crypto.randomUUID()}` })
  if (error) throw new Error(`signUp failed: ${error.message}`)
  return data.user!.id
}
async function count(userId: string, table: string): Promise<number> {
  const r = await withUser(userId, (tx) => tx.query<{ n: number }>(`select count(*)::int as n from ${table}`))
  return r.rows[0].n
}

const tag = crypto.randomUUID().slice(0, 8)
const famEmail = `fam-${tag}@example.com`
const s = { planner: '', family: '', org: '', project: '' }

before(async () => {
  s.planner = await signUp(`plan-${tag}@example.com`)
  s.family = await signUp(famEmail)
  s.org = await onboardPlanner(s.planner, { orgName: `Fam Agency ${tag}` })
  s.project = (await createProject(s.planner, {
    ownerOrgId: s.org, name: 'Mehra-Kapoor', city: 'Jaipur',
    startDate: '2026-12-05', endDate: '2026-12-06', guestCount: 400,
  })).id
  const venue = (await createVenue(s.planner, { ownerOrgId: s.org, name: 'Rambagh Palace' })).id
  const space = (await createSpace(s.planner, { venueId: venue, name: 'Front Lawn', legalMaxCapacity: 600 })).id
  const event = (await scheduleEvent(s.planner, {
    projectId: s.project, name: 'Sangeet',
    startsAt: '2026-12-05T18:00:00+05:30', endsAt: '2026-12-05T22:00:00+05:30',
    setupMinutes: 60, teardownMinutes: 30, guestCount: 400, spaceId: space,
  })).id
  const vendor = (await createVendor(s.planner, { ownerOrgId: s.org, name: 'LensCraft', category: 'PHOTOGRAPHY' })).id
  const req = (await addRequirement(s.planner, {
    eventId: event, category: 'PHOTOGRAPHY', scopeNotes: 'Secret commercial scope',
    arrivalAt: '2026-12-05T16:00:00+05:30', completionAt: '2026-12-05T23:00:00+05:30',
  })).id
  const booking = (await createBooking(s.planner, { requirementId: req, vendorId: vendor, send: true })).id
  await transitionBooking(s.planner, { bookingId: booking, toStatus: 'ACCEPTED' })
  await addVenueOverride(s.planner, {
    eventId: event, ruleKey: 'ACCESS_CLOSE', overrideValue: '02:00', rationale: 'internal note',
  })
  await generatePlaybook(s.planner, s.project)
})

after(async () => {
  await withSystem(async (tx) => {
    await tx.query('delete from projects where owner_org_id = $1', [s.org])
    await tx.query('delete from venues where owner_org_id = $1', [s.org])
    await tx.query('delete from vendor_profiles where created_by_org_id = $1', [s.org])
    await tx.query('delete from organizations where id = $1', [s.org])
    await tx.query('delete from organizations where id in (select org_id from memberships where user_id = $1)', [s.family])
    await tx.query('delete from auth.users where id = any($1)', [[s.planner, s.family]])
  }).catch(() => {})
  await closePools()
})

test('before being invited, a family member has no access', async () => {
  assert.equal((await listProjects(s.family)).length, 0)
  await assert.rejects(
    () => familyRunsheet(s.family, s.project),
    (err: { code?: string }) => err.code === '42501',
  )
})

test('planner invites family; family claims the invitation', async () => {
  await inviteFamily(s.planner, { projectId: s.project, email: famEmail, name: 'Aunt Meera' })
  const invites = await listProjectInvitations(s.planner, s.project)
  assert.equal(invites.length, 1)
  assert.equal(invites[0].claimed_at, null)

  const claimed = await claimFamilyInvitations(s.family)
  assert.equal(claimed, 1)
  // idempotent
  assert.equal(await claimFamilyInvitations(s.family), 0)
})

test('family sees the wedding and a REDACTED run-sheet (no phone numbers)', async () => {
  const projects = await listProjects(s.family)
  assert.equal(projects.length, 1)
  assert.equal(projects[0].name, 'Mehra-Kapoor')

  const rs = await familyRunsheet(s.family, s.project)
  const ev = rs.days.flatMap((d) => d.events).find((e) => e.name === 'Sangeet')!
  assert.ok(ev)
  assert.deepEqual(ev.spaces, [{ venue: 'Rambagh Palace', space: 'Front Lawn' }])
  assert.equal(ev.vendors.length, 1)
  assert.equal(ev.vendors[0].category, 'PHOTOGRAPHY')
  assert.equal(ev.vendors[0].name, 'LensCraft')
  assert.equal(ev.vendors[0].arrival, '16:00')
  // redaction: no phone, no scope, no financial detail
  assert.equal('phone' in ev.vendors[0], false)
  assert.equal('scope' in ev.vendors[0], false)
})

test('family reads ZERO rows from every operational/commercial/audit table', async () => {
  for (const table of [
    'booking_requests',
    'vendor_requirements',
    'venue_rule_overrides',
    'audit_logs',
    'playbooks',
    'space_bookings',
    'schedule_change_proposals',
  ]) {
    assert.equal(await count(s.family, table), 0, `family must not read ${table}`)
  }
})

test('the planner (FULL) is completely unaffected', async () => {
  assert.ok((await count(s.planner, 'booking_requests')) > 0)
  assert.ok((await count(s.planner, 'audit_logs')) > 0)
  assert.ok((await count(s.planner, 'playbooks')) > 0)
  assert.ok((await count(s.planner, 'vendor_requirements')) > 0)
})
