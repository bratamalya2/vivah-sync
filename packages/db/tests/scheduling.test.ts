// The headline guarantee, proved by ATTEMPTING the violations against the real
// database: a space cannot be double-booked, a ceremony cannot exceed a space's
// legal max, and a ceremony cannot fall outside its project's timeline.
//
// Also asserts space_bookings.period is a STORED GENERATED column — the exact
// thing that was silently broken in Project-Overview §7 (an EXCLUDE over a NULL
// range never conflicts). Structure check + behaviour check, both.
//
// Run:  node --import tsx --test packages/db/tests/scheduling.test.ts

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createClient } from '@supabase/supabase-js'
import {
  withSystem,
  closePools,
  onboardPlanner,
  createProject,
  createVenue,
  createSpace,
  scheduleEvent,
  listDays,
  listEvents,
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
const s = { user: '', org: '', project: '', space: '', venue: '' }

before(async () => {
  s.user = await signUp(`sched-${tag}@example.com`)
  s.org = await onboardPlanner(s.user, { orgName: `Sched Agency ${tag}`, email: `sched-${tag}@example.com` })
  s.project = (
    await createProject(s.user, {
      ownerOrgId: s.org,
      name: 'Mehra-Kapoor',
      city: 'Jaipur',
      startDate: '2026-12-05',
      endDate: '2026-12-09',
      guestCount: 400,
    })
  ).id
  s.venue = (await createVenue(s.user, { ownerOrgId: s.org, name: 'Rambagh Palace' })).id
  s.space = (
    await createSpace(s.user, { venueId: s.venue, name: 'Front Lawn', legalMaxCapacity: 500 })
  ).id
})

after(async () => {
  await withSystem(async (tx) => {
    await tx.query('delete from projects where owner_org_id = $1', [s.org])
    await tx.query('delete from venues where owner_org_id = $1', [s.org])
    await tx.query('delete from organizations where id = $1', [s.org])
    await tx.query('delete from auth.users where id = $1', [s.user])
  }).catch(() => {})
  await closePools()
})

test('space_bookings.period is a STORED GENERATED column (not a silent NULL)', async () => {
  const r = await withSystem((tx) =>
    tx.query<{ attgenerated: string }>(
      `select attgenerated from pg_attribute
        where attrelid = 'public.space_bookings'::regclass and attname = 'period'`,
    ),
  )
  assert.equal(r.rows[0].attgenerated, 's', 'period must be STORED GENERATED')
})

test('the project auto-generated its 5-day structure', async () => {
  const days = await listDays(s.user, s.project)
  assert.equal(days.length, 5)
  assert.equal(days[0].day_date, '2026-12-05')
  assert.equal(days[4].day_date, '2026-12-09')
  assert.deepEqual(days.map((d) => d.day_index), [0, 1, 2, 3, 4])
})

test('a ceremony can be booked into a space (happy path)', async () => {
  await scheduleEvent(s.user, {
    projectId: s.project,
    name: 'Sangeet',
    startsAt: '2026-12-05T17:00:00+05:30',
    endsAt: '2026-12-05T21:00:00+05:30',
    setupMinutes: 60,
    teardownMinutes: 30,
    guestCount: 400,
    spaceId: s.space,
  })
  const events = await listEvents(s.user, s.project)
  const sangeet = events.find((e) => e.name === 'Sangeet')
  assert.ok(sangeet)
  assert.equal(sangeet!.spaces[0].space, 'Front Lawn')
})

test('DOUBLE-BOOKING the same space at an overlapping time is physically blocked', async () => {
  await assert.rejects(
    () =>
      scheduleEvent(s.user, {
        projectId: s.project,
        name: 'Reception (clashing)',
        startsAt: '2026-12-05T20:00:00+05:30', // overlaps 16:00–21:30 window above
        endsAt: '2026-12-05T22:00:00+05:30',
        setupMinutes: 0,
        teardownMinutes: 0,
        spaceId: s.space,
      }),
    (err: { code?: string }) => {
      assert.equal(err.code, '23P01')
      assert.equal(translateDbError(err)?.message.includes('already booked'), true)
      return true
    },
  )
  // the clashing event must NOT have been created (atomic rollback)
  const events = await listEvents(s.user, s.project)
  assert.equal(events.filter((e) => e.name === 'Reception (clashing)').length, 0)
})

test('the SAME space can be reused earlier the same day (no overlap)', async () => {
  await scheduleEvent(s.user, {
    projectId: s.project,
    name: 'Haldi',
    startsAt: '2026-12-05T08:00:00+05:30',
    endsAt: '2026-12-05T11:00:00+05:30',
    setupMinutes: 0,
    teardownMinutes: 0,
    guestCount: 150,
    spaceId: s.space,
  })
  const events = await listEvents(s.user, s.project)
  assert.ok(events.find((e) => e.name === 'Haldi'))
})

test('guest count over the space legal maximum is blocked', async () => {
  await assert.rejects(
    () =>
      scheduleEvent(s.user, {
        projectId: s.project,
        name: 'Oversized',
        startsAt: '2026-12-07T18:00:00+05:30',
        endsAt: '2026-12-07T22:00:00+05:30',
        setupMinutes: 0,
        teardownMinutes: 0,
        guestCount: 600, // > legal max 500
        spaceId: s.space,
      }),
    (err: { code?: string }) => {
      assert.equal(err.code, '23514')
      assert.match(translateDbError(err)?.message ?? '', /legal maximum/)
      return true
    },
  )
})

test('a ceremony outside the project timeline is blocked', async () => {
  await assert.rejects(
    () =>
      scheduleEvent(s.user, {
        projectId: s.project,
        name: 'Way too late',
        startsAt: '2026-12-20T18:00:00+05:30', // project ends 2026-12-09
        endsAt: '2026-12-20T22:00:00+05:30',
        setupMinutes: 0,
        teardownMinutes: 0,
        spaceId: s.space,
      }),
    (err: { code?: string }) => {
      assert.equal(err.code, '23514')
      assert.match(translateDbError(err)?.message ?? '', /outside the project timeline/)
      return true
    },
  )
})
