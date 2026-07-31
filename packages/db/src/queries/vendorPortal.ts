// Vendor self-service portal data access. Planner-side invite/list, vendor-side
// claim, the vendor's own bookings, and their two write actions. All enforcement
// lives in the SECURITY DEFINER functions + ownership checks (migration 0014);
// this layer only orchestrates.

import { withUser } from '../withUser.js'

export interface VendorBooking {
  booking_id: string
  status: string
  rejection_reason: string | null
  vendor_name: string
  category: string
  scope_notes: string
  arrival: string
  completion: string
  event_id: string
  event_name: string
  event_date: string
  starts: string
  ends: string
  project_id: string
  project_name: string
  city: string
  start_date: string
  end_date: string
  spaces: string
  pending_ack_id: string | null
  proposed_start: string | null
  proposed_end: string | null
}

/** Planner (roster owner) invites a vendor to the portal by email. */
export async function inviteVendor(
  userId: string,
  input: { vendorId: string; email: string },
): Promise<void> {
  await withUser(userId, async (tx) => {
    await tx.query('select app.invite_vendor($1, $2)', [input.vendorId, input.email])
  })
}

/** Vendor claims any invitations matching their email; provisions their org. Returns count. */
export async function claimVendorInvitations(userId: string): Promise<number> {
  return withUser(userId, async (tx) => {
    const r = await tx.query<{ n: number }>('select app.claim_vendor_invitations() as n')
    return r.rows[0].n
  })
}

/** Every booking assigned to the signed-in vendor — their own rows only. */
export async function vendorBookings(userId: string): Promise<VendorBooking[]> {
  return withUser(userId, async (tx) => {
    const r = await tx.query<VendorBooking>('select * from app.vendor_bookings()')
    return r.rows
  })
}

/** Vendor accepts or declines one of its own SENT bookings (recorded VENDOR_SELF). */
export async function vendorRespondBooking(
  userId: string,
  input: { bookingId: string; accept: boolean; reason?: string | null },
): Promise<void> {
  await withUser(userId, async (tx) => {
    await tx.query('select app.vendor_respond_booking($1, $2, $3)', [
      input.bookingId,
      input.accept,
      input.reason ?? null,
    ])
  })
}

/** Vendor acknowledges a pending schedule change on its own booking. */
export async function vendorAcknowledge(userId: string, input: { ackId: string }): Promise<void> {
  await withUser(userId, async (tx) => {
    await tx.query('select app.vendor_acknowledge($1)', [input.ackId])
  })
}

export interface VendorPortalInvite {
  vendor_id: string
  email: string
  claimed_at: string | null
}

/** Planner: portal invitations across the org's roster (for status display). */
export async function listVendorPortalInvites(userId: string): Promise<VendorPortalInvite[]> {
  return withUser(userId, async (tx) => {
    const r = await tx.query<VendorPortalInvite>(
      `select vendor_id, email,
              to_char(claimed_at at time zone 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI') as claimed_at
         from vendor_invitations order by created_at asc`,
    )
    return r.rows
  })
}

export interface VendorEvidence {
  event_id: string
  id: string
  file_name: string | null
  content_type: string | null
  created_at: string
}

/** The project id if the vendor may attach evidence to this ceremony, else null. */
export async function vendorEventProject(userId: string, eventId: string): Promise<string | null> {
  return withUser(userId, async (tx) => {
    const r = await tx.query<{ p: string | null }>('select app.vendor_event_project($1) as p', [eventId])
    return r.rows[0]?.p ?? null
  })
}

/** Record an evidence row against one of the vendor's own booking-ceremonies. */
export async function vendorRecordEvidence(
  userId: string,
  input: {
    id: string
    eventId: string
    storagePath: string
    contentType: string | null
    fileName: string | null
    byteSize: number | null
  },
): Promise<void> {
  await withUser(userId, async (tx) => {
    await tx.query('select app.vendor_record_evidence($1, $2, $3, $4, $5, $6)', [
      input.id,
      input.eventId,
      input.storagePath,
      input.contentType,
      input.fileName,
      input.byteSize,
    ])
  })
}

/** Every evidence file the vendor uploaded, keyed by ceremony (event_id). */
export async function vendorEvidence(userId: string): Promise<VendorEvidence[]> {
  return withUser(userId, async (tx) => {
    const r = await tx.query<VendorEvidence>('select * from app.vendor_evidence()')
    return r.rows
  })
}
