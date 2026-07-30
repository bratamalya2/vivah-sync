// M3 data access: venues, spaces, day structure, and ceremony scheduling.
// scheduleEvent() is the important one — it inserts the event and its space
// booking in a SINGLE transaction, so an overlap (23P01), a capacity breach, or
// an out-of-timeline ceremony rolls the whole thing back. Errors propagate with
// their SQLSTATE so callers can translateDbError() them into planner messages.

import { withUser } from '../withUser.js'

// ---- venues & spaces -------------------------------------------------------

export interface VenueRow {
  id: string
  name: string
  address: string | null
  contact_name: string | null
  contact_phone: string | null
}

export async function listVenues(userId: string): Promise<VenueRow[]> {
  return withUser(userId, async (tx) => {
    const r = await tx.query<VenueRow>(
      `select id, name, address, contact_name, contact_phone
         from venues order by name asc`,
    )
    return r.rows
  })
}

export async function createVenue(
  userId: string,
  input: {
    ownerOrgId: string
    name: string
    address?: string | null
    contactName?: string | null
    contactPhone?: string | null
  },
): Promise<{ id: string }> {
  return withUser(userId, async (tx) => {
    const r = await tx.query<{ id: string }>(
      `insert into venues (owner_org_id, name, address, contact_name, contact_phone)
       values ($1, $2, $3, $4, $5) returning id`,
      [
        input.ownerOrgId,
        input.name,
        input.address ?? null,
        input.contactName ?? null,
        input.contactPhone ?? null,
      ],
    )
    return { id: r.rows[0].id }
  })
}

export interface SpaceRow {
  id: string
  venue_id: string
  venue_name: string
  name: string
  comfort_capacity: number | null
  legal_max_capacity: number | null
}

/** Every space the user can book, across their org's venues (for pickers). */
export async function listSpaces(userId: string): Promise<SpaceRow[]> {
  return withUser(userId, async (tx) => {
    const r = await tx.query<SpaceRow>(
      `select s.id, s.venue_id, v.name as venue_name, s.name,
              s.comfort_capacity, s.legal_max_capacity
         from venue_spaces s
         join venues v on v.id = s.venue_id
        order by v.name asc, s.name asc`,
    )
    return r.rows
  })
}

export async function createSpace(
  userId: string,
  input: {
    venueId: string
    name: string
    comfortCapacity?: number | null
    legalMaxCapacity?: number | null
  },
): Promise<{ id: string }> {
  return withUser(userId, async (tx) => {
    const r = await tx.query<{ id: string }>(
      `insert into venue_spaces (venue_id, name, comfort_capacity, legal_max_capacity)
       values ($1, $2, $3, $4) returning id`,
      [input.venueId, input.name, input.comfortCapacity ?? null, input.legalMaxCapacity ?? null],
    )
    return { id: r.rows[0].id }
  })
}

// ---- project detail: days & events -----------------------------------------

export interface ProjectDetail {
  id: string
  name: string
  city: string
  start_date: string
  end_date: string
  expected_guest_count: number | null
  status: string
}

export async function getProject(userId: string, projectId: string): Promise<ProjectDetail | null> {
  return withUser(userId, async (tx) => {
    const r = await tx.query<ProjectDetail>(
      `select id, name, city,
              to_char(start_date, 'YYYY-MM-DD') as start_date,
              to_char(end_date, 'YYYY-MM-DD') as end_date,
              expected_guest_count, status::text as status
         from projects where id = $1`,
      [projectId],
    )
    return r.rows[0] ?? null
  })
}

export interface DayRow {
  day_date: string
  day_index: number
}

export async function listDays(userId: string, projectId: string): Promise<DayRow[]> {
  return withUser(userId, async (tx) => {
    const r = await tx.query<DayRow>(
      `select to_char(day_date, 'YYYY-MM-DD') as day_date, day_index
         from project_days where project_id = $1 order by day_index asc`,
      [projectId],
    )
    return r.rows
  })
}

export interface EventSpace {
  booking_id: string
  space_id: string
  venue: string
  space: string
}

export interface EventRow {
  id: string
  name: string
  starts_at: string
  ends_at: string
  setup_minutes: number
  teardown_minutes: number
  expected_guest_count: number | null
  spaces: EventSpace[]
}

export async function listEvents(userId: string, projectId: string): Promise<EventRow[]> {
  return withUser(userId, async (tx) => {
    const r = await tx.query<EventRow>(
      `select e.id, e.name,
              to_char(e.starts_at at time zone 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI') as starts_at,
              to_char(e.ends_at   at time zone 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI') as ends_at,
              e.setup_minutes, e.teardown_minutes, e.expected_guest_count,
              coalesce((
                select jsonb_agg(jsonb_build_object('booking_id', sb.id, 'space_id', sb.space_id, 'venue', v.name, 'space', vs.name)
                                 order by v.name, vs.name)
                  from space_bookings sb
                  join venue_spaces vs on vs.id = sb.space_id
                  join venues v on v.id = vs.venue_id
                 where sb.event_id = e.id), '[]'::jsonb) as spaces
         from events e
        where e.project_id = $1
        order by e.starts_at asc`,
      [projectId],
    )
    return r.rows
  })
}

/** Edit a ceremony's details (not its time — that goes through rescheduleEvent). */
export async function editEvent(
  userId: string,
  input: {
    eventId: string
    name: string
    guestCount?: number | null
    setupMinutes: number
    teardownMinutes: number
  },
): Promise<void> {
  await withUser(userId, async (tx) => {
    await tx.query(
      `update events
          set name = $2, expected_guest_count = $3, setup_minutes = $4, teardown_minutes = $5
        where id = $1`,
      [input.eventId, input.name, input.guestCount ?? null, input.setupMinutes, input.teardownMinutes],
    )
  })
}

/** Delete a ceremony. Blocked by trigger if it has accepted vendor commitments. */
export async function deleteEvent(userId: string, eventId: string): Promise<void> {
  await withUser(userId, async (tx) => {
    await tx.query('delete from events where id = $1', [eventId])
  })
}

/**
 * Replace the set of spaces a ceremony occupies (FR-081 multi-space). Overlap is
 * checked per space on insert; aggregate capacity is checked once at commit.
 */
export async function setEventSpaces(
  userId: string,
  input: { eventId: string; spaceIds: string[] },
): Promise<void> {
  await withUser(userId, async (tx) => {
    await tx.query('delete from space_bookings where event_id = $1', [input.eventId])
    if (input.spaceIds.length > 0) {
      await tx.query(
        `insert into space_bookings (event_id, space_id, setup_start, teardown_end)
         select e.id, s.space_id,
                e.starts_at - make_interval(mins => e.setup_minutes),
                e.ends_at   + make_interval(mins => e.teardown_minutes)
           from events e, unnest($2::uuid[]) as s(space_id)
          where e.id = $1`,
        [input.eventId, input.spaceIds],
      )
    }
  })
}

// ---- the headline write: schedule a ceremony into a space ------------------

export interface ScheduleInput {
  projectId: string
  name: string
  /** ISO timestamps (with offset), e.g. 2026-12-05T08:00:00+05:30 */
  startsAt: string
  endsAt: string
  setupMinutes: number
  teardownMinutes: number
  guestCount?: number | null
  /** optional — if given, the ceremony is booked into this space (overlap-checked) */
  spaceId?: string | null
}

/**
 * Create a ceremony and (optionally) book it into a space, atomically. If the
 * space is already taken for the setup→teardown window the EXCLUDE constraint
 * raises 23P01 and the whole transaction — event included — rolls back.
 */
export async function scheduleEvent(
  userId: string,
  input: ScheduleInput,
): Promise<{ id: string }> {
  return withUser(userId, async (tx) => {
    const ev = await tx.query<{ id: string }>(
      `insert into events
         (project_id, name, starts_at, ends_at, setup_minutes, teardown_minutes,
          expected_guest_count, primary_owner_id)
       values ($1, $2, $3::timestamptz, $4::timestamptz, $5, $6, $7, auth.uid())
       returning id`,
      [
        input.projectId,
        input.name,
        input.startsAt,
        input.endsAt,
        input.setupMinutes,
        input.teardownMinutes,
        input.guestCount ?? null,
      ],
    )
    const eventId = ev.rows[0].id

    if (input.spaceId) {
      await tx.query(
        `insert into space_bookings (event_id, space_id, setup_start, teardown_end)
         values ($1, $2,
                 $3::timestamptz - make_interval(mins => $5),
                 $4::timestamptz + make_interval(mins => $6))`,
        [eventId, input.spaceId, input.startsAt, input.endsAt, input.setupMinutes, input.teardownMinutes],
      )
    }
    return { id: eventId }
  })
}
