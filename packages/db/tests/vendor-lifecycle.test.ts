// M4 vendor lifecycle, proved by attempting the violations:
//   * a booking cannot skip states (DRAFT → CONFIRMED)
//   * a rejection without a reason is refused; a valid rejection flips the
//     requirement to UNFULFILLED
//   * a requirement's arrival must precede its completion
//   * once ACCEPTED, the scope snapshot is locked, and the requirement it
//     covers can no longer be edited
//   * fulfillment is recomputed from the bookings
//
// Run:  node --import tsx --test packages/db/tests/vendor-lifecycle.test.ts

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createClient } from '@supabase/supabase-js'
import {
  withSystem,
  closePools,
  onboardPlanner,
  createProject,
  scheduleEvent,
  createVendor,
  addRequirement,
  createBooking,
  transitionBooking,
  listProjectRequirements,
  listProjectBookings,
} from '@vivahsync/db'
import { translateDbError } from '@vivahsync/core'

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

async function signUp(email: string): Promise<string> {
  const supabase = createClient(SUPA_URL, ANON, { auth: { persistSession: false } })
  const { data, error } = await supabase.auth.signUp({ email, password: `Pw-${crypto.randomUUID()}` })
  if (error) throw new Error(`signUp failed: ${error.message}`)
  return data.user!.id
}

const tag = crypto.randomUUID().slice(0, 8)
const s = {
  user: '', other: '', org: '', project: '', event: '',
  vendor: '', req1: '', req2: '', booking1: '',
}

before(async () => {
  s.user = await signUp(`vend-${tag}@example.com`)
  s.other = await signUp(`vend-other-${tag}@example.com`)
  s.org = await onboardPlanner(s.user, { orgName: `Vendor Agency ${tag}` })
  await onboardPlanner(s.other, { orgName: `Rival ${tag}` })

  s.project = (
    await createProject(s.user, {
      ownerOrgId: s.org, name: 'Rao-Iyer', city: 'Udaipur',
      startDate: '2026-12-05', endDate: '2026-12-09', guestCount: 300,
    })
  ).id
  s.event = (
    await scheduleEvent(s.user, {
      projectId: s.project, name: 'Sangeet',
      startsAt: '2026-12-05T18:00:00+05:30', endsAt: '2026-12-05T22:00:00+05:30',
      setupMinutes: 0, teardownMinutes: 0,
    })
  ).id
  s.vendor = (
    await createVendor(s.user, { ownerOrgId: s.org, name: 'LensCraft Studios', category: 'PHOTOGRAPHY' })
  ).id
  s.req1 = (
    await addRequirement(s.user, {
      eventId: s.event, category: 'PHOTOGRAPHY', scopeNotes: 'Full-day candid + traditional',
      arrivalAt: '2026-12-05T16:00:00+05:30', completionAt: '2026-12-05T23:00:00+05:30',
    })
  ).id
  s.req2 = (
    await addRequirement(s.user, {
      eventId: s.event, category: 'CATERING', scopeNotes: 'Dinner for 300',
      arrivalAt: '2026-12-05T15:00:00+05:30', completionAt: '2026-12-05T23:30:00+05:30',
    })
  ).id
})

after(async () => {
  await withSystem(async (tx) => {
    await tx.query('delete from projects where owner_org_id = $1', [s.org])
    await tx.query('delete from vendor_profiles where created_by_org_id = $1', [s.org])
    await tx.query('delete from organizations where id = $1', [s.org])
    await tx.query('delete from organizations where name = $1', [`Rival ${tag}`])
    await tx.query('delete from auth.users where id = any($1)', [[s.user, s.other]])
  }).catch(() => {})
  await closePools()
})

test('a requirement rejects arrival that is after completion', async () => {
  await assert.rejects(
    () =>
      addRequirement(s.user, {
        eventId: s.event, category: 'DECOR', scopeNotes: 'Stage',
        arrivalAt: '2026-12-05T20:00:00+05:30', completionAt: '2026-12-05T18:00:00+05:30',
      }),
    (err: { code?: string }) => err.code === '23514',
  )
})

test('happy path: draft → sent → accepted locks the scope and fulfills the requirement', async () => {
  s.booking1 = (await createBooking(s.user, { requirementId: s.req1, vendorId: s.vendor })).id
  await transitionBooking(s.user, { bookingId: s.booking1, toStatus: 'SENT' })
  await transitionBooking(s.user, { bookingId: s.booking1, toStatus: 'ACCEPTED' })

  const bookings = await listProjectBookings(s.user, s.project)
  const b = bookings.find((x) => x.id === s.booking1)!
  assert.equal(b.status, 'ACCEPTED')
  assert.ok(b.accepted_at, 'accepted_at should be stamped')
  assert.equal(b.acceptance_source, 'PLANNER_RECORDED')

  const reqs = await listProjectRequirements(s.user, s.project)
  assert.equal(reqs.find((r) => r.id === s.req1)!.fulfillment_status, 'FULFILLED')

  const locked = await withSystem((tx) =>
    tx.query<{ locked_scope: { scope_notes: string } }>(
      'select locked_scope from booking_requests where id = $1', [s.booking1],
    ),
  )
  assert.equal(locked.rows[0].locked_scope.scope_notes, 'Full-day candid + traditional')
})

test('a booking cannot skip states (draft → confirmed)', async () => {
  const b = (await createBooking(s.user, { requirementId: s.req2, vendorId: s.vendor })).id
  await assert.rejects(
    () => transitionBooking(s.user, { bookingId: b, toStatus: 'CONFIRMED' }),
    (err: { code?: string }) => {
      assert.equal(err.code, '23514')
      assert.match(translateDbError(err)?.message ?? '', /out of sequence/)
      return true
    },
  )
  // clean the probe booking so req2 stays usable below
  await withSystem((tx) => tx.query('delete from booking_requests where id = $1', [b]))
})

test('rejecting without a reason is refused; with a reason it marks the requirement UNFULFILLED', async () => {
  const b = (await createBooking(s.user, { requirementId: s.req2, vendorId: s.vendor, send: true })).id
  await assert.rejects(
    () => transitionBooking(s.user, { bookingId: b, toStatus: 'REJECTED' }),
    (err: { code?: string }) => {
      assert.equal(err.code, '23514')
      assert.match(translateDbError(err)?.message ?? '', /rejection reason is required/)
      return true
    },
  )
  await transitionBooking(s.user, {
    bookingId: b, toStatus: 'REJECTED', rejectionReason: 'Unavailable on the date',
  })
  const reqs = await listProjectRequirements(s.user, s.project)
  assert.equal(reqs.find((r) => r.id === s.req2)!.fulfillment_status, 'UNFULFILLED')
})

test('an accepted commitment locks the underlying requirement against edits', async () => {
  await assert.rejects(
    () =>
      withSystem((tx) =>
        tx.query('update vendor_requirements set scope_notes = $1 where id = $2', [
          'sneaky change', s.req1,
        ]),
      ),
    (err: { code?: string }) => {
      assert.equal(err.code, '23514')
      assert.match(translateDbError(err)?.message ?? '', /locked by an accepted vendor commitment/)
      return true
    },
  )
})

test('the acceptance snapshot itself is immutable', async () => {
  await assert.rejects(
    () =>
      withSystem((tx) =>
        tx.query(`update booking_requests set locked_scope = '{}'::jsonb where id = $1`, [s.booking1]),
      ),
    (err: { code?: string }) => err.code === '23514',
  )
})

test('a competing agency sees none of the vendoring', async () => {
  const bookings = await listProjectBookings(s.other, s.project)
  assert.equal(bookings.length, 0)
  const reqs = await listProjectRequirements(s.other, s.project)
  assert.equal(reqs.length, 0)
})
