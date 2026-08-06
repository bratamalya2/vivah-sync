// Hotel room blocks, per-party allocations, the front-desk check-in/out
// console, and welcome-kit tracking. All scoped to the project via the hotel.

import { withUser } from '../withUser.js'

export interface RoomBlock {
  id: string
  room_type: string
  total_rooms: number
  rate: string
  allocated: number
  available: number
}
export interface HotelMatrix {
  id: string
  name: string
  address: string | null
  phone: string | null
  blocks: RoomBlock[]
  totalRooms: number
  allocated: number
}
export interface AllocationRow {
  id: string
  hotel_id: string
  hotel_name: string
  party_id: string
  party_name: string
  room_type: string
  room_number: string | null
  occupancy: number
  check_in_date: string | null
  check_out_date: string | null
  status: string
  key_handed: boolean
  welcome_kit: boolean
  notes: string | null
}
export interface HotelStats {
  hotels: number
  roomsBlocked: number
  roomsAllocated: number
  inHouse: number
  kitsPending: number
}

export async function createHotel(
  userId: string,
  input: { projectId: string; name: string; address: string | null; phone: string | null },
): Promise<string> {
  return withUser(userId, async (tx) => {
    const r = await tx.query<{ id: string }>(
      `insert into hotels (project_id, name, address, phone) values ($1, $2, $3, $4) returning id`,
      [input.projectId, input.name, input.address, input.phone],
    )
    return r.rows[0].id
  })
}

export async function addRoomBlock(
  userId: string,
  input: { hotelId: string; roomType: string; totalRooms: number; rate: number },
): Promise<void> {
  await withUser(userId, async (tx) => {
    await tx.query(`insert into room_blocks (hotel_id, room_type, total_rooms, rate) values ($1, $2, $3, $4)`, [
      input.hotelId,
      input.roomType,
      input.totalRooms,
      input.rate,
    ])
  })
}

export async function deleteRoomBlock(userId: string, id: string): Promise<void> {
  await withUser(userId, async (tx) => {
    await tx.query(`delete from room_blocks where id = $1`, [id])
  })
}

export async function deleteHotel(userId: string, id: string): Promise<void> {
  await withUser(userId, async (tx) => {
    await tx.query(`delete from hotels where id = $1`, [id])
  })
}

/** Hotels with per-room-type totals and how many rooms of that type are already
 *  allocated (excludes cancelled stays) → the room-block availability matrix. */
export async function listHotelsMatrix(userId: string, projectId: string): Promise<HotelMatrix[]> {
  return withUser(userId, async (tx) => {
    const r = await tx.query<{
      id: string
      name: string
      address: string | null
      phone: string | null
      block_id: string | null
      room_type: string | null
      total_rooms: number | null
      rate: string | null
      allocated: number | null
    }>(
      `select h.id, h.name, h.address, h.phone,
              b.id as block_id, b.room_type, b.total_rooms, b.rate,
              (select count(*) from room_allocations a
                 where a.hotel_id = h.id and a.room_type = b.room_type and a.status <> 'CANCELLED') as allocated
         from hotels h
         left join room_blocks b on b.hotel_id = h.id
        where h.project_id = $1
        order by h.name, b.room_type`,
      [projectId],
    )
    const map = new Map<string, HotelMatrix>()
    for (const row of r.rows) {
      let h = map.get(row.id)
      if (!h) {
        h = { id: row.id, name: row.name, address: row.address, phone: row.phone, blocks: [], totalRooms: 0, allocated: 0 }
        map.set(row.id, h)
      }
      if (row.block_id) {
        const total = row.total_rooms ?? 0
        const allocated = Number(row.allocated ?? 0)
        h.blocks.push({
          id: row.block_id,
          room_type: row.room_type!,
          total_rooms: total,
          rate: row.rate ?? '0',
          allocated,
          available: Math.max(0, total - allocated),
        })
        h.totalRooms += total
        h.allocated += allocated
      }
    }
    return [...map.values()]
  })
}

export async function listAllocations(userId: string, projectId: string): Promise<AllocationRow[]> {
  return withUser(userId, async (tx) => {
    const r = await tx.query<AllocationRow>(
      `select a.id, a.hotel_id, h.name as hotel_name, a.party_id, gp.name as party_name,
              a.room_type, a.room_number, a.occupancy,
              to_char(a.check_in_date, 'DD Mon') as check_in_date,
              to_char(a.check_out_date, 'DD Mon') as check_out_date,
              a.status::text as status, a.key_handed, a.welcome_kit, a.notes
         from room_allocations a
         join hotels h on h.id = a.hotel_id
         join guest_parties gp on gp.id = a.party_id
        where h.project_id = $1
        order by h.name, gp.name`,
      [projectId],
    )
    return r.rows
  })
}

export async function allocateRoom(
  userId: string,
  input: {
    hotelId: string
    partyId: string
    roomType: string
    roomNumber: string | null
    occupancy: number
    checkInDate: string | null
    checkOutDate: string | null
    notes: string | null
  },
): Promise<void> {
  await withUser(userId, async (tx) => {
    await tx.query(
      `insert into room_allocations (hotel_id, party_id, room_type, room_number, occupancy, check_in_date, check_out_date, notes)
       values ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        input.hotelId,
        input.partyId,
        input.roomType,
        input.roomNumber,
        input.occupancy,
        input.checkInDate,
        input.checkOutDate,
        input.notes,
      ],
    )
  })
}

export async function setStayStatus(userId: string, input: { id: string; status: string }): Promise<void> {
  await withUser(userId, async (tx) => {
    // Handing a key implies the guest is in-house; keep the flag consistent.
    await tx.query(
      `update room_allocations
          set status = $2::stay_status,
              key_handed = case when $2 = 'CHECKED_IN' then true when $2 = 'CHECKED_OUT' then false else key_handed end
        where id = $1`,
      [input.id, input.status],
    )
  })
}

export async function setAllocationFlags(
  userId: string,
  input: { id: string; keyHanded?: boolean; welcomeKit?: boolean },
): Promise<void> {
  await withUser(userId, async (tx) => {
    if (input.keyHanded !== undefined) {
      await tx.query(`update room_allocations set key_handed = $2 where id = $1`, [input.id, input.keyHanded])
    }
    if (input.welcomeKit !== undefined) {
      await tx.query(`update room_allocations set welcome_kit = $2 where id = $1`, [input.id, input.welcomeKit])
    }
  })
}

export async function deleteAllocation(userId: string, id: string): Promise<void> {
  await withUser(userId, async (tx) => {
    await tx.query(`delete from room_allocations where id = $1`, [id])
  })
}

export async function hotelStats(userId: string, projectId: string): Promise<HotelStats> {
  return withUser(userId, async (tx) => {
    const r = await tx.query<{
      hotels: number
      rooms_blocked: number
      rooms_allocated: number
      in_house: number
      kits_pending: number
    }>(
      `select
         (select count(*) from hotels h where h.project_id = $1) as hotels,
         (select coalesce(sum(b.total_rooms), 0) from room_blocks b
            join hotels h on h.id = b.hotel_id where h.project_id = $1) as rooms_blocked,
         (select count(*) from room_allocations a
            join hotels h on h.id = a.hotel_id where h.project_id = $1 and a.status <> 'CANCELLED') as rooms_allocated,
         (select count(*) from room_allocations a
            join hotels h on h.id = a.hotel_id where h.project_id = $1 and a.status = 'CHECKED_IN') as in_house,
         (select count(*) from room_allocations a
            join hotels h on h.id = a.hotel_id
            where h.project_id = $1 and a.status <> 'CANCELLED' and a.welcome_kit = false) as kits_pending`,
      [projectId],
    )
    const row = r.rows[0]
    return {
      hotels: Number(row.hotels),
      roomsBlocked: Number(row.rooms_blocked),
      roomsAllocated: Number(row.rooms_allocated),
      inHouse: Number(row.in_house),
      kitsPending: Number(row.kits_pending),
    }
  })
}
