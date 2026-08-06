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
  createContract, activateContract, getContract, markMilestonePaid,
  createParty, loadRsvp, submitRsvp,
  addTravel, setDispatch, updateTravelStatus, listProjectTravel,
  createHotel, addRoomBlock, allocateRoom, setStayStatus, setAllocationFlags, listAllocations,
  sendBroadcast,
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

  // A photographer contract with a 100%-balanced payment plan: advance already
  // paid, the event-day instalment due this week (lights up the dashboard money
  // tracker), final on album delivery.
  const contract = (await createContract(priya, {
    projectId: project, vendorId: lenscraft, title: 'Photography & videography', totalAmount: 250000,
    milestones: [
      { label: 'Booking advance', amount: 100000, dueDate: dateOnly(-2) },
      { label: 'Event-day instalment', amount: 100000, dueDate: dateOnly(4) },
      { label: 'Final album delivery', amount: 50000, dueDate: dateOnly(25) },
    ],
  })).id
  await activateContract(priya, contract)
  const cdetail = await getContract(priya, contract)
  const advance = cdetail?.milestones.find((m) => m.label === 'Booking advance')
  if (advance) await markMilestonePaid(priya, { milestoneId: advance.id, paid: true })

  // ========================================================================
  // Guest hospitality — parties, RSVPs, travel/dispatch, hotel rooms, broadcast
  // ========================================================================
  // Three households. createParty auto-invites every ceremony + seeds a primary
  // guest; each gets a no-login RSVP + itinerary link.
  const sharma = await createParty(priya, { projectId: project, name: 'The Sharma Family', contactName: 'Anil Sharma', contactPhone: '+91 98100 10001', contactEmail: 'anil@example.com', plusOnesAllowed: 2 })
  const iyer = await createParty(priya, { projectId: project, name: 'Iyer Household', contactName: 'Lakshmi Iyer', contactPhone: '+91 98100 10002', plusOnesAllowed: 1 })
  const nair = await createParty(priya, { projectId: project, name: 'Nair Family', contactName: 'Ravi Nair', contactPhone: '+91 98100 10003', plusOnesAllowed: 0 })

  // Sharma respond YES across the board and bring a plus-one; Nair are tentative.
  const sr = (await loadRsvp(sharma.token))!
  const yesAll = sr.events.map((e) => ({ eventId: e.id, status: 'YES' as const }))
  await submitRsvp(sharma.token, [
    { id: sr.guests[0].id, name: 'Anil Sharma', isChild: false, isPlusOne: false, dietary: 'Jain (no onion/garlic)', assistance: null, rsvps: yesAll },
    { id: null, name: 'Meera Sharma', isChild: false, isPlusOne: true, dietary: null, assistance: 'Wheelchair access at Wedding', rsvps: yesAll },
  ])
  const nr = (await loadRsvp(nair.token))!
  await submitRsvp(nair.token, [
    {
      id: nr.guests[0].id, name: 'Ravi Nair', isChild: false, isPlusOne: false, dietary: null, assistance: null,
      rsvps: nr.events.map((e) => ({ eventId: e.id, status: e.name === 'Wedding' ? ('YES' as const) : ('MAYBE' as const) })),
    },
  ])
  void iyer // Iyer stay pending → shows on the "awaiting RSVP" segment

  // Travel: Sharma fly in together (arrival + assigned car); a delayed train too.
  await addTravel(priya, { partyId: sharma.id, direction: 'ARRIVAL', mode: 'FLIGHT', carrierNumber: '6E-203', scheduledAt: at(4, '14:05'), location: 'Jaipur (JAI) T2', hotel: 'Taj Rambagh', headcount: 2 })
  await addTravel(priya, { partyId: nair.id, direction: 'ARRIVAL', mode: 'TRAIN', carrierNumber: '12956 Shatabdi', scheduledAt: at(4, '14:20'), location: 'Jaipur Jn', hotel: 'Taj Rambagh', headcount: 1 })
  await addTravel(priya, { partyId: sharma.id, direction: 'DEPARTURE', mode: 'FLIGHT', carrierNumber: 'AI-865', scheduledAt: at(8, '09:30'), location: 'Jaipur (JAI)', hotel: null, headcount: 2 })
  // Dispatch a driver to the Sharma arrival and flag the train delayed.
  const legs = await listProjectTravel(priya, project)
  const sharmaArrival = legs.find((l) => l.carrier_number === '6E-203')
  const nairTrain = legs.find((l) => l.carrier_number?.startsWith('12956'))
  if (sharmaArrival) await setDispatch(priya, { id: sharmaArrival.id, driverName: 'Ramesh', driverPhone: '+91 90000 90001', vehicle: 'Toyota Innova · RJ14 CX 2201' })
  if (nairTrain) await updateTravelStatus(priya, { id: nairTrain.id, status: 'DELAYED', delayNote: 'Running ~40 min late' })

  // Hotel room block + allocations; check the Sharma family in with a welcome kit.
  const hotel = await createHotel(priya, { projectId: project, name: 'Taj Rambagh', address: 'Bhawani Singh Rd, Jaipur', phone: '+91 141 2211919' })
  await addRoomBlock(priya, { hotelId: hotel, roomType: 'Palace Room', totalRooms: 20, rate: 18500 })
  await addRoomBlock(priya, { hotelId: hotel, roomType: 'Historic Suite', totalRooms: 4, rate: 45000 })
  await allocateRoom(priya, { hotelId: hotel, partyId: sharma.id, roomType: 'Historic Suite', roomNumber: '110', occupancy: 2, checkInDate: dateOnly(4), checkOutDate: dateOnly(8), notes: 'Early check-in requested' })
  await allocateRoom(priya, { hotelId: hotel, partyId: nair.id, roomType: 'Palace Room', roomNumber: '204', occupancy: 1, checkInDate: dateOnly(4), checkOutDate: dateOnly(8), notes: null })
  const allocs = await listAllocations(priya, project)
  const sharmaRoom = allocs.find((a) => a.party_name === 'The Sharma Family')
  if (sharmaRoom) {
    await setStayStatus(priya, { id: sharmaRoom.id, status: 'CHECKED_IN' })
    await setAllocationFlags(priya, { id: sharmaRoom.id, welcomeKit: true })
  }

  // Broadcast log (stub send): a reminder to the pending party + a welcome note.
  await sendBroadcast(priya, { projectId: project, channel: 'WHATSAPP', audience: 'PENDING_RSVP', subject: null, body: 'Namaste! A gentle reminder to RSVP for the Mehra–Kapoor wedding festivities. Tap your link to confirm 🙏' })
  await sendBroadcast(priya, { projectId: project, channel: 'WHATSAPP', audience: 'ARRIVING', subject: null, body: 'Welcome to Jaipur! Your driver details and room are on your itinerary link. See you at Taj Rambagh ✨' })

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
