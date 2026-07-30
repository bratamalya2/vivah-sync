// FT-040 main-dashboard action summary: cross-project facts gathered under RLS,
// scored by the shared risk engine. Proves the rollup spans multiple weddings
// and only near-future ceremonies are "upcoming".
//
// Run:  node --import tsx --test packages/db/tests/dashboard.test.ts

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createClient } from '@supabase/supabase-js'
import {
  withSystem, closePools,
  onboardPlanner, createProject, scheduleEvent,
  createVendor, addRequirement, createBooking, transitionBooking,
  getDashboardFacts,
} from '@vivahsync/db'
import { computeRisks } from '@vivahsync/core'

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
async function signUp(email: string): Promise<string> {
  const supabase = createClient(SUPA_URL, ANON, { auth: { persistSession: false } })
  const { data, error } = await supabase.auth.signUp({ email, password: `Pw-${crypto.randomUUID()}` })
  if (error) throw new Error(`signUp failed: ${error.message}`)
  return data.user!.id
}
const iso = (offsetDays: number) =>
  new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10)

const tag = crypto.randomUUID().slice(0, 8)
const s = { user: '', org: '', near: '', far: '' }

before(async () => {
  s.user = await signUp(`dash-${tag}@example.com`)
  s.org = await onboardPlanner(s.user, { orgName: `Dashboard Agency ${tag}` })

  // Wedding A: soon, with a rejected (unfulfilled) vendor requirement + no space
  const aStart = iso(3)
  s.near = (await createProject(s.user, {
    ownerOrgId: s.org, name: 'Soon Wedding', city: 'Delhi', startDate: aStart, endDate: iso(5), guestCount: 200,
  })).id
  const ev = (await scheduleEvent(s.user, {
    projectId: s.near, name: 'Sangeet',
    startsAt: `${aStart}T18:00:00+05:30`, endsAt: `${aStart}T22:00:00+05:30`,
    setupMinutes: 0, teardownMinutes: 0,
  })).id
  const vendor = (await createVendor(s.user, { ownerOrgId: s.org, name: 'DJ Y', category: 'MUSIC_DJ' })).id
  const req = (await addRequirement(s.user, {
    eventId: ev, category: 'MUSIC_DJ', scopeNotes: 'Sound',
    arrivalAt: `${aStart}T16:00:00+05:30`, completionAt: `${aStart}T22:30:00+05:30`,
  })).id
  const booking = (await createBooking(s.user, { requirementId: req, vendorId: vendor, send: true })).id
  await transitionBooking(s.user, { bookingId: booking, toStatus: 'REJECTED', rejectionReason: 'Unavailable' })

  // Wedding B: far in the future, clean
  const bStart = iso(120)
  s.far = (await createProject(s.user, {
    ownerOrgId: s.org, name: 'Later Wedding', city: 'Goa', startDate: bStart, endDate: iso(122), guestCount: 300,
  })).id
  await scheduleEvent(s.user, {
    projectId: s.far, name: 'Reception',
    startsAt: `${bStart}T19:00:00+05:30`, endsAt: `${bStart}T23:00:00+05:30`,
    setupMinutes: 0, teardownMinutes: 0,
  })
})

after(async () => {
  await withSystem(async (tx) => {
    await tx.query('delete from projects where owner_org_id = $1', [s.org])
    await tx.query('delete from vendor_profiles where created_by_org_id = $1', [s.org])
    await tx.query('delete from organizations where id = $1', [s.org])
    await tx.query('delete from auth.users where id = $1', [s.user])
  }).catch(() => {})
  await closePools()
})

test('dashboard facts span every wedding and tag each with its project', async () => {
  const facts = await getDashboardFacts(s.user, 14)

  const projectIds = new Set(facts.requirements.map((r) => r.project_id))
  assert.ok(projectIds.has(s.near), 'the soon wedding requirement should be present')

  const dj = facts.requirements.find((r) => r.project_name === 'Soon Wedding' && r.category === 'MUSIC_DJ')
  assert.ok(dj)
  assert.equal(dj!.fulfillment_status, 'UNFULFILLED')
})

test('only near-future ceremonies are upcoming', async () => {
  const facts = await getDashboardFacts(s.user, 14)
  const names = facts.upcomingEvents.map((e) => e.event_name)
  assert.ok(names.includes('Sangeet'), 'the soon ceremony is upcoming')
  assert.ok(!names.includes('Reception'), 'the +120-day ceremony is NOT upcoming')
})

test('the rollup scores a HIGH risk on the soon wedding, none on the far one', async () => {
  const facts = await getDashboardFacts(s.user, 14)
  const forNear = {
    requirements: facts.requirements.filter((r) => r.project_id === s.near),
    eventsWithoutSpace: facts.eventsWithoutSpace.filter((e) => e.project_id === s.near),
    pendingChanges: facts.pendingChanges.filter((c) => c.project_id === s.near),
  }
  const forFar = {
    requirements: facts.requirements.filter((r) => r.project_id === s.far),
    eventsWithoutSpace: facts.eventsWithoutSpace.filter((e) => e.project_id === s.far),
    pendingChanges: facts.pendingChanges.filter((c) => c.project_id === s.far),
  }
  const nearRisks = computeRisks(forNear, { proximityDays: 14 })
  const farRisks = computeRisks(forFar, { proximityDays: 14 })

  assert.ok(nearRisks.some((r) => r.severity === 'HIGH'), 'soon wedding has a high risk')
  assert.equal(farRisks.length, 0, 'far wedding has no active risks')
})
