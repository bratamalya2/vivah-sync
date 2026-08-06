// Vendor contracts + payment milestones — the money-layer guarantees:
//   * milestones can never sum to MORE than the contract total (>100% refused)
//   * a contract activates only when its plan totals EXACTLY 100%
//   * pending payments surface for the dashboard; a rival planner sees none.
//
// Run:  node --import tsx --test packages/db/tests/contracts.test.ts

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createClient } from '@supabase/supabase-js'
import {
  withSystem, closePools,
  onboardPlanner, createProject, createVendor,
  createContract, saveMilestones, getContract, activateContract, listProjectContracts,
  markMilestonePaid, pendingVendorPayments,
} from '@vivahsync/db'

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
async function signUp(email: string): Promise<string> {
  const supabase = createClient(SUPA_URL, ANON, { auth: { persistSession: false } })
  const { data, error } = await supabase.auth.signUp({ email, password: `Pw-${crypto.randomUUID()}` })
  if (error) throw new Error(`signUp failed: ${error.message}`)
  return data.user!.id
}
const isRule = (err: { code?: string }) => err.code === '23514'
const today = new Date().toISOString().slice(0, 10)

const tag = crypto.randomUUID().slice(0, 8)
const s = { planner: '', rival: '', org: '', rivalOrg: '', project: '', vendor: '', contract: '' }

before(async () => {
  s.planner = await signUp(`ctr-${tag}@example.com`)
  s.rival = await signUp(`ctr-rival-${tag}@example.com`)
  s.org = await onboardPlanner(s.planner, { orgName: `Ctr Agency ${tag}` })
  s.rivalOrg = await onboardPlanner(s.rival, { orgName: `Rival ${tag}` })
  s.project = (await createProject(s.planner, {
    ownerOrgId: s.org, name: 'Mehra-Kapoor', city: 'Jaipur',
    startDate: '2027-06-01', endDate: '2027-06-03', guestCount: 300,
  })).id
  s.vendor = (await createVendor(s.planner, { ownerOrgId: s.org, name: 'LensCraft', category: 'PHOTOGRAPHY' })).id
  s.contract = (await createContract(s.planner, {
    projectId: s.project, vendorId: s.vendor, title: 'Photography', totalAmount: 100000,
  })).id
})

after(async () => {
  await withSystem(async (tx) => {
    await tx.query('delete from projects where owner_org_id = any($1)', [[s.org, s.rivalOrg]])
    await tx.query('delete from vendor_profiles where created_by_org_id = any($1)', [[s.org, s.rivalOrg]])
    await tx.query('delete from organizations where id = any($1)', [[s.org, s.rivalOrg]])
    await tx.query('delete from auth.users where id = any($1)', [[s.planner, s.rival]])
  }).catch(() => {})
  await closePools()
})

test('milestones that exceed the contract total are refused (>100%)', async () => {
  await assert.rejects(
    () => saveMilestones(s.planner, {
      contractId: s.contract,
      milestones: [
        { id: null, label: 'Advance', amount: 70000, dueDate: today, sortOrder: 0 },
        { id: null, label: 'Balance', amount: 50000, dueDate: today, sortOrder: 1 }, // 120k > 100k
      ],
    }),
    isRule,
  )
})

test('a plan under 100% saves as DRAFT but cannot be activated', async () => {
  await saveMilestones(s.planner, {
    contractId: s.contract,
    milestones: [{ id: null, label: 'Advance', amount: 40000, dueDate: today, sortOrder: 0 }],
  })
  const c = await getContract(s.planner, s.contract)
  assert.equal(c!.status, 'DRAFT')
  assert.equal(c!.milestones.length, 1)
  await assert.rejects(() => activateContract(s.planner, s.contract), isRule)
})

test('a plan that totals exactly 100% activates', async () => {
  await saveMilestones(s.planner, {
    contractId: s.contract,
    milestones: [
      { id: null, label: 'Booking advance', amount: 50000, dueDate: today, sortOrder: 0 },
      { id: null, label: 'On delivery', amount: 50000, dueDate: today, sortOrder: 1 },
    ],
  })
  await activateContract(s.planner, s.contract)
  const c = await getContract(s.planner, s.contract)
  assert.equal(c!.status, 'ACTIVE')
})

test('pending payments surface, and drop off when a milestone is marked paid', async () => {
  const before = await pendingVendorPayments(s.planner, 7)
  const mine = before.filter((p) => p.contract_id === s.contract)
  assert.equal(mine.length, 2)
  assert.equal(mine.reduce((sum, p) => sum + p.amount, 0), 100000)

  const detail = await getContract(s.planner, s.contract)
  await markMilestonePaid(s.planner, { milestoneId: detail!.milestones[0].id, paid: true })
  const after = (await pendingVendorPayments(s.planner, 7)).filter((p) => p.contract_id === s.contract)
  assert.equal(after.length, 1)
})

test('a rival planner sees none of the contract', async () => {
  assert.equal((await listProjectContracts(s.rival, s.project)).length, 0)
  assert.equal(await getContract(s.rival, s.contract), null)
  assert.equal((await pendingVendorPayments(s.rival, 30)).filter((p) => p.contract_id === s.contract).length, 0)
})
