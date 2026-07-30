// Scheduling CRUD: edit/delete ceremonies + multi-space events (FR-081 aggregate
// capacity), proved by attempting the violations:
//   * a single overloaded space is blocked, but the COMBINED capacity of two
//     spaces is accepted (multi-space)
//   * space overlap is still enforced per space
//   * a ceremony with accepted vendor commitments can't be deleted
//   * raising guest count beyond the assigned aggregate capacity is blocked
//
// Run:  node --import tsx --test packages/db/tests/scheduling-crud.test.ts

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createClient } from '@supabase/supabase-js'
import {
  withSystem, closePools,
  onboardPlanner, createProject, createVenue, createSpace,
  scheduleEvent, listEvents, editEvent, deleteEvent, setEventSpaces,
  createVendor, addRequirement, createBooking, transitionBooking,
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
const s = { user: '', org: '', project: '', lawn: '', terrace: '', edit: '', multi: '', del: '', ov1: '', ov2: '' }

before(async () => {
  s.user = await signUp(`crud-${tag}@example.com`)
  s.org = await onboardPlanner(s.user, { orgName: `CRUD Agency ${tag}` })
  s.project = (await createProject(s.user, {
    ownerOrgId: s.org, name: 'Mehra-Kapoor', city: 'Jaipur',
    startDate: '2026-12-05', endDate: '2026-12-09', guestCount: 500,
  })).id
  const venue = (await createVenue(s.user, { ownerOrgId: s.org, name: 'Rambagh Palace' })).id
  s.lawn = (await createSpace(s.user, { venueId: venue, name: 'Front Lawn', legalMaxCapacity: 300 })).id
  s.terrace = (await createSpace(s.user, { venueId: venue, name: 'Terrace', legalMaxCapacity: 200 })).id

  const mk = async (name: string, date: string, start: string, end: string, guests: number, space?: string) =>
    (await scheduleEvent(s.user, {
      projectId: s.project, name,
      startsAt: `2026-12-${date}T${start}:00+05:30`, endsAt: `2026-12-${date}T${end}:00+05:30`,
      setupMinutes: 0, teardownMinutes: 0, guestCount: guests, spaceId: space ?? null,
    })).id

  s.edit = await mk('EditMe', '07', '18:00', '22:00', 200)
  s.multi = await mk('BigNight', '06', '18:00', '22:00', 450)
  s.del = await mk('DeleteMe', '08', '18:00', '22:00', 100)
  s.ov1 = await mk('OverlapHost', '05', '18:00', '22:00', 50, s.lawn)
  s.ov2 = await mk('OverlapGuest', '05', '20:00', '23:00', 50)
})

after(async () => {
  await withSystem(async (tx) => {
    await tx.query('delete from projects where owner_org_id = $1', [s.org])
    await tx.query('delete from venues where owner_org_id = $1', [s.org])
    await tx.query('delete from vendor_profiles where created_by_org_id = $1', [s.org])
    await tx.query('delete from organizations where id = $1', [s.org])
    await tx.query('delete from auth.users where id = $1', [s.user])
  }).catch(() => {})
  await closePools()
})

test('editing ceremony details updates them', async () => {
  await editEvent(s.user, { eventId: s.edit, name: 'Sangeet Deluxe', guestCount: 220, setupMinutes: 90, teardownMinutes: 45 })
  const ev = (await listEvents(s.user, s.project)).find((e) => e.id === s.edit)!
  assert.equal(ev.name, 'Sangeet Deluxe')
  assert.equal(ev.expected_guest_count, 220)
  assert.equal(ev.setup_minutes, 90)
  assert.equal(ev.teardown_minutes, 45)
})

test('a single overloaded space is blocked; two spaces combined is accepted', async () => {
  await assert.rejects(
    () => setEventSpaces(s.user, { eventId: s.multi, spaceIds: [s.lawn] }), // 450 > 300
    (err: { code?: string }) => err.code === '23514',
  )
  await setEventSpaces(s.user, { eventId: s.multi, spaceIds: [s.lawn, s.terrace] }) // 450 <= 500
  const ev = (await listEvents(s.user, s.project)).find((e) => e.id === s.multi)!
  assert.equal(ev.spaces.length, 2)
})

test('space overlap is still enforced per space', async () => {
  await assert.rejects(
    () => setEventSpaces(s.user, { eventId: s.ov2, spaceIds: [s.lawn] }), // overlaps OverlapHost on the lawn
    (err: { code?: string }) => err.code === '23P01',
  )
})

test('a ceremony with accepted vendors cannot be deleted until they are cancelled', async () => {
  const vendor = (await createVendor(s.user, { ownerOrgId: s.org, name: 'DJ Z', category: 'MUSIC_DJ' })).id
  const req = (await addRequirement(s.user, {
    eventId: s.del, category: 'MUSIC_DJ', scopeNotes: 'Sound',
    arrivalAt: '2026-12-08T16:00:00+05:30', completionAt: '2026-12-08T22:30:00+05:30',
  })).id
  const booking = (await createBooking(s.user, { requirementId: req, vendorId: vendor, send: true })).id
  await transitionBooking(s.user, { bookingId: booking, toStatus: 'ACCEPTED' })

  await assert.rejects(
    () => deleteEvent(s.user, s.del),
    (err: { code?: string }) => err.code === '23514',
  )
  await transitionBooking(s.user, { bookingId: booking, toStatus: 'CANCELLED' })
  await deleteEvent(s.user, s.del)
  assert.equal((await listEvents(s.user, s.project)).some((e) => e.id === s.del), false)
})

test('raising guest count beyond assigned capacity is blocked', async () => {
  await setEventSpaces(s.user, { eventId: s.edit, spaceIds: [s.lawn] }) // 220 <= 300 ok
  await assert.rejects(
    () => editEvent(s.user, { eventId: s.edit, name: 'Sangeet Deluxe', guestCount: 350, setupMinutes: 90, teardownMinutes: 45 }),
    (err: { code?: string }) => err.code === '23514',
  )
  await editEvent(s.user, { eventId: s.edit, name: 'Sangeet Deluxe', guestCount: 250, setupMinutes: 90, teardownMinutes: 45 })
  const ev = (await listEvents(s.user, s.project)).find((e) => e.id === s.edit)!
  assert.equal(ev.expected_guest_count, 250)
})
