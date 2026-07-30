// FR-061 venue rule exceptions + audit trail, proved by attempting the violation:
//   * an override without a documented rationale is refused
//   * a valid override is recorded AND written to the append-only audit_logs
//   * a competing agency sees neither the override nor the audit trail
//
// Run:  node --import tsx --test packages/db/tests/venue-rules.test.ts

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createClient } from '@supabase/supabase-js'
import {
  withSystem, closePools,
  onboardPlanner, createProject, scheduleEvent,
  addVenueOverride, listProjectOverrides, listAuditLog,
  generatePlaybook, getPlaybook,
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
const s = { user: '', other: '', org: '', project: '', event: '' }

before(async () => {
  s.user = await signUp(`vr-${tag}@example.com`)
  s.other = await signUp(`vr-other-${tag}@example.com`)
  s.org = await onboardPlanner(s.user, { orgName: `Venue Rule Agency ${tag}`, fullName: 'Priya P' })
  await onboardPlanner(s.other, { orgName: `Rival ${tag}` })
  s.project = (await createProject(s.user, {
    ownerOrgId: s.org, name: 'Khanna-Bose', city: 'Delhi',
    startDate: '2026-12-05', endDate: '2026-12-06', guestCount: 250,
  })).id
  s.event = (await scheduleEvent(s.user, {
    projectId: s.project, name: 'Reception',
    startsAt: '2026-12-05T20:00:00+05:30', endsAt: '2026-12-05T23:00:00+05:30',
    setupMinutes: 0, teardownMinutes: 0,
  })).id
})

after(async () => {
  await withSystem(async (tx) => {
    await tx.query('delete from projects where owner_org_id = $1', [s.org])
    await tx.query('delete from organizations where id = $1', [s.org])
    await tx.query('delete from organizations where name = $1', [`Rival ${tag}`])
    await tx.query('delete from auth.users where id = any($1)', [[s.user, s.other]])
  }).catch(() => {})
  await closePools()
})

test('an override without a rationale is refused', async () => {
  await assert.rejects(
    () =>
      addVenueOverride(s.user, {
        eventId: s.event, ruleKey: 'ACCESS_CLOSE', overrideValue: '02:00', rationale: '   ',
      }),
    (err: { code?: string }) => {
      assert.equal(err.code, '23514')
      assert.match(translateDbError(err)?.message ?? '', /documented rationale is required/)
      return true
    },
  )
})

test('a documented override is recorded and audited', async () => {
  await addVenueOverride(s.user, {
    eventId: s.event,
    ruleKey: 'ACCESS_CLOSE',
    overrideValue: '02:00',
    rationale: 'Client paid for extended access; venue manager approved by email.',
  })

  const overrides = await listProjectOverrides(s.user, s.project)
  assert.equal(overrides.length, 1)
  assert.equal(overrides[0].rule_key, 'ACCESS_CLOSE')
  assert.equal(overrides[0].override_value, '02:00')

  const audit = await listAuditLog(s.user, s.project)
  const entry = audit.find((a) => a.action === 'VENUE_RULE_OVERRIDE')
  assert.ok(entry, 'the override must appear in the audit log')
  assert.equal(entry!.entity_type, 'event')
  assert.equal(entry!.actor_name, 'Priya P')
  assert.match(String(entry!.detail?.rationale ?? ''), /extended access/)
})

test('a competing agency sees neither the override nor the audit trail', async () => {
  assert.equal((await listProjectOverrides(s.other, s.project)).length, 0)
  assert.equal((await listAuditLog(s.other, s.project)).length, 0)
})

test('the exception appears in a generated playbook (event-day visibility)', async () => {
  const gen = await generatePlaybook(s.user, s.project)
  const pb = await getPlaybook(s.user, gen.id)
  const ev = pb!.snapshot.days.flatMap((d) => d.events).find((e) => e.name === 'Reception')!
  assert.ok(ev)
  assert.equal(ev.overrides.length, 1)
  assert.equal(ev.overrides[0].rule_key, 'ACCESS_CLOSE')
  assert.equal(ev.overrides[0].value, '02:00')
})
