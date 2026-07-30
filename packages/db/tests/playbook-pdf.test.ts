// Playbook PDF: the worker's first real job.
//   * renderPlaybookPdf() produces a valid PDF from a snapshot (pure)
//   * generating a playbook enqueues a render; running the worker job renders
//     it, stores the bytes, and the RLS-scoped download returns a real PDF
//
// Run:  node --import tsx --test packages/db/tests/playbook-pdf.test.ts

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createClient } from '@supabase/supabase-js'
import {
  withSystem, closePools,
  onboardPlanner, createProject, scheduleEvent,
  generatePlaybook, getRenderStatus, getRenderedPdf,
} from '@vivahsync/db'
import { renderPendingPlaybooks } from '@vivahsync/db/jobs'
import { renderPlaybookPdf, type PlaybookSnapshotLike } from '@vivahsync/core/pdf'

const SAMPLE: PlaybookSnapshotLike = {
  project: { name: 'Test Wedding', city: 'Jaipur', start_date: '2026-12-05', end_date: '2026-12-06', expected_guest_count: 300, status: 'DRAFT' },
  generated_at: '2026-12-01 10:00',
  is_draft: false,
  pending_changes: 0,
  days: [
    {
      date: '2026-12-05', day_index: 0,
      events: [
        {
          name: 'Sangeet', starts_at: '18:00', ends_at: '22:00', setup_minutes: 60, teardown_minutes: 30,
          expected_guest_count: 300,
          spaces: [{ venue: 'Rambagh', space: 'Front Lawn' }],
          overrides: [{ rule_key: 'ACCESS_CLOSE', value: '02:00', rationale: 'Extended access approved' }],
          vendors: [
            { category: 'PHOTOGRAPHY', scope: 'Candid', arrival: '16:00', completion: '23:00', fulfillment: 'FULFILLED', vendor: { name: 'LensCraft', phone: '+91 90000 00000', status: 'ACCEPTED' } },
            { category: 'CATERING', scope: 'Dinner', arrival: '15:00', completion: '23:30', fulfillment: 'UNFULFILLED', vendor: null },
          ],
        },
      ],
    },
  ],
}

test('renderPlaybookPdf produces a valid PDF document', async () => {
  const buf = await renderPlaybookPdf(SAMPLE, { version: 3 })
  assert.ok(Buffer.isBuffer(buf))
  assert.equal(buf.subarray(0, 5).toString('latin1'), '%PDF-')
  assert.ok(buf.length > 800, `expected a non-trivial PDF, got ${buf.length} bytes`)
  // pdfkit closes the document with %%EOF
  assert.ok(buf.subarray(-8).toString('latin1').includes('%%EOF'))
})

// ---------------------------------------------------------------------------
const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
async function signUp(email: string): Promise<string> {
  const supabase = createClient(SUPA_URL, ANON, { auth: { persistSession: false } })
  const { data, error } = await supabase.auth.signUp({ email, password: `Pw-${crypto.randomUUID()}` })
  if (error) throw new Error(`signUp failed: ${error.message}`)
  return data.user!.id
}

const tag = crypto.randomUUID().slice(0, 8)
const s = { user: '', org: '', project: '', playbook: '' }

before(async () => {
  s.user = await signUp(`pbpdf-${tag}@example.com`)
  s.org = await onboardPlanner(s.user, { orgName: `PDF Agency ${tag}` })
  s.project = (await createProject(s.user, {
    ownerOrgId: s.org, name: 'Mehra-Kapoor', city: 'Jaipur',
    startDate: '2026-12-05', endDate: '2026-12-09', guestCount: 400,
  })).id
  await scheduleEvent(s.user, {
    projectId: s.project, name: 'Sangeet',
    startsAt: '2026-12-05T18:00:00+05:30', endsAt: '2026-12-05T22:00:00+05:30',
    setupMinutes: 0, teardownMinutes: 0,
  })
  s.playbook = (await generatePlaybook(s.user, s.project)).id
})

after(async () => {
  await withSystem(async (tx) => {
    await tx.query('delete from projects where owner_org_id = $1', [s.org])
    await tx.query('delete from organizations where id = $1', [s.org])
    await tx.query('delete from auth.users where id = $1', [s.user])
  }).catch(() => {})
  await closePools()
})

test('generating a playbook enqueues a render (PENDING)', async () => {
  const st = await getRenderStatus(s.user, s.playbook)
  assert.ok(st)
  assert.ok(['PENDING', 'RENDERING', 'READY'].includes(st!.status))
})

test('the worker job renders the PDF and it downloads', async () => {
  // run the actual worker job until our playbook is READY (other tests' rows
  // may share the queue; skip-locked claiming makes this safe)
  let status = ''
  for (let i = 0; i < 6 && status !== 'READY'; i++) {
    await renderPendingPlaybooks(20)
    status = (await getRenderStatus(s.user, s.playbook))?.status ?? ''
  }
  assert.equal(status, 'READY')

  const pdf = await getRenderedPdf(s.user, s.playbook)
  assert.ok(pdf, 'a READY playbook should return bytes')
  assert.equal(pdf!.subarray(0, 5).toString('latin1'), '%PDF-')
  assert.ok(pdf!.length > 800)
})
