// Guest travel manifest + fleet dispatch. Scoped to the project via the party.
// Live carrier tracking is manual (status + delay note) — an external API can
// update the same rows later.

import { withUser } from '../withUser.js'

export interface TravelRow {
  id: string
  party_id: string
  party_name: string
  direction: string
  mode: string
  carrier_number: string | null
  scheduled: string
  window: string
  location: string | null
  hotel: string | null
  headcount: number
  status: string
  delay_note: string | null
  driver_name: string | null
  driver_phone: string | null
  vehicle: string | null
}

export async function listProjectTravel(userId: string, projectId: string): Promise<TravelRow[]> {
  return withUser(userId, async (tx) => {
    const ist = `(gt.scheduled_at at time zone 'Asia/Kolkata')`
    const r = await tx.query<TravelRow>(
      `select gt.id, gt.party_id, gp.name as party_name, gt.direction::text as direction,
              gt.mode::text as mode, gt.carrier_number,
              to_char(${ist}, 'Dy DD Mon · HH24:MI') as scheduled,
              to_char(date_trunc('hour', ${ist}) + (floor(extract(minute from ${ist}) / 30) * interval '30 minutes'), 'Dy DD Mon · HH24:MI') as window,
              gt.location, gt.hotel, gt.headcount, gt.status::text as status, gt.delay_note,
              gt.driver_name, gt.driver_phone, gt.vehicle
         from guest_travel gt join guest_parties gp on gp.id = gt.party_id
        where gp.project_id = $1
        order by gt.direction, gt.scheduled_at`,
      [projectId],
    )
    return r.rows
  })
}

export async function addTravel(
  userId: string,
  input: {
    partyId: string
    direction: 'ARRIVAL' | 'DEPARTURE'
    mode: 'FLIGHT' | 'TRAIN' | 'CAR' | 'OTHER'
    carrierNumber: string | null
    scheduledAt: string
    location: string | null
    hotel: string | null
    headcount: number
  },
): Promise<void> {
  await withUser(userId, async (tx) => {
    await tx.query(
      `insert into guest_travel (party_id, direction, mode, carrier_number, scheduled_at, location, hotel, headcount)
       values ($1, $2::travel_direction, $3::travel_mode, $4, $5::timestamptz, $6, $7, $8)`,
      [input.partyId, input.direction, input.mode, input.carrierNumber, input.scheduledAt, input.location, input.hotel, input.headcount],
    )
  })
}

export async function updateTravelStatus(
  userId: string,
  input: { id: string; status: string; delayNote: string | null },
): Promise<void> {
  await withUser(userId, async (tx) => {
    await tx.query(`update guest_travel set status = $2::travel_status, delay_note = $3 where id = $1`, [
      input.id,
      input.status,
      input.delayNote,
    ])
  })
}

export async function setDispatch(
  userId: string,
  input: { id: string; driverName: string | null; driverPhone: string | null; vehicle: string | null },
): Promise<void> {
  await withUser(userId, async (tx) => {
    await tx.query(`update guest_travel set driver_name = $2, driver_phone = $3, vehicle = $4 where id = $1`, [
      input.id,
      input.driverName,
      input.driverPhone,
      input.vehicle,
    ])
  })
}

export async function deleteTravel(userId: string, id: string): Promise<void> {
  await withUser(userId, async (tx) => {
    await tx.query(`delete from guest_travel where id = $1`, [id])
  })
}
