// Broadcast audience resolution + stub send + message log, and the public
// token-scoped digital itinerary.
//
// Run:  node --import tsx --test packages/db/tests/broadcasts.test.ts

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createClient } from '@supabase/supabase-js'
import {
  withSystem, closePools,
  onboardPlanner, createProject, scheduleEvent,
  createParty, submitRsvp, loadRsvp, addTravel,
  createHotel, allocateRoom,
  sendBroadcast, listBroadcasts, audienceCounts, loadItinerary,
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
const s = { planner: '', org: '', project: '', wedding: '', tokenA: '', tokenB: '', partyA: '', partyB: '', hotel: '' }

before(async () => {
  s.planner = await signUp(`bc-${tag}@example.com`)
  s.org = await onboardPlanner(s.planner, { orgName: `BC Agency ${tag}` })
  s.project = (await createProject(s.planner, {
    ownerOrgId: s.org, name: 'Mehra-Kapoor', city: 'Jaipur',
    startDate: '2027-07-01', endDate: '2027-07-02', guestCount: 300,
  })).id
  s.wedding = (await scheduleEvent(s.planner, {
    projectId: s.project, name: 'Wedding',
    startsAt: '2027-07-02T11:00:00+05:30', endsAt: '2027-07-02T14:00:00+05:30',
    setupMinutes: 60, teardownMinutes: 30, guestCount: 300,
  })).id
  const a = await createParty(s.planner, { projectId: s.project, name: 'Sharma Family', contactName: 'Anil', plusOnesAllowed: 0 })
  const b = await createParty(s.planner, { projectId: s.project, name: 'Gupta Family', contactName: 'Bina', plusOnesAllowed: 0 })
  s.tokenA = a.token; s.partyA = a.id
  s.tokenB = b.token; s.partyB = b.id
  s.hotel = await createHotel(s.planner, { projectId: s.project, name: 'Taj Palace', address: null, phone: null })

  // Party A responds YES and is arriving + has a room. Party B stays pending.
  const rsvp = (await loadRsvp(s.tokenA))!
  await submitRsvp(s.tokenA, [
    { id: rsvp.guests[0].id, name: 'Anil', isChild: false, isPlusOne: false, dietary: null, assistance: null,
      rsvps: [{ eventId: s.wedding, status: 'YES' }] },
  ])
  await addTravel(s.planner, {
    partyId: s.partyA, direction: 'ARRIVAL', mode: 'FLIGHT', carrierNumber: '6E-1',
    scheduledAt: '2027-07-01T10:00:00+05:30', location: 'DEL', hotel: 'Taj Palace', headcount: 2,
  })
  await allocateRoom(s.planner, {
    hotelId: s.hotel, partyId: s.partyA, roomType: 'Deluxe', roomNumber: '204',
    occupancy: 2, checkInDate: '2027-07-01', checkOutDate: '2027-07-03', notes: null,
  })
})

after(async () => {
  await withSystem(async (tx) => {
    await tx.query('alter table public.events disable trigger user')
    await tx.query('delete from projects where owner_org_id = $1', [s.org])
    await tx.query('alter table public.events enable trigger user')
    await tx.query('delete from organizations where id = $1', [s.org])
    await tx.query('delete from auth.users where id = $1', [s.planner])
  }).catch(() => {})
  await closePools()
})

test('audience segments resolve to the right parties', async () => {
  const c = await audienceCounts(s.planner, s.project)
  assert.equal(c.ALL, 2)
  assert.equal(c.PENDING_RSVP, 1) // only Gupta
  assert.equal(c.ATTENDING, 1) // only Sharma
  assert.equal(c.ARRIVING, 1) // only Sharma
})

test('a broadcast records recipients and shows in the log', async () => {
  const res = await sendBroadcast(s.planner, {
    projectId: s.project, channel: 'WHATSAPP', audience: 'PENDING_RSVP',
    subject: 'Reminder', body: 'Please RSVP by Friday.',
  })
  assert.equal(res.recipients, 1)
  const log = await listBroadcasts(s.planner, s.project)
  assert.equal(log.length, 1)
  assert.equal(log[0].recipients, 1)
  assert.equal(log[0].state, 'SENT')
  assert.deepEqual(log[0].names, ['Gupta Family'])
})

test('the digital itinerary reflects the party events, travel and room', async () => {
  const it = (await loadItinerary(s.tokenA))!
  assert.ok(it)
  assert.equal(it.party.name, 'Sharma Family')
  assert.equal(it.project.name, 'Mehra-Kapoor')
  const wed = it.events.find((e) => e.name === 'Wedding')!
  assert.equal(wed.status, 'YES')
  assert.equal(it.travel.length, 1)
  assert.equal(it.travel[0].carrier_number, '6E-1')
  assert.equal(it.rooms.length, 1)
  assert.equal(it.rooms[0].room_number, '204')
})

test('an invalid itinerary token returns null', async () => {
  assert.equal(await loadItinerary('not-a-token'), null)
  assert.equal(await loadItinerary('00000000-0000-0000-0000-000000000000'), null)
})
