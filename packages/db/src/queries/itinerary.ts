// Personalized digital itinerary — a public, no-login page keyed on the party's
// rsvp_token (same token used for RSVP). Reads only rows belonging to that
// party: the ceremonies they're invited to (with their YES/NO/MAYBE per event),
// their travel legs, and their hotel rooms. Uses withSystem because the guest
// has no auth session; the token IS the authorization.

import { withSystem } from '../withUser.js'

const TOKEN_RE = /^[0-9a-f-]{36}$/i

export interface ItineraryEvent {
  id: string
  name: string
  starts: string
  venue: string | null
  status: string // aggregate for the party: YES if anyone yes, else best of MAYBE/NO/PENDING
}
export interface ItineraryTravel {
  direction: string
  mode: string
  carrier_number: string | null
  scheduled: string
  location: string | null
  hotel: string | null
  status: string
  driver_name: string | null
  driver_phone: string | null
  vehicle: string | null
}
export interface ItineraryRoom {
  hotel_name: string
  room_type: string
  room_number: string | null
  check_in_date: string | null
  check_out_date: string | null
  status: string
}
export interface Itinerary {
  party: { id: string; name: string; token: string }
  project: { name: string; city: string | null }
  events: ItineraryEvent[]
  travel: ItineraryTravel[]
  rooms: ItineraryRoom[]
}

export async function loadItinerary(token: string): Promise<Itinerary | null> {
  if (!TOKEN_RE.test(token)) return null
  return withSystem(async (tx) => {
    const p = await tx.query<{ id: string; name: string; project_name: string; city: string | null }>(
      `select gp.id, gp.name, pr.name as project_name, pr.city
         from guest_parties gp join projects pr on pr.id = gp.project_id
        where gp.rsvp_token = $1`,
      [token],
    )
    if (p.rows.length === 0) return null
    const party = p.rows[0]

    const events = await tx.query<ItineraryEvent>(
      `select e.id, e.name,
              to_char(e.starts_at at time zone 'Asia/Kolkata', 'Dy DD Mon · HH24:MI') as starts,
              (select string_agg(distinct sp.name, ', ') from space_bookings sb
                 join venue_spaces sp on sp.id = sb.space_id where sb.event_id = e.id) as venue,
              coalesce(
                (select case
                          when bool_or(r.status = 'YES') then 'YES'
                          when bool_or(r.status = 'MAYBE') then 'MAYBE'
                          when bool_or(r.status = 'NO') then 'NO'
                          else 'PENDING' end
                   from guests g join guest_rsvps r on r.guest_id = g.id
                  where g.party_id = $1 and r.event_id = e.id),
                'PENDING') as status
         from party_event_invites pei
         join events e on e.id = pei.event_id
        where pei.party_id = $1
        order by e.starts_at`,
      [party.id],
    )

    const travel = await tx.query<ItineraryTravel>(
      `select direction::text as direction, mode::text as mode, carrier_number,
              to_char(scheduled_at at time zone 'Asia/Kolkata', 'Dy DD Mon · HH24:MI') as scheduled,
              location, hotel, status::text as status, driver_name, driver_phone, vehicle
         from guest_travel where party_id = $1 order by scheduled_at`,
      [party.id],
    )

    const rooms = await tx.query<ItineraryRoom>(
      `select h.name as hotel_name, a.room_type, a.room_number,
              to_char(a.check_in_date, 'DD Mon') as check_in_date,
              to_char(a.check_out_date, 'DD Mon') as check_out_date,
              a.status::text as status
         from room_allocations a join hotels h on h.id = a.hotel_id
        where a.party_id = $1 and a.status <> 'CANCELLED'
        order by h.name`,
      [party.id],
    )

    return {
      party: { id: party.id, name: party.name, token },
      project: { name: party.project_name, city: party.city },
      events: events.rows,
      travel: travel.rows,
      rooms: rooms.rows,
    }
  })
}
