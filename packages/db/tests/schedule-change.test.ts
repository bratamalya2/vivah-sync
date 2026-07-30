// FR-261 schedule-change protocol, proved by attempting the violations:
//   * a ceremony with NO locked commitments reschedules directly
//   * a ceremony WITH a locked (accepted) commitment cannot be edited directly —
//     the DB blocks it and a proposal is raised instead, leaving the original
//     time live
//   * a proposal cannot be applied until every impacted vendor acknowledges
//   * once all acknowledge, applying it moves the ceremony
//
// Run:  node --import tsx --test packages/db/tests/schedule-change.test.ts

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createClient } from '@supabase/supabase-js'
import {
  withSystem, closePools,
  onboardPlanner, createProject, scheduleEvent, listEvents,
  createVendor, addRequirement, createBooking, transitionBooking,
  rescheduleEvent, listProposals, acknowledgeChange, finalizeProposal,
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
const s = { user: '', org: '', project: '', locked: '', free: '', vendor: '', req: '', booking: '' }

before(async () => {
  s.user = await signUp(`chg-${tag}@example.com`)
  s.org = await onboardPlanner(s.user, { orgName: `Change Agency ${tag}` })
  s.project = (await createProject(s.user, {
    ownerOrgId: s.org, name: 'Nair-Menon', city: 'Kochi',
    startDate: '2026-12-05', endDate: '2026-12-09', guestCount: 200,
  })).id
  s.locked = (await scheduleEvent(s.user, {
    projectId: s.project, name: 'Sangeet',
    startsAt: '2026-12-05T18:00:00+05:30', endsAt: '2026-12-05T22:00:00+05:30',
    setupMinutes: 0, teardownMinutes: 0,
  })).id
  s.free = (await scheduleEvent(s.user, {
    projectId: s.project, name: 'Haldi',
    startsAt: '2026-12-05T08:00:00+05:30', endsAt: '2026-12-05T11:00:00+05:30',
    setupMinutes: 0, teardownMinutes: 0,
  })).id
  s.vendor = (await createVendor(s.user, { ownerOrgId: s.org, name: 'DJ Volt', category: 'MUSIC_DJ' })).id
  s.req = (await addRequirement(s.user, {
    eventId: s.locked, category: 'MUSIC_DJ', scopeNotes: 'Sound + DJ',
    arrivalAt: '2026-12-05T17:00:00+05:30', completionAt: '2026-12-05T22:30:00+05:30',
  })).id
  s.booking = (await createBooking(s.user, { requirementId: s.req, vendorId: s.vendor, send: true })).id
  await transitionBooking(s.user, { bookingId: s.booking, toStatus: 'ACCEPTED' }) // locks the ceremony
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

test('a ceremony with no locked commitments reschedules directly', async () => {
  const r = await rescheduleEvent(s.user, {
    eventId: s.free,
    newStartsAt: '2026-12-06T09:00:00+05:30',
    newEndsAt: '2026-12-06T12:00:00+05:30',
  })
  assert.equal(r.applied, true)
  assert.equal(r.impacted, 0)
  const haldi = (await listEvents(s.user, s.project)).find((e) => e.name === 'Haldi')!
  assert.equal(haldi.starts_at, '2026-12-06 09:00')
})

test('rescheduling a locked ceremony raises a proposal and leaves the time live', async () => {
  const r = await rescheduleEvent(s.user, {
    eventId: s.locked,
    newStartsAt: '2026-12-06T18:00:00+05:30',
    newEndsAt: '2026-12-06T22:00:00+05:30',
  })
  assert.equal(r.applied, false)
  assert.equal(r.impacted, 1)

  const sangeet = (await listEvents(s.user, s.project)).find((e) => e.name === 'Sangeet')!
  assert.equal(sangeet.starts_at, '2026-12-05 18:00', 'original time must stay live')

  const proposals = await listProposals(s.user, s.project)
  const p = proposals.find((x) => x.status === 'PROPOSED')!
  assert.ok(p)
  assert.equal(p.acks.length, 1)
  assert.equal(p.acks[0].acknowledged, false)
  assert.equal(p.acks[0].vendor_name, 'DJ Volt')
})

test('a direct edit of a locked ceremony is blocked at the database', async () => {
  await assert.rejects(
    () => withSystem((tx) =>
      tx.query(`update events set starts_at = starts_at + interval '1 hour' where id = $1`, [s.locked]),
    ),
    (err: { code?: string }) => {
      assert.equal(err.code, '23514')
      assert.match(translateDbError(err)?.message ?? '', /locked vendor commitments/)
      return true
    },
  )
})

test('the proposal cannot be applied until the vendor acknowledges', async () => {
  const p = (await listProposals(s.user, s.project)).find((x) => x.status === 'PROPOSED')!
  await assert.rejects(
    () => finalizeProposal(s.user, p.id),
    (err: { code?: string }) => {
      assert.equal(err.code, '23514')
      assert.match(translateDbError(err)?.message ?? '', /must acknowledge/)
      return true
    },
  )
})

test('once acknowledged, applying the proposal moves the ceremony', async () => {
  const p = (await listProposals(s.user, s.project)).find((x) => x.status === 'PROPOSED')!
  await acknowledgeChange(s.user, p.acks[0].id)
  await finalizeProposal(s.user, p.id)

  const sangeet = (await listEvents(s.user, s.project)).find((e) => e.name === 'Sangeet')!
  assert.equal(sangeet.starts_at, '2026-12-06 18:00', 'ceremony should now be at the proposed time')

  const applied = (await listProposals(s.user, s.project)).find((x) => x.id === p.id)!
  assert.equal(applied.status, 'APPLIED')
})
