// FR-541 playbook synthesis & versioning:
//   * generation compiles days → ceremonies → spaces → committed vendors
//   * each generation gets the next version number
//   * a pending schedule change marks the playbook is_draft
//   * an older version's snapshot is FROZEN — later edits never rewrite it
//   * generated playbooks are immutable (no UPDATE/DELETE for the app role)
//
// Run:  node --import tsx --test packages/db/tests/playbook.test.ts

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createClient } from '@supabase/supabase-js'
import {
  withUser, withSystem, closePools,
  onboardPlanner, createProject, createVenue, createSpace, scheduleEvent,
  createVendor, addRequirement, createBooking, transitionBooking,
  rescheduleEvent, listProposals, acknowledgeChange, finalizeProposal,
  generatePlaybook, listPlaybooks, getPlaybook,
  type PlaybookSnapshot, type PlaybookEvent,
} from '@vivahsync/db'

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

async function signUp(email: string): Promise<string> {
  const supabase = createClient(SUPA_URL, ANON, { auth: { persistSession: false } })
  const { data, error } = await supabase.auth.signUp({ email, password: `Pw-${crypto.randomUUID()}` })
  if (error) throw new Error(`signUp failed: ${error.message}`)
  return data.user!.id
}

function findEvent(snap: PlaybookSnapshot, name: string): PlaybookEvent | undefined {
  for (const d of snap.days) {
    const e = d.events.find((ev) => ev.name === name)
    if (e) return e
  }
  return undefined
}

const tag = crypto.randomUUID().slice(0, 8)
const s = { user: '', org: '', project: '', event: '', pbV1: '' }

before(async () => {
  s.user = await signUp(`pb-${tag}@example.com`)
  s.org = await onboardPlanner(s.user, { orgName: `Playbook Agency ${tag}` })
  s.project = (await createProject(s.user, {
    ownerOrgId: s.org, name: 'Mehra-Kapoor', city: 'Jaipur',
    startDate: '2026-12-05', endDate: '2026-12-09', guestCount: 400,
  })).id
  const venue = (await createVenue(s.user, { ownerOrgId: s.org, name: 'Rambagh Palace' })).id
  const space = (await createSpace(s.user, { venueId: venue, name: 'Front Lawn', legalMaxCapacity: 600 })).id
  s.event = (await scheduleEvent(s.user, {
    projectId: s.project, name: 'Sangeet',
    startsAt: '2026-12-05T18:00:00+05:30', endsAt: '2026-12-05T22:00:00+05:30',
    setupMinutes: 60, teardownMinutes: 30, guestCount: 400, spaceId: space,
  })).id
  const vendor = (await createVendor(s.user, { ownerOrgId: s.org, name: 'LensCraft', category: 'PHOTOGRAPHY' })).id
  const req = (await addRequirement(s.user, {
    eventId: s.event, category: 'PHOTOGRAPHY', scopeNotes: 'Candid + traditional',
    arrivalAt: '2026-12-05T16:00:00+05:30', completionAt: '2026-12-05T23:00:00+05:30',
  })).id
  const booking = (await createBooking(s.user, { requirementId: req, vendorId: vendor, send: true })).id
  await transitionBooking(s.user, { bookingId: booking, toStatus: 'ACCEPTED' })
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

test('generating a playbook compiles the ceremony, space, and committed vendor', async () => {
  const gen = await generatePlaybook(s.user, s.project)
  assert.equal(gen.version, 1)
  assert.equal(gen.is_draft, false)
  s.pbV1 = gen.id

  const pb = await getPlaybook(s.user, gen.id)
  assert.ok(pb)
  const ev = findEvent(pb!.snapshot, 'Sangeet')!
  assert.ok(ev, 'Sangeet should be in the playbook')
  assert.equal(ev.starts_at, '18:00')
  assert.deepEqual(ev.spaces, [{ venue: 'Rambagh Palace', space: 'Front Lawn' }])
  assert.equal(ev.vendors.length, 1)
  assert.equal(ev.vendors[0].category, 'PHOTOGRAPHY')
  assert.equal(ev.vendors[0].vendor?.name, 'LensCraft')
  assert.equal(ev.vendors[0].vendor?.status, 'ACCEPTED')
})

test('regenerating produces the next version', async () => {
  const gen = await generatePlaybook(s.user, s.project)
  assert.equal(gen.version, 2)
  const history = await listPlaybooks(s.user, s.project)
  assert.deepEqual(history.map((h) => h.version), [2, 1])
})

test('a pending schedule change marks the playbook as a draft', async () => {
  await rescheduleEvent(s.user, {
    eventId: s.event,
    newStartsAt: '2026-12-05T20:00:00+05:30',
    newEndsAt: '2026-12-05T23:30:00+05:30',
  })
  const gen = await generatePlaybook(s.user, s.project)
  assert.equal(gen.is_draft, true)
  const pb = await getPlaybook(s.user, gen.id)
  assert.equal(pb!.snapshot.pending_changes, 1)
  // original time still live in the snapshot
  assert.equal(findEvent(pb!.snapshot, 'Sangeet')!.starts_at, '18:00')
})

test('an older snapshot is frozen when the ceremony later moves', async () => {
  // apply the pending change → the event moves to 20:00
  const p = (await listProposals(s.user, s.project)).find((x) => x.status === 'PROPOSED')!
  await acknowledgeChange(s.user, p.acks[0].id)
  await finalizeProposal(s.user, p.id)

  const fresh = await generatePlaybook(s.user, s.project)
  const freshPb = await getPlaybook(s.user, fresh.id)
  assert.equal(findEvent(freshPb!.snapshot, 'Sangeet')!.starts_at, '20:00', 'new version reflects the move')

  const v1 = await getPlaybook(s.user, s.pbV1)
  assert.equal(findEvent(v1!.snapshot, 'Sangeet')!.starts_at, '18:00', 'v1 stays frozen at the original time')
})

test('generated playbooks are immutable (no update or delete for the app role)', async () => {
  await assert.rejects(
    () => withUser(s.user, (tx) => tx.query('update playbooks set version = 999 where id = $1', [s.pbV1])),
    (err: { code?: string }) => err.code === '42501',
  )
  await assert.rejects(
    () => withUser(s.user, (tx) => tx.query('delete from playbooks where id = $1', [s.pbV1])),
    (err: { code?: string }) => err.code === '42501',
  )
})
