// Guest hospitality — party invites, the public token-scoped RSVP, planner
// stats, plus-one caps, and cross-agency isolation.
//
// Run:  node --import tsx --test packages/db/tests/guests.test.ts

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createClient } from '@supabase/supabase-js'
import {
  withSystem, closePools,
  onboardPlanner, createProject, scheduleEvent,
  createParty, loadRsvp, submitRsvp, getParty, guestStats, listProjectParties,
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
const s = { planner: '', rival: '', org: '', rivalOrg: '', project: '', token: '', sangeet: '', wedding: '' }

before(async () => {
  s.planner = await signUp(`gst-${tag}@example.com`)
  s.rival = await signUp(`gst-rival-${tag}@example.com`)
  s.org = await onboardPlanner(s.planner, { orgName: `Gst Agency ${tag}` })
  s.rivalOrg = await onboardPlanner(s.rival, { orgName: `Rival ${tag}` })
  s.project = (await createProject(s.planner, {
    ownerOrgId: s.org, name: 'Mehra-Kapoor', city: 'Jaipur',
    startDate: '2027-07-01', endDate: '2027-07-02', guestCount: 300,
  })).id
  s.sangeet = (await scheduleEvent(s.planner, {
    projectId: s.project, name: 'Sangeet',
    startsAt: '2027-07-01T19:00:00+05:30', endsAt: '2027-07-01T23:00:00+05:30',
    setupMinutes: 60, teardownMinutes: 30, guestCount: 300,
  })).id
  s.wedding = (await scheduleEvent(s.planner, {
    projectId: s.project, name: 'Wedding',
    startsAt: '2027-07-02T11:00:00+05:30', endsAt: '2027-07-02T14:00:00+05:30',
    setupMinutes: 60, teardownMinutes: 30, guestCount: 300,
  })).id
  s.token = (await createParty(s.planner, {
    projectId: s.project, name: 'Sharma Family', contactName: 'Anil Sharma', plusOnesAllowed: 2,
  })).token
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

test('a new party is auto-invited to every ceremony with a primary guest', async () => {
  const rsvp = await loadRsvp(s.token)
  assert.ok(rsvp)
  assert.equal(rsvp!.party.name, 'Sharma Family')
  assert.equal(rsvp!.events.length, 2) // Sangeet + Wedding
  assert.equal(rsvp!.guests.length, 1) // the contact
  assert.equal(rsvp!.party.submitted, false)
})

test('the household RSVPs per sub-event, adds a plus-one, and captures metadata', async () => {
  const rsvp = (await loadRsvp(s.token))!
  const anil = rsvp.guests[0].id
  const ev = (n: string) => rsvp.events.find((e) => e.name === n)!.id
  const res = await submitRsvp(s.token, [
    {
      id: anil, name: 'Anil Sharma', isChild: false, isPlusOne: false, dietary: 'Jain', assistance: null,
      rsvps: [{ eventId: ev('Sangeet'), status: 'YES' }, { eventId: ev('Wedding'), status: 'YES' }],
    },
    {
      id: null, name: 'Priya (guest)', isChild: false, isPlusOne: true, dietary: null, assistance: 'Wheelchair access',
      rsvps: [{ eventId: ev('Sangeet'), status: 'YES' }, { eventId: ev('Wedding'), status: 'NO' }],
    },
  ])
  assert.deepEqual(res, { ok: true })

  const after = (await loadRsvp(s.token))!
  assert.equal(after.party.submitted, true)
  assert.equal(after.guests.length, 2)
  const sangeetYes = after.rsvps.filter((r) => r.event_id === ev('Sangeet') && r.status === 'YES').length
  assert.equal(sangeetYes, 2)
})

test('the planner sees RSVP stats — heads, dietary, assistance', async () => {
  const stats = await guestStats(s.planner, s.project)
  assert.equal(stats.guests, 2)
  assert.equal(stats.submitted, 1)
  assert.equal(stats.attendingHeads, 2)
  const sangeet = stats.perEvent.find((e) => e.name === 'Sangeet')!
  assert.equal(sangeet.yes, 2)
  const wedding = stats.perEvent.find((e) => e.name === 'Wedding')!
  assert.equal(wedding.yes, 1)
  assert.equal(wedding.no, 1)
  assert.ok(stats.dietary.some((d) => d.note === 'Jain'))
  assert.ok(stats.assistance.some((a) => /Wheelchair/.test(a.note)))
})

test('adding more plus-ones than approved is refused', async () => {
  const res = await submitRsvp(s.token, [
    { id: null, name: 'X', isChild: false, isPlusOne: true, dietary: null, assistance: null, rsvps: [] },
    { id: null, name: 'Y', isChild: false, isPlusOne: true, dietary: null, assistance: null, rsvps: [] },
    { id: null, name: 'Z', isChild: false, isPlusOne: true, dietary: null, assistance: null, rsvps: [] },
  ])
  assert.equal(res.ok, false)
})

test('an invalid token and a rival planner both get nothing', async () => {
  assert.equal(await loadRsvp('not-a-token'), null)
  assert.equal(await loadRsvp('00000000-0000-0000-0000-000000000000'), null)
  assert.equal((await listProjectParties(s.rival, s.project)).length, 0)
})
