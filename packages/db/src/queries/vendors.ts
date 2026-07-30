// M4 data access: vendor roster, requirements on ceremonies, and the booking
// lifecycle. Status transitions go through a single UPDATE; the database
// triggers enforce the sequence, snapshot the scope on acceptance, demand a
// rejection reason, and recompute the requirement's fulfillment. Errors
// propagate with their SQLSTATE for translateDbError().

import { withUser } from '../withUser.js'

export type VendorCategory =
  | 'PHOTOGRAPHY' | 'VIDEOGRAPHY' | 'CATERING' | 'DECOR' | 'MUSIC_DJ' | 'MAKEUP'
  | 'MEHNDI' | 'PRIEST_PANDIT' | 'TRANSPORT' | 'LIGHTING' | 'SECURITY' | 'OTHER'

export type BookingStatus =
  | 'DRAFT' | 'SENT' | 'ACCEPTED' | 'REJECTED' | 'CANCELLED' | 'CONFIRMED'

// ---- vendor roster ---------------------------------------------------------

export interface VendorProfile {
  id: string
  name: string
  category: string
  contact_name: string | null
  contact_phone: string | null
}

export async function listVendors(userId: string): Promise<VendorProfile[]> {
  return withUser(userId, async (tx) => {
    const r = await tx.query<VendorProfile>(
      `select id, name, category::text as category, contact_name, contact_phone
         from vendor_profiles order by name asc`,
    )
    return r.rows
  })
}

export async function createVendor(
  userId: string,
  input: {
    ownerOrgId: string
    name: string
    category: VendorCategory
    contactName?: string | null
    contactPhone?: string | null
    contactEmail?: string | null
  },
): Promise<{ id: string }> {
  return withUser(userId, async (tx) => {
    const r = await tx.query<{ id: string }>(
      `insert into vendor_profiles
         (created_by_org_id, name, category, contact_name, contact_phone, contact_email)
       values ($1, $2, $3::vendor_category, $4, $5, $6) returning id`,
      [
        input.ownerOrgId,
        input.name,
        input.category,
        input.contactName ?? null,
        input.contactPhone ?? null,
        input.contactEmail ?? null,
      ],
    )
    return { id: r.rows[0].id }
  })
}

// ---- requirements ----------------------------------------------------------

export interface RequirementRow {
  id: string
  event_id: string
  event_name: string
  category: string
  scope_notes: string
  arrival_at: string
  completion_at: string
  fulfillment_status: string
}

export async function listProjectRequirements(
  userId: string,
  projectId: string,
): Promise<RequirementRow[]> {
  return withUser(userId, async (tx) => {
    const r = await tx.query<RequirementRow>(
      `select r.id, r.event_id, e.name as event_name, r.category::text as category,
              r.scope_notes,
              to_char(r.arrival_at    at time zone 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI') as arrival_at,
              to_char(r.completion_at at time zone 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI') as completion_at,
              r.fulfillment_status::text as fulfillment_status
         from vendor_requirements r
         join events e on e.id = r.event_id
        where e.project_id = $1
        order by e.starts_at asc, r.arrival_at asc`,
      [projectId],
    )
    return r.rows
  })
}

export async function addRequirement(
  userId: string,
  input: {
    eventId: string
    category: VendorCategory
    scopeNotes: string
    arrivalAt: string
    completionAt: string
  },
): Promise<{ id: string }> {
  return withUser(userId, async (tx) => {
    const r = await tx.query<{ id: string }>(
      `insert into vendor_requirements (event_id, category, scope_notes, arrival_at, completion_at)
       values ($1, $2::vendor_category, $3, $4::timestamptz, $5::timestamptz) returning id`,
      [input.eventId, input.category, input.scopeNotes, input.arrivalAt, input.completionAt],
    )
    return { id: r.rows[0].id }
  })
}

// ---- bookings --------------------------------------------------------------

export interface BookingRow {
  id: string
  requirement_id: string
  vendor_id: string
  vendor_name: string
  status: string
  rejection_reason: string | null
  accepted_at: string | null
  acceptance_source: string | null
}

export async function listProjectBookings(
  userId: string,
  projectId: string,
): Promise<BookingRow[]> {
  return withUser(userId, async (tx) => {
    const r = await tx.query<BookingRow>(
      `select b.id, b.requirement_id, b.vendor_id, v.name as vendor_name,
              b.status::text as status, b.rejection_reason,
              to_char(b.accepted_at at time zone 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI') as accepted_at,
              b.acceptance_source::text as acceptance_source
         from booking_requests b
         join vendor_profiles v on v.id = b.vendor_id
         join vendor_requirements r on r.id = b.requirement_id
         join events e on e.id = r.event_id
        where e.project_id = $1
        order by b.created_at asc`,
      [projectId],
    )
    return r.rows
  })
}

export async function createBooking(
  userId: string,
  input: { requirementId: string; vendorId: string; send?: boolean },
): Promise<{ id: string }> {
  return withUser(userId, async (tx) => {
    const r = await tx.query<{ id: string }>(
      `insert into booking_requests (requirement_id, vendor_id, status)
       values ($1, $2, $3::booking_status) returning id`,
      [input.requirementId, input.vendorId, input.send ? 'SENT' : 'DRAFT'],
    )
    return { id: r.rows[0].id }
  })
}

/** Move a booking to a new status. Triggers enforce legality, lock, and reason. */
export async function transitionBooking(
  userId: string,
  input: { bookingId: string; toStatus: BookingStatus; rejectionReason?: string | null },
): Promise<void> {
  await withUser(userId, async (tx) => {
    await tx.query(
      `update booking_requests
          set status = $2::booking_status,
              rejection_reason = coalesce($3, rejection_reason)
        where id = $1`,
      [input.bookingId, input.toStatus, input.rejectionReason ?? null],
    )
  })
}
