// BR-581 evidence media — a real Supabase Storage round-trip plus the worker's
// 180-day TTL sweep:
//   * upload to Storage + record a row; the signed URL serves the exact bytes
//   * family (READ_ONLY) and a competing agency see NO evidence
//   * the sweep permanently purges expired media, EXCEPT items on legal hold
//
// Run:  node --import tsx --test packages/db/tests/evidence.test.ts

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createClient } from '@supabase/supabase-js'
import {
  withUser, withSystem, closePools,
  onboardPlanner, createProject, scheduleEvent,
  recordEvidence, listProjectEvidence, getEvidenceStoragePath,
  inviteFamily, claimFamilyInvitations,
} from '@vivahsync/db'
import {
  ensureEvidenceBucket, uploadEvidence, signedEvidenceUrl, deleteEvidenceObject,
} from '@vivahsync/db/storage'
import { sweepExpiredMedia } from '@vivahsync/db/jobs'

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
async function signUp(email: string): Promise<string> {
  const supabase = createClient(SUPA_URL, ANON, { auth: { persistSession: false } })
  const { data, error } = await supabase.auth.signUp({ email, password: `Pw-${crypto.randomUUID()}` })
  if (error) throw new Error(`signUp failed: ${error.message}`)
  return data.user!.id
}

const tag = crypto.randomUUID().slice(0, 8)
const famEmail = `ev-fam-${tag}@example.com`
const s = {
  planner: '', family: '', other: '', org: '', project: '', event: '',
  recent: '', expired: '', held: '',
  paths: [] as string[],
}

// insert a media row directly with a chosen age (bypasses RLS + created_at default)
async function seedRow(mediaId: string, path: string, ageDays: number, hold: boolean) {
  await withSystem((tx) =>
    tx.query(
      `insert into evidence_media
         (id, project_id, entity_type, entity_id, uploader_user_id, storage_path,
          content_type, file_name, byte_size, legal_hold, created_at)
       values ($1,$2,'event',$3,$4,$5,'text/plain',$6,5,$7, now() - ($8 || ' days')::interval)`,
      [mediaId, s.project, s.event, s.planner, path, `${mediaId}.txt`, hold, String(ageDays)],
    ),
  )
}

before(async () => {
  s.planner = await signUp(`ev-plan-${tag}@example.com`)
  s.family = await signUp(famEmail)
  s.other = await signUp(`ev-other-${tag}@example.com`)
  s.org = await onboardPlanner(s.planner, { orgName: `Evidence Agency ${tag}` })
  await onboardPlanner(s.other, { orgName: `Rival ${tag}` })
  s.project = (await createProject(s.planner, {
    ownerOrgId: s.org, name: 'Mehra-Kapoor', city: 'Jaipur',
    startDate: '2026-12-05', endDate: '2026-12-06', guestCount: 400,
  })).id
  s.event = (await scheduleEvent(s.planner, {
    projectId: s.project, name: 'Sangeet',
    startsAt: '2026-12-05T18:00:00+05:30', endsAt: '2026-12-05T22:00:00+05:30',
    setupMinutes: 0, teardownMinutes: 0,
  })).id
  await ensureEvidenceBucket()

  // a real upload + record (recent)
  s.recent = crypto.randomUUID()
  const recentPath = `${s.project}/${s.recent}.txt`
  s.paths.push(recentPath)
  await uploadEvidence(recentPath, Buffer.from('proof-of-stage'), 'text/plain')
  await recordEvidence(s.planner, {
    id: s.recent, projectId: s.project, entityType: 'event', entityId: s.event,
    storagePath: recentPath, contentType: 'text/plain', fileName: 'stage.txt', byteSize: 14,
  })

  // an expired one and a legal-held one, aged 200 days
  s.expired = crypto.randomUUID()
  const expPath = `${s.project}/${s.expired}.txt`
  s.paths.push(expPath)
  await uploadEvidence(expPath, Buffer.from('old'), 'text/plain')
  await seedRow(s.expired, expPath, 200, false)

  s.held = crypto.randomUUID()
  const heldPath = `${s.project}/${s.held}.txt`
  s.paths.push(heldPath)
  await uploadEvidence(heldPath, Buffer.from('disputed'), 'text/plain')
  await seedRow(s.held, heldPath, 200, true)
})

after(async () => {
  for (const p of s.paths) await deleteEvidenceObject(p).catch(() => {})
  await withSystem(async (tx) => {
    await tx.query('delete from projects where owner_org_id = $1', [s.org])
    await tx.query('delete from organizations where id = $1', [s.org])
    await tx.query('delete from organizations where name = $1', [`Rival ${tag}`])
    await tx.query('delete from organizations where id in (select org_id from memberships where user_id = $1)', [s.family])
    await tx.query('delete from auth.users where id = any($1)', [[s.planner, s.family, s.other]])
  }).catch(() => {})
  await closePools()
})

test('upload + record, and the signed URL serves the exact bytes', async () => {
  const list = await listProjectEvidence(s.planner, s.project)
  const rec = list.find((m) => m.id === s.recent)
  assert.ok(rec, 'the uploaded evidence should be listed')
  assert.equal(rec!.file_name, 'stage.txt')

  const path = await getEvidenceStoragePath(s.planner, s.recent)
  assert.ok(path)
  const url = await signedEvidenceUrl(path!, 60)
  assert.ok(url, 'a signed URL should be issued')
  const body = await (await fetch(url!)).text()
  assert.equal(body, 'proof-of-stage')
})

test('family and a competing agency see no evidence', async () => {
  await inviteFamily(s.planner, { projectId: s.project, email: famEmail })
  await claimFamilyInvitations(s.family)

  assert.equal((await listProjectEvidence(s.family, s.project)).length, 0)
  assert.equal(await getEvidenceStoragePath(s.family, s.recent), null)
  assert.equal((await listProjectEvidence(s.other, s.project)).length, 0)
})

test('the TTL sweep purges expired media but spares legal holds', async () => {
  await sweepExpiredMedia()

  const ids = (await listProjectEvidence(s.planner, s.project)).map((m) => m.id)
  assert.ok(ids.includes(s.recent), 'recent media survives')
  assert.ok(ids.includes(s.held), 'legal-held media survives despite being 200 days old')
  assert.ok(!ids.includes(s.expired), 'expired, un-held media is purged')

  // the expired row is really gone at the DB level
  const gone = await withSystem((tx) =>
    tx.query<{ n: number }>('select count(*)::int as n from evidence_media where id = $1', [s.expired]),
  )
  assert.equal(gone.rows[0].n, 0)
})
