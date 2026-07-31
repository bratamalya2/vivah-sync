// Demo seed. Creates login accounts (Supabase Admin API) and a fully-populated
// wedding using the SAME data-access functions the app uses — so seeding also
// re-exercises every enforcement rule. Anchored to today so the risk dashboard
// lights up. Idempotent: cleans the seed accounts + their data first, so it can
// be re-run any time.
//
// Run:  npm run db:seed

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import {
  withSystem, closePools,
  onboardPlanner, createProject, createVenue, createSpace, scheduleEvent,
  createVendor, addRequirement, createBooking, transitionBooking,
  setEventSpaces, addVenueOverride, generatePlaybook, rescheduleEvent,
  inviteFamily, claimFamilyInvitations, recordLedgerEntry,
  inviteVendor, claimVendorInvitations, vendorRecordEvidence,
} from '@vivahsync/db'
import { ensureEvidenceBucket, uploadEvidence } from '@vivahsync/db/storage'
import { renderPendingPlaybooks } from '@vivahsync/db/jobs'

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
)

const PASSWORD = 'vivah2026'
const EMAILS = {
  planner: 'priya@vivahsync.dev',
  family: 'aunt@vivahsync.dev',
  rival: 'sunil@vivahsync.dev',
  vendor: 'raj@lenscraft.dev',
}

const dayMs = 86_400_000
const dateOnly = (offset: number) => new Date(Date.now() + offset * dayMs).toISOString().slice(0, 10)
const at = (offset: number, time: string) => `${dateOnly(offset)}T${time}:00+05:30`

async function findUserId(email: string): Promise<string | null> {
  const r = await withSystem((tx) =>
    tx.query<{ id: string }>('select id from auth.users where lower(email) = lower($1)', [email]),
  )
  return r.rows[0]?.id ?? null
}

async function createUser(email: string): Promise<string> {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  })
  if (error || !data.user) throw new Error(`createUser(${email}) failed: ${error?.message}`)
  return data.user.id
}

async function cleanup() {
  const ids: string[] = []
  for (const email of Object.values(EMAILS)) {
    const id = await findUserId(email)
    if (id) ids.push(id)
  }
  if (ids.length === 0) return

  const orgs = await withSystem((tx) =>
    tx.query<{ org_id: string }>('select distinct org_id from memberships where user_id = any($1)', [ids]),
  )
  const orgIds = orgs.rows.map((o) => o.org_id)

  await withSystem(async (tx) => {
    if (orgIds.length) {
      // Teardown must get past the intentional immutability guards — the
      // locked-ceremony delete block (trg_event_delete_guard) and the append-only
      // ledger — which fire even on a cascading delete. Disable just those two
      // tables' user triggers for the length of this (atomic) transaction; the FK
      // cascades themselves still fire.
      await tx.query('alter table public.events disable trigger user')
      await tx.query('alter table public.ledger_entries disable trigger user')
      await tx.query('delete from projects where owner_org_id = any($1)', [orgIds])
      await tx.query('delete from venues where owner_org_id = any($1)', [orgIds])
      await tx.query('delete from vendor_profiles where created_by_org_id = any($1)', [orgIds])
      await tx.query('delete from organizations where id = any($1)', [orgIds])
      await tx.query('alter table public.ledger_entries enable trigger user')
      await tx.query('alter table public.events enable trigger user')
    }
  })
  for (const id of ids) await admin.auth.admin.deleteUser(id).catch(() => {})
}

async function main() {
  console.log('\nSeeding VivahSync demo data…\n')
  await cleanup()

  // ========================================================================
  // Planner agency: Shubh Muhurat — Priya
  // ========================================================================
  const priya = await createUser(EMAILS.planner)
  const org = await onboardPlanner(priya, {
    orgName: 'Shubh Muhurat', fullName: 'Priya Sharma', email: EMAILS.planner,
  })

  const venue = (await createVenue(priya, {
    ownerOrgId: org, name: 'Rambagh Palace', address: 'Bhawani Singh Rd, Jaipur',
    contactName: 'Mr. Sharma', contactPhone: '+91 98290 00000',
  })).id
  const lawn = (await createSpace(priya, { venueId: venue, name: 'Front Lawn', comfortCapacity: 350, legalMaxCapacity: 500 })).id
  const hall = (await createSpace(priya, { venueId: venue, name: 'Durbar Hall', comfortCapacity: 200, legalMaxCapacity: 300 })).id
  const terrace = (await createSpace(priya, { venueId: venue, name: 'Terrace', comfortCapacity: 120, legalMaxCapacity: 200 })).id

  // 3-day wedding starting in 5 days (inside the 14-day risk window)
  const project = (await createProject(priya, {
    ownerOrgId: org, name: 'Mehra–Kapoor', city: 'Jaipur',
    startDate: dateOnly(5), endDate: dateOnly(7), guestCount: 450,
  })).id

  const haldi = (await scheduleEvent(priya, {
    projectId: project, name: 'Haldi', startsAt: at(5, '09:00'), endsAt: at(5, '12:00'),
    setupMinutes: 30, teardownMinutes: 30, guestCount: 120, spaceId: terrace,
  })).id
  const mehndi = (await scheduleEvent(priya, {
    projectId: project, name: 'Mehndi', startsAt: at(5, '16:00'), endsAt: at(5, '20:00'),
    setupMinutes: 60, teardownMinutes: 30, guestCount: 200, spaceId: hall,
  })).id
  const sangeet = (await scheduleEvent(priya, {
    projectId: project, name: 'Sangeet', startsAt: at(6, '19:00'), endsAt: at(6, '23:00'),
    setupMinutes: 120, teardownMinutes: 60, guestCount: 400, spaceId: lawn,
  })).id
  const wedding = (await scheduleEvent(priya, {
    projectId: project, name: 'Wedding', startsAt: at(7, '11:00'), endsAt: at(7, '14:00'),
    setupMinutes: 120, teardownMinutes: 60, guestCount: 250, spaceId: hall,
  })).id
  // Reception deliberately has NO space assigned → surfaces on the risk dashboard
  const reception = (await scheduleEvent(priya, {
    projectId: project, name: 'Reception', startsAt: at(7, '19:00'), endsAt: at(7, '23:00'),
    setupMinutes: 90, teardownMinutes: 60, guestCount: 450,
  })).id

  void mehndi

  // vendor roster
  const lenscraft = (await createVendor(priya, { ownerOrgId: org, name: 'LensCraft Studios', category: 'PHOTOGRAPHY', contactName: 'Raj', contactPhone: '+91 90000 11111' })).id
  const saffron = (await createVendor(priya, { ownerOrgId: org, name: 'Saffron Kitchen', category: 'CATERING', contactName: 'Anita', contactPhone: '+91 90000 22222' })).id
  const marigold = (await createVendor(priya, { ownerOrgId: org, name: 'Marigold Decor', category: 'DECOR', contactName: 'Vikram', contactPhone: '+91 90000 33333' })).id
  const djvolt = (await createVendor(priya, { ownerOrgId: org, name: 'DJ Volt', category: 'MUSIC_DJ', contactName: 'Sam', contactPhone: '+91 90000 44444' })).id
  const glow = (await createVendor(priya, { ownerOrgId: org, name: 'Glow Makeup', category: 'MAKEUP', contactName: 'Nisha', contactPhone: '+91 90000 55555' })).id

  const req = async (eventId: string, category: string, scope: string, arrive: string, done: string, day: number) =>
    (await addRequirement(priya, {
      eventId, category: category as never, scopeNotes: scope,
      arrivalAt: at(day, arrive), completionAt: at(day, done),
    })).id
  const book = async (requirementId: string, vendorId: string, status: 'ACCEPTED' | 'REJECTED' | 'SENT', reason?: string) => {
    const b = (await createBooking(priya, { requirementId, vendorId, send: true })).id
    if (status === 'ACCEPTED') await transitionBooking(priya, { bookingId: b, toStatus: 'ACCEPTED' })
    if (status === 'REJECTED') await transitionBooking(priya, { bookingId: b, toStatus: 'REJECTED', rejectionReason: reason ?? 'Unavailable' })
    return b
  }

  // Sangeet: photographer confirmed, decorator still out, DJ fell through (→ risk)
  await book(await req(sangeet, 'PHOTOGRAPHY', 'Full-day candid + traditional', '17:00', '23:30', 6), lenscraft, 'ACCEPTED')
  await book(await req(sangeet, 'DECOR', 'Stage, lighting, floral', '12:00', '18:30', 6), marigold, 'SENT')
  await book(await req(sangeet, 'MUSIC_DJ', 'Sound + DJ till midnight', '17:00', '23:30', 6), djvolt, 'REJECTED', 'Double-booked that night')
  // Reception: caterer confirmed; makeup requirement with no vendor yet (→ risk)
  await book(await req(reception, 'CATERING', 'Dinner buffet for 450', '16:00', '23:30', 7), saffron, 'ACCEPTED')
  await req(reception, 'MAKEUP', 'Bridal + family touch-ups', '15:00', '20:00', 7)
  // Haldi: photographer confirmed
  await book(await req(haldi, 'PHOTOGRAPHY', 'Morning candids', '08:30', '12:30', 5), lenscraft, 'ACCEPTED')
  // Wedding: photographer request still pending → LensCraft accepts/declines it in the portal
  await book(await req(wedding, 'PHOTOGRAPHY', 'Full wedding-day coverage', '10:00', '14:30', 7), lenscraft, 'SENT')
  void glow

  // multi-space showcase: Sangeet spills onto the terrace too
  await setEventSpaces(priya, { eventId: sangeet, spaceIds: [lawn, terrace] })

  // venue exception (writes an audit entry)
  await addVenueOverride(priya, {
    eventId: reception, ruleKey: 'ACCESS_CLOSE', overrideValue: '02:00',
    rationale: 'Client paid for extended access; venue manager approved by email.',
  })

  // ledger — a couple of recorded payments + one already-locked entry (shows reversal)
  await recordLedgerEntry(priya, { projectId: project, direction: 'INFLOW', amount: 500000, mode: 'BANK', payer: 'CLIENT', note: 'Booking advance', paidAt: at(-3, '11:00') })
  await recordLedgerEntry(priya, { projectId: project, direction: 'OUTFLOW', amount: 120000, mode: 'UPI', payer: 'PLANNER', vendorId: lenscraft, note: 'Photographer advance', paidAt: at(-1, '15:00') })
  await withSystem((tx) =>
    tx.query(
      `insert into ledger_entries (project_id, direction, amount, mode, payer, vendor_id, note, paid_at, created_at, created_by)
       values ($1,'OUTFLOW',60000,'CASH','PLANNER',$2,'Caterer advance', now()-interval '3 days', now()-interval '30 minutes', $3)`,
      [project, saffron, priya],
    ),
  )

  // generate + render the playbook so the PDF is ready without the worker running
  await generatePlaybook(priya, project)
  await renderPendingPlaybooks(20)

  // ========================================================================
  // Family member: Aunt Meera (read-only portal)
  // ========================================================================
  const aunt = await createUser(EMAILS.family)
  await inviteFamily(priya, { projectId: project, email: EMAILS.family, name: 'Aunt Meera' })
  await claimFamilyInvitations(aunt)

  // ========================================================================
  // Vendor: LensCraft Studios — Raj (self-service portal)
  // ========================================================================
  const raj = await createUser(EMAILS.vendor)
  await inviteVendor(priya, { vendorId: lenscraft, email: EMAILS.vendor })
  await claimVendorInvitations(raj)
  // Propose moving Haldi (LensCraft is locked on it) so the vendor has a
  // schedule change waiting to acknowledge in the portal.
  await rescheduleEvent(priya, { eventId: haldi, newStartsAt: at(5, '10:00'), newEndsAt: at(5, '13:00') })
  // A setup photo the vendor captured on the Haldi — surfaces in the vendor
  // portal AND on the family's read-only schedule.
  const photo = readFileSync(
    fileURLToPath(new URL('../../../apps/web/public/img/ceremony-fire.jpg', import.meta.url)),
  )
  const evId = crypto.randomUUID()
  await ensureEvidenceBucket()
  await uploadEvidence(`${project}/${evId}.jpg`, photo, 'image/jpeg')
  await vendorRecordEvidence(raj, {
    id: evId, eventId: haldi, storagePath: `${project}/${evId}.jpg`,
    contentType: 'image/jpeg', fileName: 'haldi-setup.jpg', byteSize: photo.length,
  })

  // ========================================================================
  // Rival agency: Bandhan Events — Sunil (proves cross-agency isolation)
  // ========================================================================
  const sunil = await createUser(EMAILS.rival)
  const rivalOrg = await onboardPlanner(sunil, { orgName: 'Bandhan Events', fullName: 'Sunil Rao', email: EMAILS.rival })
  const rivalVenue = (await createVenue(sunil, { ownerOrgId: rivalOrg, name: 'Umaid Bhawan', address: 'Jodhpur' })).id
  const rivalSpace = (await createSpace(sunil, { venueId: rivalVenue, name: 'Marble Court', legalMaxCapacity: 400 })).id
  const rivalProject = (await createProject(sunil, {
    ownerOrgId: rivalOrg, name: 'Rao–Iyer', city: 'Jodhpur', startDate: dateOnly(9), endDate: dateOnly(10), guestCount: 300,
  })).id
  await scheduleEvent(sunil, {
    projectId: rivalProject, name: 'Wedding', startsAt: at(9, '19:00'), endsAt: at(9, '23:00'),
    setupMinutes: 60, teardownMinutes: 60, guestCount: 300, spaceId: rivalSpace,
  })

  console.log('Done.\n')
  console.log('  Sign in at http://localhost:3000/login  (password for all: ' + PASSWORD + ')')
  console.log('  ┌─────────────────────────────────────────────────────────────')
  console.log(`  │ ${EMAILS.planner}   Planner (Shubh Muhurat) — the rich Mehra–Kapoor wedding`)
  console.log(`  │ ${EMAILS.family}      Family — read-only portal for Mehra–Kapoor`)
  console.log(`  │ ${EMAILS.vendor}     Vendor (LensCraft Studios) — self-service portal, own bookings only`)
  console.log(`  │ ${EMAILS.rival}     Rival planner (Bandhan Events) — sees only its own wedding`)
  console.log('  └─────────────────────────────────────────────────────────────\n')
}

main()
  .then(() => closePools())
  .then(() => process.exit(0))
  .catch(async (err) => {
    console.error('\nSeed failed:', err instanceof Error ? err.message : err)
    await closePools().catch(() => {})
    process.exit(1)
  })
