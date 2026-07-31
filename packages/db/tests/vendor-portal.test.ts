// Vendor self-service portal — the vendor-side RLS boundary (migration 0014).
// A claimed vendor account must:
//   * see ONLY the bookings assigned to its own vendor_profile — never another
//     vendor's booking on the same ceremony, never the project/audit/money
//   * accept/decline only its own SENT booking (recorded VENDOR_SELF) and never
//     another vendor's
//   * acknowledge only a schedule change on its own booking
// while reading ZERO rows from the operational tables directly (its only read
// path is the SECURITY DEFINER app.vendor_bookings()), and the planner (FULL)
// is completely unaffected.
//
// Run:  node --import tsx --test packages/db/tests/vendor-portal.test.ts

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createClient } from '@supabase/supabase-js'
import {
  withUser, withSystem, closePools,
  onboardPlanner, createProject, createVenue, createSpace, scheduleEvent,
  createVendor, addRequirement, createBooking, rescheduleEvent,
  inviteVendor, claimVendorInvitations, vendorBookings, vendorRespondBooking, vendorAcknowledge,
  vendorRecordEvidence, vendorEvidence,
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
async function bookingField<T>(id: string, col: string): Promise<T> {
  const r = await withSystem((tx) =>
    tx.query<Record<string, T>>(`select ${col} as v from booking_requests where id = $1`, [id]),
  )
  return r.rows[0].v as unknown as T
}

const tag = crypto.randomUUID().slice(0, 8)
const vendEmail = `vend-${tag}@example.com`
const s = {
  planner: '', vendorUser: '', org: '', project: '', event: '',
  vendorA: '', vendorB: '', bookingA: '', bookingB: '',
}

before(async () => {
  s.planner = await signUp(`plan-${tag}@example.com`)
  s.vendorUser = await signUp(vendEmail)
  s.org = await onboardPlanner(s.planner, { orgName: `Vend Agency ${tag}` })
  s.project = (await createProject(s.planner, {
    ownerOrgId: s.org, name: 'Mehra-Kapoor', city: 'Jaipur',
    startDate: '2027-02-12', endDate: '2027-02-13', guestCount: 400,
  })).id
  const venue = (await createVenue(s.planner, { ownerOrgId: s.org, name: 'Rambagh Palace' })).id
  const space = (await createSpace(s.planner, { venueId: venue, name: 'Front Lawn', legalMaxCapacity: 600 })).id
  s.event = (await scheduleEvent(s.planner, {
    projectId: s.project, name: 'Sangeet',
    startsAt: '2027-02-12T18:00:00+05:30', endsAt: '2027-02-12T22:00:00+05:30',
    setupMinutes: 60, teardownMinutes: 30, guestCount: 400, spaceId: space,
  })).id
  s.vendorA = (await createVendor(s.planner, { ownerOrgId: s.org, name: 'LensCraft', category: 'PHOTOGRAPHY' })).id
  s.vendorB = (await createVendor(s.planner, { ownerOrgId: s.org, name: 'Marigold', category: 'DECOR' })).id
  const reqA = (await addRequirement(s.planner, {
    eventId: s.event, category: 'PHOTOGRAPHY', scopeNotes: 'Full-day candid',
    arrivalAt: '2027-02-12T16:00:00+05:30', completionAt: '2027-02-12T23:00:00+05:30',
  })).id
  const reqB = (await addRequirement(s.planner, {
    eventId: s.event, category: 'DECOR', scopeNotes: 'Stage + floral',
    arrivalAt: '2027-02-12T12:00:00+05:30', completionAt: '2027-02-12T18:00:00+05:30',
  })).id
  s.bookingA = (await createBooking(s.planner, { requirementId: reqA, vendorId: s.vendorA, send: true })).id
  s.bookingB = (await createBooking(s.planner, { requirementId: reqB, vendorId: s.vendorB, send: true })).id
})

after(async () => {
  await withSystem(async (tx) => {
    // remove bookings first so the locked-ceremony delete guard lets the project go
    await tx.query(
      `delete from booking_requests br using vendor_requirements vr, events e, projects p
        where br.requirement_id = vr.id and vr.event_id = e.id and e.project_id = p.id
          and p.owner_org_id = $1`,
      [s.org],
    )
    await tx.query('delete from projects where owner_org_id = $1', [s.org])
    await tx.query('delete from venues where owner_org_id = $1', [s.org])
    await tx.query('delete from vendor_profiles where created_by_org_id = $1', [s.org])
    await tx.query('delete from organizations where id = $1', [s.org])
    await tx.query('delete from organizations where id in (select org_id from memberships where user_id = $1)', [s.vendorUser])
    await tx.query('delete from auth.users where id = any($1)', [[s.planner, s.vendorUser]])
  }).catch(() => {})
  await closePools()
})

test('before being invited, a vendor account sees nothing and cannot act', async () => {
  assert.equal((await vendorBookings(s.vendorUser)).length, 0)
  await assert.rejects(
    () => vendorRespondBooking(s.vendorUser, { bookingId: s.bookingA, accept: true }),
    (err: { code?: string }) => err.code === '42501',
  )
})

test('planner invites the vendor; the vendor claims (idempotent)', async () => {
  await inviteVendor(s.planner, { vendorId: s.vendorA, email: vendEmail })
  assert.equal(await claimVendorInvitations(s.vendorUser), 1)
  assert.equal(await claimVendorInvitations(s.vendorUser), 0) // idempotent
})

test('the vendor sees only its own booking, never the other vendor on the same ceremony', async () => {
  const bks = await vendorBookings(s.vendorUser)
  assert.equal(bks.length, 1)
  assert.equal(bks[0].booking_id, s.bookingA)
  assert.equal(bks[0].vendor_name, 'LensCraft')
  assert.equal(bks[0].category, 'PHOTOGRAPHY')
  assert.equal(bks[0].status, 'SENT')
  assert.ok(bks.every((b) => b.booking_id !== s.bookingB), 'must never see the decor vendor booking')
})

test('the vendor accepts its own booking (recorded VENDOR_SELF) but cannot touch another vendor', async () => {
  await vendorRespondBooking(s.vendorUser, { bookingId: s.bookingA, accept: true })
  assert.equal(await bookingField<string>(s.bookingA, 'status'), 'ACCEPTED')
  assert.equal(await bookingField<string>(s.bookingA, 'acceptance_source'), 'VENDOR_SELF')

  await assert.rejects(
    () => vendorRespondBooking(s.vendorUser, { bookingId: s.bookingB, accept: true }),
    (err: { code?: string }) => err.code === '42501',
  )
  assert.equal(await bookingField<string>(s.bookingB, 'status'), 'SENT') // untouched
})

test('the vendor reads ZERO rows from operational tables directly (portal function is the only path)', async () => {
  for (const table of [
    'booking_requests',
    'vendor_requirements',
    'vendor_profiles',
    'projects',
    'events',
    'audit_logs',
    'schedule_change_proposals',
  ]) {
    assert.equal(await count(s.vendorUser, table), 0, `vendor must not directly read ${table}`)
  }
})

test('the vendor acknowledges a schedule change on its own booking', async () => {
  // planner proposes moving the (now locked) ceremony -> raises an ack for booking A
  await rescheduleEvent(s.planner, {
    eventId: s.event,
    newStartsAt: '2027-02-12T19:00:00+05:30',
    newEndsAt: '2027-02-12T23:00:00+05:30',
  })
  const before = (await vendorBookings(s.vendorUser)).find((b) => b.booking_id === s.bookingA)!
  assert.ok(before.pending_ack_id, 'a pending change should surface on the vendor booking')

  await vendorAcknowledge(s.vendorUser, { ackId: before.pending_ack_id })
  const done = (await vendorBookings(s.vendorUser)).find((b) => b.booking_id === s.bookingA)!
  assert.equal(done.pending_ack_id, null, 'the change is no longer pending after acknowledgement')
})

test('the vendor uploads proof to its own ceremony and sees it back', async () => {
  const mediaId = crypto.randomUUID()
  await vendorRecordEvidence(s.vendorUser, {
    id: mediaId, eventId: s.event, storagePath: `test/${mediaId}.jpg`,
    contentType: 'image/jpeg', fileName: 'setup.jpg', byteSize: 1234,
  })
  const ev = await vendorEvidence(s.vendorUser)
  assert.ok(ev.some((m) => m.id === mediaId && m.event_id === s.event), 'vendor sees its own upload')
})

test('a vendor cannot attach evidence to a ceremony it is not booked on', async () => {
  await assert.rejects(
    () => vendorRecordEvidence(s.vendorUser, {
      id: crypto.randomUUID(), eventId: crypto.randomUUID(),
      storagePath: 'x', contentType: null, fileName: null, byteSize: null,
    }),
    (err: { code?: string }) => err.code === '42501',
  )
})

test('the planner (FULL) still sees every booking', async () => {
  assert.ok((await count(s.planner, 'booking_requests')) >= 2)
})
