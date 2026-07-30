// Payment ledger + 15-minute edit window, proved by attempting the violations:
//   * an entry is editable within 15 min, then locked (edit + delete blocked)
//   * a locked entry can be corrected by a REVERSING entry (opposite, same amount)
//   * an entry can be reversed at most once, and a reversal can't be reversed
//   * edits and reversals are written to the audit log
//   * family (READ_ONLY) and a competing agency are blind to the ledger
//
// Run:  node --import tsx --test packages/db/tests/ledger.test.ts

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createClient } from '@supabase/supabase-js'
import {
  withSystem, closePools,
  onboardPlanner, createProject, createVendor,
  recordLedgerEntry, editLedgerEntry, deleteLedgerEntry, reverseLedgerEntry, listProjectLedger,
  listAuditLog, inviteFamily, claimFamilyInvitations,
} from '@vivahsync/db'

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
async function signUp(email: string): Promise<string> {
  const supabase = createClient(SUPA_URL, ANON, { auth: { persistSession: false } })
  const { data, error } = await supabase.auth.signUp({ email, password: `Pw-${crypto.randomUUID()}` })
  if (error) throw new Error(`signUp failed: ${error.message}`)
  return data.user!.id
}
const now = () => new Date().toISOString()

const tag = crypto.randomUUID().slice(0, 8)
const famEmail = `led-fam-${tag}@example.com`
const s = { planner: '', family: '', other: '', org: '', project: '', vendor: '', e1: '', locked: '', rev: '' }

before(async () => {
  s.planner = await signUp(`led-plan-${tag}@example.com`)
  s.family = await signUp(famEmail)
  s.other = await signUp(`led-other-${tag}@example.com`)
  s.org = await onboardPlanner(s.planner, { orgName: `Ledger Agency ${tag}` })
  await onboardPlanner(s.other, { orgName: `Rival ${tag}` })
  s.project = (await createProject(s.planner, {
    ownerOrgId: s.org, name: 'Mehra-Kapoor', city: 'Jaipur',
    startDate: '2026-12-05', endDate: '2026-12-06', guestCount: 400,
  })).id
  s.vendor = (await createVendor(s.planner, { ownerOrgId: s.org, name: 'Saffron Kitchen', category: 'CATERING' })).id

  // a fresh, editable entry
  s.e1 = (await recordLedgerEntry(s.planner, {
    projectId: s.project, direction: 'INFLOW', amount: 500000, mode: 'BANK', payer: 'CLIENT', note: 'Advance', paidAt: now(),
  })).id

  // a locked entry (created 20 minutes ago — seeded directly)
  s.locked = crypto.randomUUID()
  await withSystem((tx) =>
    tx.query(
      `insert into ledger_entries (id, project_id, direction, amount, mode, payer, vendor_id, note, paid_at, created_at, created_by)
       values ($1,$2,'OUTFLOW',50000,'CASH','VENDOR',$3,'Caterer advance', now()-interval '20 minutes', now()-interval '20 minutes', $4)`,
      [s.locked, s.project, s.vendor, s.planner],
    ),
  )
})

after(async () => {
  await withSystem(async (tx) => {
    await tx.query('delete from projects where owner_org_id = $1', [s.org])
    await tx.query('delete from vendor_profiles where created_by_org_id = $1', [s.org])
    await tx.query('delete from organizations where id = $1', [s.org])
    await tx.query('delete from organizations where name = $1', [`Rival ${tag}`])
    await tx.query('delete from organizations where id in (select org_id from memberships where user_id = $1)', [s.family])
    await tx.query('delete from auth.users where id = any($1)', [[s.planner, s.family, s.other]])
  }).catch(() => {})
  await closePools()
})

test('a fresh entry is editable within the window', async () => {
  const rows = await listProjectLedger(s.planner, s.project)
  const e = rows.find((r) => r.id === s.e1)!
  assert.equal(e.direction, 'INFLOW')
  assert.equal(e.amount, 500000)
  assert.equal(e.is_locked, false)
  assert.ok(e.editable_until_ms > Date.now())

  await editLedgerEntry(s.planner, {
    id: s.e1, direction: 'INFLOW', amount: 550000, mode: 'UPI', payer: 'CLIENT', note: 'Advance (corrected)', paidAt: now(),
  })
  const after = (await listProjectLedger(s.planner, s.project)).find((r) => r.id === s.e1)!
  assert.equal(after.amount, 550000)
  assert.equal(after.mode, 'UPI')
})

test('a locked entry cannot be edited or deleted', async () => {
  await assert.rejects(
    () => editLedgerEntry(s.planner, { id: s.locked, direction: 'OUTFLOW', amount: 60000, mode: 'CASH', payer: 'VENDOR', paidAt: now() }),
    (err: { code?: string }) => err.code === '23514',
  )
  await assert.rejects(
    () => deleteLedgerEntry(s.planner, s.locked),
    (err: { code?: string }) => err.code === '23514',
  )
})

test('a locked entry is corrected by a reversing entry', async () => {
  const { id } = await reverseLedgerEntry(s.planner, s.locked)
  s.rev = id
  const rows = await listProjectLedger(s.planner, s.project)
  const rev = rows.find((r) => r.id === id)!
  assert.equal(rev.direction, 'INFLOW') // opposite of the OUTFLOW it reverses
  assert.equal(rev.amount, 50000)
  assert.equal(rev.reverses_id, s.locked)
  assert.equal(rows.find((r) => r.id === s.locked)!.reversed, true)
})

test('an entry cannot be reversed twice, and a reversal cannot be reversed', async () => {
  await assert.rejects(
    () => reverseLedgerEntry(s.planner, s.locked),
    (err: { code?: string }) => err.code === '23505', // unique(reverses_id)
  )
  await assert.rejects(
    () => reverseLedgerEntry(s.planner, s.rev),
    (err: { code?: string }) => err.code === '23514', // can't reverse a reversal
  )
})

test('edits and reversals are audited', async () => {
  const audit = await listAuditLog(s.planner, s.project)
  assert.ok(audit.some((a) => a.action === 'LEDGER_EDIT'))
  assert.ok(audit.some((a) => a.action === 'LEDGER_REVERSAL'))
})

test('family and a competing agency are blind to the ledger', async () => {
  await inviteFamily(s.planner, { projectId: s.project, email: famEmail })
  await claimFamilyInvitations(s.family)
  assert.equal((await listProjectLedger(s.family, s.project)).length, 0)
  assert.equal((await listProjectLedger(s.other, s.project)).length, 0)
})
