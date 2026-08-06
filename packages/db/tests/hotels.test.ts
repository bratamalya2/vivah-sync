// Hotels — room-block availability matrix, allocations, the check-in lifecycle
// (with key auto-handover), welcome-kit tracking, and cross-agency isolation.
//
// Run:  node --import tsx --test packages/db/tests/hotels.test.ts

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createClient } from '@supabase/supabase-js'
import {
  withSystem, closePools,
  onboardPlanner, createProject,
  createParty,
  createHotel, addRoomBlock, listHotelsMatrix,
  allocateRoom, listAllocations, setStayStatus, setAllocationFlags, hotelStats, listProjectParties,
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
const s = { planner: '', rival: '', org: '', rivalOrg: '', project: '', party: '', hotel: '' }

before(async () => {
  s.planner = await signUp(`htl-${tag}@example.com`)
  s.rival = await signUp(`htl-rival-${tag}@example.com`)
  s.org = await onboardPlanner(s.planner, { orgName: `Htl Agency ${tag}` })
  s.rivalOrg = await onboardPlanner(s.rival, { orgName: `Rival ${tag}` })
  s.project = (await createProject(s.planner, {
    ownerOrgId: s.org, name: 'Mehra-Kapoor', city: 'Jaipur',
    startDate: '2027-07-01', endDate: '2027-07-02', guestCount: 300,
  })).id
  s.party = (await createParty(s.planner, {
    projectId: s.project, name: 'Sharma Family', contactName: 'Anil Sharma', plusOnesAllowed: 0,
  })).id
  s.hotel = await createHotel(s.planner, { projectId: s.project, name: 'Taj Palace', address: 'MI Road', phone: '+91' })
  await addRoomBlock(s.planner, { hotelId: s.hotel, roomType: 'Deluxe', totalRooms: 10, rate: 8500 })
  await addRoomBlock(s.planner, { hotelId: s.hotel, roomType: 'Suite', totalRooms: 2, rate: 22000 })
})

after(async () => {
  await withSystem(async (tx) => {
    await tx.query('alter table public.events disable trigger user')
    await tx.query('delete from projects where owner_org_id = any($1)', [[s.org, s.rivalOrg]])
    await tx.query('alter table public.events enable trigger user')
    await tx.query('delete from organizations where id = any($1)', [[s.org, s.rivalOrg]])
    await tx.query('delete from auth.users where id = any($1)', [[s.planner, s.rival]])
  }).catch(() => {})
  await closePools()
})

test('the room-block matrix reports availability net of allocations', async () => {
  await allocateRoom(s.planner, {
    hotelId: s.hotel, partyId: s.party, roomType: 'Deluxe', roomNumber: '204',
    occupancy: 2, checkInDate: '2027-06-30', checkOutDate: '2027-07-03', notes: null,
  })
  const matrix = await listHotelsMatrix(s.planner, s.project)
  assert.equal(matrix.length, 1)
  const deluxe = matrix[0].blocks.find((b) => b.room_type === 'Deluxe')!
  assert.equal(deluxe.total_rooms, 10)
  assert.equal(deluxe.allocated, 1)
  assert.equal(deluxe.available, 9)
  const suite = matrix[0].blocks.find((b) => b.room_type === 'Suite')!
  assert.equal(suite.available, 2)
})

test('checking in a guest auto-hands the key; checking out clears it', async () => {
  const alloc = (await listAllocations(s.planner, s.project))[0]
  assert.equal(alloc.status, 'RESERVED')
  assert.equal(alloc.key_handed, false)

  await setStayStatus(s.planner, { id: alloc.id, status: 'CHECKED_IN' })
  let a = (await listAllocations(s.planner, s.project))[0]
  assert.equal(a.status, 'CHECKED_IN')
  assert.equal(a.key_handed, true)

  await setStayStatus(s.planner, { id: alloc.id, status: 'CHECKED_OUT' })
  a = (await listAllocations(s.planner, s.project))[0]
  assert.equal(a.status, 'CHECKED_OUT')
  assert.equal(a.key_handed, false)
})

test('welcome-kit flag flips and the stats reflect in-house + kits pending', async () => {
  const alloc = (await listAllocations(s.planner, s.project))[0]
  await setStayStatus(s.planner, { id: alloc.id, status: 'CHECKED_IN' })
  let stats = await hotelStats(s.planner, s.project)
  assert.equal(stats.hotels, 1)
  assert.equal(stats.roomsBlocked, 12)
  assert.equal(stats.roomsAllocated, 1)
  assert.equal(stats.inHouse, 1)
  assert.equal(stats.kitsPending, 1)

  await setAllocationFlags(s.planner, { id: alloc.id, welcomeKit: true })
  stats = await hotelStats(s.planner, s.project)
  assert.equal(stats.kitsPending, 0)
})

test('a rival planner sees no hotels or allocations', async () => {
  assert.equal((await listHotelsMatrix(s.rival, s.project)).length, 0)
  assert.equal((await listAllocations(s.rival, s.project)).length, 0)
  assert.equal((await listProjectParties(s.rival, s.project)).length, 0)
})
