// Guest hospitality — parties, guests, per-sub-event RSVP. The planner side is
// RLS-scoped (withUser); the public RSVP page has no login and reads/writes
// strictly through the party's opaque token (withSystem, token-scoped).

import { withUser, withSystem } from '../withUser.js'

export type RsvpStatus = 'PENDING' | 'YES' | 'NO' | 'MAYBE'

export interface PartyRow {
  id: string
  name: string
  contact_name: string | null
  contact_phone: string | null
  rsvp_token: string
  submitted: boolean
  guests: number
  attending: number
  invited_events: number
}
export interface GuestRow {
  id: string
  name: string
  is_child: boolean
  is_plus_one: boolean
  dietary: string | null
  assistance: string | null
}
export interface RsvpEvent {
  id: string
  name: string
  when: string
}
export interface PartyDetail {
  id: string
  project_id: string
  name: string
  contact_name: string | null
  contact_phone: string | null
  contact_email: string | null
  plus_ones_allowed: number
  rsvp_token: string
  submitted: boolean
  guests: GuestRow[]
  invited: RsvpEvent[]
  allEvents: RsvpEvent[]
  rsvps: { guest_id: string; event_id: string; status: RsvpStatus }[]
}

// ---- planner side -----------------------------------------------------------

export async function createParty(
  userId: string,
  input: {
    projectId: string
    name: string
    contactName?: string | null
    contactPhone?: string | null
    contactEmail?: string | null
    plusOnesAllowed?: number
  },
): Promise<{ id: string; token: string }> {
  return withUser(userId, async (tx) => {
    const p = await tx.query<{ id: string; rsvp_token: string }>(
      `insert into guest_parties (project_id, name, contact_name, contact_phone, contact_email, plus_ones_allowed)
       values ($1, $2, $3, $4, $5, $6) returning id, rsvp_token`,
      [input.projectId, input.name, input.contactName ?? null, input.contactPhone ?? null, input.contactEmail ?? null, input.plusOnesAllowed ?? 0],
    )
    const id = p.rows[0].id
    // invite the whole household to every ceremony by default; the planner can trim
    await tx.query(
      `insert into party_event_invites (party_id, event_id) select $1, id from events where project_id = $2`,
      [id, input.projectId],
    )
    // one primary guest to start from (the contact)
    await tx.query(`insert into guests (party_id, name) values ($1, $2)`, [id, input.contactName?.trim() || input.name])
    return { id, token: p.rows[0].rsvp_token }
  })
}

export async function listProjectParties(userId: string, projectId: string): Promise<PartyRow[]> {
  return withUser(userId, async (tx) => {
    const r = await tx.query<PartyRow>(
      `select gp.id, gp.name, gp.contact_name, gp.contact_phone, gp.rsvp_token,
              (gp.rsvp_submitted_at is not null) as submitted,
              (select count(*)::int from guests g where g.party_id = gp.id) as guests,
              (select count(*)::int from guest_rsvps gr
                 join guests g on g.id = gr.guest_id
                where g.party_id = gp.id and gr.status = 'YES') as attending,
              (select count(*)::int from party_event_invites pi where pi.party_id = gp.id) as invited_events
         from guest_parties gp
        where gp.project_id = $1
        order by gp.created_at asc`,
      [projectId],
    )
    return r.rows
  })
}

export async function getParty(userId: string, partyId: string): Promise<PartyDetail | null> {
  return withUser(userId, async (tx) => {
    const p = await tx.query<Omit<PartyDetail, 'guests' | 'invited' | 'allEvents' | 'rsvps' | 'submitted'> & { submitted: boolean }>(
      `select gp.id, gp.project_id, gp.name, gp.contact_name, gp.contact_phone, gp.contact_email,
              gp.plus_ones_allowed, gp.rsvp_token, (gp.rsvp_submitted_at is not null) as submitted
         from guest_parties gp where gp.id = $1`,
      [partyId],
    )
    if (p.rows.length === 0) return null
    const projectId = p.rows[0].project_id
    const guests = await tx.query<GuestRow>(
      `select id, name, is_child, is_plus_one, dietary, assistance from guests where party_id = $1 order by sort_order, created_at`,
      [partyId],
    )
    const evLine = `to_char(e.starts_at at time zone 'Asia/Kolkata', 'Dy DD Mon · HH24:MI')`
    const invited = await tx.query<RsvpEvent>(
      `select e.id, e.name, ${evLine} as when
         from party_event_invites pi join events e on e.id = pi.event_id
        where pi.party_id = $1 order by e.starts_at`,
      [partyId],
    )
    const allEvents = await tx.query<RsvpEvent>(
      `select e.id, e.name, ${evLine} as when from events e where e.project_id = $1 order by e.starts_at`,
      [projectId],
    )
    const rsvps = await tx.query<{ guest_id: string; event_id: string; status: RsvpStatus }>(
      `select gr.guest_id, gr.event_id, gr.status::text as status
         from guest_rsvps gr join guests g on g.id = gr.guest_id where g.party_id = $1`,
      [partyId],
    )
    return { ...p.rows[0], guests: guests.rows, invited: invited.rows, allEvents: allEvents.rows, rsvps: rsvps.rows }
  })
}

export async function addGuest(userId: string, input: { partyId: string; name: string; isChild?: boolean }): Promise<void> {
  await withUser(userId, async (tx) => {
    await tx.query(`insert into guests (party_id, name, is_child) values ($1, $2, $3)`, [
      input.partyId,
      input.name,
      input.isChild ?? false,
    ])
  })
}

export async function updateGuest(
  userId: string,
  input: { guestId: string; name: string; isChild: boolean; dietary: string | null; assistance: string | null },
): Promise<void> {
  await withUser(userId, async (tx) => {
    await tx.query(`update guests set name = $2, is_child = $3, dietary = $4, assistance = $5 where id = $1`, [
      input.guestId,
      input.name,
      input.isChild,
      input.dietary,
      input.assistance,
    ])
  })
}

export async function deleteGuest(userId: string, guestId: string): Promise<void> {
  await withUser(userId, async (tx) => {
    await tx.query(`delete from guests where id = $1`, [guestId])
  })
}

export async function setPartyInvites(userId: string, input: { partyId: string; eventIds: string[] }): Promise<void> {
  await withUser(userId, async (tx) => {
    await tx.query(`delete from party_event_invites where party_id = $1 and not (event_id = any($2::uuid[]))`, [
      input.partyId,
      input.eventIds,
    ])
    for (const ev of input.eventIds) {
      await tx.query(
        `insert into party_event_invites (party_id, event_id) values ($1, $2) on conflict do nothing`,
        [input.partyId, ev],
      )
    }
  })
}

export async function updatePartyContact(
  userId: string,
  input: { partyId: string; name: string; contactName: string | null; contactPhone: string | null; contactEmail: string | null; plusOnesAllowed: number },
): Promise<void> {
  await withUser(userId, async (tx) => {
    await tx.query(
      `update guest_parties set name = $2, contact_name = $3, contact_phone = $4, contact_email = $5, plus_ones_allowed = $6 where id = $1`,
      [input.partyId, input.name, input.contactName, input.contactPhone, input.contactEmail, input.plusOnesAllowed],
    )
  })
}

export async function deleteParty(userId: string, partyId: string): Promise<void> {
  await withUser(userId, async (tx) => {
    await tx.query(`delete from guest_parties where id = $1`, [partyId])
  })
}

export interface GuestStats {
  parties: number
  submitted: number
  guests: number
  attendingHeads: number
  perEvent: { id: string; name: string; yes: number; no: number; maybe: number; pending: number }[]
  dietary: { guest: string; party: string; note: string }[]
  assistance: { guest: string; party: string; note: string }[]
}

export async function guestStats(userId: string, projectId: string): Promise<GuestStats> {
  return withUser(userId, async (tx) => {
    const head = await tx.query<{ parties: number; submitted: number; guests: number }>(
      `select
         (select count(*)::int from guest_parties where project_id = $1) as parties,
         (select count(*)::int from guest_parties where project_id = $1 and rsvp_submitted_at is not null) as submitted,
         (select count(*)::int from guests g join guest_parties gp on gp.id = g.party_id where gp.project_id = $1) as guests`,
      [projectId],
    )
    const perEvent = await tx.query<{ id: string; name: string; yes: number; no: number; maybe: number; pending: number }>(
      `select e.id, e.name,
              count(gr.*) filter (where gr.status = 'YES')::int as yes,
              count(gr.*) filter (where gr.status = 'NO')::int as no,
              count(gr.*) filter (where gr.status = 'MAYBE')::int as maybe,
              count(gr.*) filter (where gr.status = 'PENDING' or gr.status is null)::int as pending
         from events e
         left join guest_rsvps gr on gr.event_id = e.id
        where e.project_id = $1
        group by e.id, e.name, e.starts_at
        order by e.starts_at`,
      [projectId],
    )
    const attending = await tx.query<{ n: number }>(
      `select count(distinct gr.guest_id)::int as n from guest_rsvps gr
         join guests g on g.id = gr.guest_id join guest_parties gp on gp.id = g.party_id
        where gp.project_id = $1 and gr.status = 'YES'`,
      [projectId],
    )
    const dietary = await tx.query<{ guest: string; party: string; note: string }>(
      `select g.name as guest, gp.name as party, g.dietary as note from guests g join guest_parties gp on gp.id = g.party_id
        where gp.project_id = $1 and coalesce(trim(g.dietary), '') <> '' order by gp.name`,
      [projectId],
    )
    const assistance = await tx.query<{ guest: string; party: string; note: string }>(
      `select g.name as guest, gp.name as party, g.assistance as note from guests g join guest_parties gp on gp.id = g.party_id
        where gp.project_id = $1 and coalesce(trim(g.assistance), '') <> '' order by gp.name`,
      [projectId],
    )
    return {
      parties: head.rows[0].parties,
      submitted: head.rows[0].submitted,
      guests: head.rows[0].guests,
      attendingHeads: attending.rows[0].n,
      perEvent: perEvent.rows,
      dietary: dietary.rows,
      assistance: assistance.rows,
    }
  })
}

// ---- public RSVP (token-scoped, no login) -----------------------------------

export interface RsvpLoad {
  party: { id: string; name: string; plus_ones_allowed: number; submitted: boolean; project_name: string; city: string }
  events: RsvpEvent[]
  guests: GuestRow[]
  rsvps: { guest_id: string; event_id: string; status: RsvpStatus }[]
}
export interface RsvpGuestInput {
  id: string | null
  name: string
  isChild: boolean
  isPlusOne: boolean
  dietary: string | null
  assistance: string | null
  rsvps: { eventId: string; status: RsvpStatus }[]
}

/** Load a party's RSVP by its public token (no auth). Returns null for an unknown token. */
export async function loadRsvp(token: string): Promise<RsvpLoad | null> {
  if (!/^[0-9a-f-]{36}$/i.test(token)) return null
  return withSystem(async (tx) => {
    const p = await tx.query<RsvpLoad['party']>(
      `select gp.id, gp.name, gp.plus_ones_allowed, (gp.rsvp_submitted_at is not null) as submitted,
              pr.name as project_name, pr.city
         from guest_parties gp join projects pr on pr.id = gp.project_id
        where gp.rsvp_token = $1`,
      [token],
    )
    if (p.rows.length === 0) return null
    const partyId = p.rows[0].id
    const events = await tx.query<RsvpEvent>(
      `select e.id, e.name, to_char(e.starts_at at time zone 'Asia/Kolkata', 'Dy DD Mon · HH24:MI') as when
         from party_event_invites pi join events e on e.id = pi.event_id
        where pi.party_id = $1 order by e.starts_at`,
      [partyId],
    )
    const guests = await tx.query<GuestRow>(
      `select id, name, is_child, is_plus_one, dietary, assistance from guests where party_id = $1 order by sort_order, created_at`,
      [partyId],
    )
    const rsvps = await tx.query<{ guest_id: string; event_id: string; status: RsvpStatus }>(
      `select gr.guest_id, gr.event_id, gr.status::text as status
         from guest_rsvps gr join guests g on g.id = gr.guest_id where g.party_id = $1`,
      [partyId],
    )
    return { party: p.rows[0], events: events.rows, guests: guests.rows, rsvps: rsvps.rows }
  })
}

/** Submit a household's RSVP by token (no auth). Token-scoped; tampered ids are ignored. */
export async function submitRsvp(token: string, guests: RsvpGuestInput[]): Promise<{ ok: boolean; error?: string }> {
  if (!/^[0-9a-f-]{36}$/i.test(token)) return { ok: false, error: 'This RSVP link is not valid.' }
  return withSystem(async (tx) => {
    const p = await tx.query<{ id: string; plus_ones_allowed: number }>(
      `select id, plus_ones_allowed from guest_parties where rsvp_token = $1`,
      [token],
    )
    if (p.rows.length === 0) return { ok: false, error: 'This RSVP link is not valid.' }
    const partyId = p.rows[0].id
    const invited = new Set(
      (await tx.query<{ event_id: string }>(`select event_id from party_event_invites where party_id = $1`, [partyId])).rows.map((r) => r.event_id),
    )
    const existing = new Set(
      (await tx.query<{ id: string }>(`select id from guests where party_id = $1`, [partyId])).rows.map((r) => r.id),
    )
    const newAdds = guests.filter((g) => !g.id).length
    if (newAdds > p.rows[0].plus_ones_allowed) {
      return { ok: false, error: `You can add at most ${p.rows[0].plus_ones_allowed} extra guest(s).` }
    }

    for (const g of guests) {
      const name = g.name.trim()
      if (!name) continue
      let gid = g.id
      if (gid && existing.has(gid)) {
        await tx.query(`update guests set name = $2, is_child = $3, dietary = $4, assistance = $5 where id = $1 and party_id = $6`, [
          gid, name, g.isChild, g.dietary || null, g.assistance || null, partyId,
        ])
      } else if (!gid) {
        const r = await tx.query<{ id: string }>(
          `insert into guests (party_id, name, is_child, is_plus_one, dietary, assistance) values ($1,$2,$3,$4,$5,$6) returning id`,
          [partyId, name, g.isChild, g.isPlusOne, g.dietary || null, g.assistance || null],
        )
        gid = r.rows[0].id
      } else {
        continue // an id that isn't in this party — ignore
      }
      for (const rv of g.rsvps) {
        if (!invited.has(rv.eventId)) continue
        await tx.query(
          `insert into guest_rsvps (guest_id, event_id, status, responded_at) values ($1,$2,$3::rsvp_status, now())
           on conflict (guest_id, event_id) do update set status = excluded.status, responded_at = now()`,
          [gid, rv.eventId, rv.status],
        )
      }
    }
    await tx.query(`update guest_parties set rsvp_submitted_at = now() where id = $1`, [partyId])
    return { ok: true }
  })
}
