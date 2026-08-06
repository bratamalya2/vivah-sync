// Guest travel — manifest listing, pickup-window bucketing, fleet dispatch,
// manual delay status, and cross-agency isolation.
//
// Run:  node --import tsx --test packages/db/tests/travel.test.ts

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createClient } from '@supabase/supabase-js'
import {
  withSystem, closePools,
  onboardPlanner, createProject,
  createParty,
  listProjectTravel, addTravel, updateTravelStatus, setDispatch, deleteTravel,
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
const s = { planner: '', rival: '', org: '', rivalOrg: '', project: '', party: '' }

before(async () => {
  s.planner = await signUp(`tvl-${tag}@example.com`)
  s.rival = await signUp(`tvl-rival-${tag}@example.com`)
  s.org = await onboardPlanner(s.planner, { orgName: `Tvl Agency ${tag}` })
  s.rivalOrg = await onboardPlanner(s.rival, { orgName: `Rival ${tag}` })
  s.project = (await createProject(s.planner, {
    ownerOrgId: s.org, name: 'Mehra-Kapoor', city: 'Jaipur',
    startDate: '2027-07-01', endDate: '2027-07-02', guestCount: 300,
  })).id
  s.party = (await createParty(s.planner, {
    projectId: s.project, name: 'Sharma Family', contactName: 'Anil Sharma', plusOnesAllowed: 0,
  })).id
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

test('two arrivals in the same half-hour to one hotel share a pickup window', async () => {
  await addTravel(s.planner, {
    partyId: s.party, direction: 'ARRIVAL', mode: 'FLIGHT', carrierNumber: '6E-203',
    scheduledAt: '2027-06-30T14:05:00+05:30', location: 'T2 DEL', hotel: 'Taj Palace', headcount: 3,
  })
  await addTravel(s.planner, {
    partyId: s.party, direction: 'ARRIVAL', mode: 'TRAIN', carrierNumber: '12951',
    scheduledAt: '2027-06-30T14:25:00+05:30', location: 'Jaipur Jn', hotel: 'Taj Palace', headcount: 2,
  })
  await addTravel(s.planner, {
    partyId: s.party, direction: 'DEPARTURE', mode: 'FLIGHT', carrierNumber: 'AI-865',
    scheduledAt: '2027-07-03T09:00:00+05:30', location: 'JAI', hotel: null, headcount: 5,
  })

  const legs = await listProjectTravel(s.planner, s.project)
  assert.equal(legs.length, 3)
  const arrivals = legs.filter((l) => l.direction === 'ARRIVAL')
  assert.equal(arrivals.length, 2)
  // both 14:05 and 14:25 fall in the 14:00 half-hour bucket → identical window label
  assert.equal(arrivals[0].window, arrivals[1].window)
  assert.ok(arrivals.every((a) => a.hotel === 'Taj Palace'))
})

test('a leg can be dispatched and manually flagged delayed', async () => {
  const leg = (await listProjectTravel(s.planner, s.project)).find((l) => l.carrier_number === '6E-203')!
  await setDispatch(s.planner, { id: leg.id, driverName: 'Ramesh', driverPhone: '+91 90000 00000', vehicle: 'Innova RJ14' })
  await updateTravelStatus(s.planner, { id: leg.id, status: 'DELAYED', delayNote: 'Fog — ETA +45m' })

  const after = (await listProjectTravel(s.planner, s.project)).find((l) => l.id === leg.id)!
  assert.equal(after.driver_name, 'Ramesh')
  assert.equal(after.vehicle, 'Innova RJ14')
  assert.equal(after.status, 'DELAYED')
  assert.equal(after.delay_note, 'Fog — ETA +45m')
})

test('a rival planner sees no travel and cannot delete a leg', async () => {
  assert.equal((await listProjectTravel(s.rival, s.project)).length, 0)
  const leg = (await listProjectTravel(s.planner, s.project))[0]
  await deleteTravel(s.rival, leg.id) // RLS: no row matches → no-op
  assert.ok((await listProjectTravel(s.planner, s.project)).some((l) => l.id === leg.id))
})
