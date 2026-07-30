// FR-801 risk dashboard. Two layers:
//   * computeRisks() is PURE — exhaustively unit-tested with crafted facts
//   * getRiskFacts() gathers the facts under RLS — one integration test proves
//     the end-to-end path (an unfulfilled vendor + spaceless ceremony surface)
//
// Run:  node --import tsx --test packages/db/tests/risk.test.ts

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createClient } from '@supabase/supabase-js'
import {
  withSystem, closePools,
  onboardPlanner, createProject, scheduleEvent,
  createVendor, addRequirement, createBooking, transitionBooking,
  getRiskFacts, type RiskFacts,
} from '@vivahsync/db'
import { computeRisks } from '@vivahsync/core'

// ---------------------------------------------------------------------------
// pure unit tests (no database)
// ---------------------------------------------------------------------------
const EMPTY: RiskFacts = { requirements: [], eventsWithoutSpace: [], pendingChanges: [] }
const opts = { proximityDays: 14 }

test('no facts → no risks (neutral state)', () => {
  assert.deepEqual(computeRisks(EMPTY, opts), [])
})

test('an unfulfilled requirement is HIGH when near, MEDIUM when far', () => {
  const near = computeRisks(
    { ...EMPTY, requirements: [{ event_name: 'Sangeet', event_date: '2026-12-05', days_until: 3, category: 'DECOR', fulfillment_status: 'UNFULFILLED' }] },
    opts,
  )
  assert.equal(near[0].type, 'UNFULFILLED_REQUIREMENT')
  assert.equal(near[0].severity, 'HIGH')

  const far = computeRisks(
    { ...EMPTY, requirements: [{ event_name: 'Sangeet', event_date: '2027-01-01', days_until: 40, category: 'DECOR', fulfillment_status: 'UNFULFILLED' }] },
    opts,
  )
  assert.equal(far[0].severity, 'MEDIUM')
})

test('an OPEN requirement is a risk only within the proximity window', () => {
  const within = computeRisks(
    { ...EMPTY, requirements: [{ event_name: 'Haldi', event_date: '2026-12-05', days_until: 5, category: 'CATERING', fulfillment_status: 'OPEN' }] },
    opts,
  )
  assert.equal(within.length, 1)
  assert.equal(within[0].type, 'UNBOOKED_REQUIREMENT')

  const beyond = computeRisks(
    { ...EMPTY, requirements: [{ event_name: 'Haldi', event_date: '2027-06-01', days_until: 200, category: 'CATERING', fulfillment_status: 'OPEN' }] },
    opts,
  )
  assert.deepEqual(beyond, [])
})

test('fulfilled requirements and past ceremonies produce no risk', () => {
  const r = computeRisks(
    { ...EMPTY, requirements: [
      { event_name: 'Done', event_date: '2026-12-05', days_until: 2, category: 'MAKEUP', fulfillment_status: 'FULFILLED' },
      { event_name: 'Past', event_date: '2020-01-01', days_until: -5, category: 'MAKEUP', fulfillment_status: 'UNFULFILLED' },
    ] },
    opts,
  )
  assert.deepEqual(r, [])
})

test('a spaceless approaching ceremony and a pending change both surface', () => {
  const r = computeRisks(
    {
      requirements: [],
      eventsWithoutSpace: [{ event_name: 'Reception', event_date: '2026-12-05', days_until: 2 }],
      pendingChanges: [{ event_name: 'Wedding', event_date: '2026-12-06', days_until: 3, unacked: 2 }],
    },
    opts,
  )
  assert.ok(r.find((x) => x.type === 'NO_SPACE'))
  assert.ok(r.find((x) => x.type === 'PENDING_SCHEDULE_CHANGE'))
})

test('risks are ordered by severity then soonest', () => {
  const r = computeRisks(
    {
      requirements: [
        { event_name: 'A', event_date: '2026-12-20', days_until: 20, category: 'DECOR', fulfillment_status: 'UNFULFILLED' }, // MEDIUM
        { event_name: 'B', event_date: '2026-12-03', days_until: 1, category: 'DECOR', fulfillment_status: 'UNFULFILLED' }, // HIGH
      ],
      eventsWithoutSpace: [{ event_name: 'C', event_date: '2026-12-04', days_until: 2 }], // HIGH
      pendingChanges: [],
    },
    opts,
  )
  assert.equal(r[0].severity, 'HIGH')
  assert.equal(r[r.length - 1].severity, 'MEDIUM')
  // among the two HIGHs, day-1 before day-2
  assert.equal(r[0].eventName, 'B')
})

// ---------------------------------------------------------------------------
// integration (real facts under RLS, dates relative to now)
// ---------------------------------------------------------------------------
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
const s = { user: '', org: '', project: '' }

before(async () => {
  s.user = await signUp(`risk-${tag}@example.com`)
  s.org = await onboardPlanner(s.user, { orgName: `Risk Agency ${tag}` })
  const start = iso(3)
  const end = iso(5)
  s.project = (await createProject(s.user, {
    ownerOrgId: s.org, name: 'Near Wedding', city: 'Delhi', startDate: start, endDate: end, guestCount: 200,
  })).id
  const event = (await scheduleEvent(s.user, {
    projectId: s.project, name: 'Sangeet',
    startsAt: `${start}T18:00:00+05:30`, endsAt: `${start}T22:00:00+05:30`,
    setupMinutes: 0, teardownMinutes: 0,
  })).id // deliberately no space
  const vendor = (await createVendor(s.user, { ownerOrgId: s.org, name: 'DJ X', category: 'MUSIC_DJ' })).id
  const req = (await addRequirement(s.user, {
    eventId: event, category: 'MUSIC_DJ', scopeNotes: 'Sound',
    arrivalAt: `${start}T16:00:00+05:30`, completionAt: `${start}T22:30:00+05:30`,
  })).id
  const booking = (await createBooking(s.user, { requirementId: req, vendorId: vendor, send: true })).id
  await transitionBooking(s.user, { bookingId: booking, toStatus: 'REJECTED', rejectionReason: 'Unavailable' })
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

test('a rejected vendor and a spaceless approaching ceremony surface as real risks', async () => {
  const facts = await getRiskFacts(s.user, s.project)
  const risks = computeRisks(facts, { proximityDays: 14 })

  const unfulfilled = risks.find((r) => r.type === 'UNFULFILLED_REQUIREMENT')
  assert.ok(unfulfilled, 'the rejected DJ requirement should surface')
  assert.equal(unfulfilled!.severity, 'HIGH')
  assert.equal(unfulfilled!.eventName, 'Sangeet')

  assert.ok(risks.find((r) => r.type === 'NO_SPACE'), 'the spaceless ceremony should surface')
})
