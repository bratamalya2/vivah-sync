'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { getUser } from '@/lib/auth'
import {
  createHotel,
  addRoomBlock,
  deleteRoomBlock,
  deleteHotel,
  allocateRoom,
  setStayStatus,
  setAllocationFlags,
  deleteAllocation,
} from '@vivahsync/db'

function base(projectId: string) {
  return `/dashboard/projects/${projectId}/hotels`
}
async function reqUser() {
  const u = await getUser()
  if (!u) redirect('/login')
  return u
}
const enc = encodeURIComponent

export async function createHotelAction(formData: FormData): Promise<void> {
  const user = await reqUser()
  const projectId = String(formData.get('projectId') ?? '')
  const name = String(formData.get('name') ?? '').trim()
  if (!name) redirect(`${base(projectId)}?err=${enc('Hotel name is required.')}`)
  await createHotel(user.id, {
    projectId,
    name,
    address: String(formData.get('address') ?? '').trim() || null,
    phone: String(formData.get('phone') ?? '').trim() || null,
  }).catch(() => {})
  revalidatePath(base(projectId))
  redirect(`${base(projectId)}?msg=${enc('Hotel added.')}`)
}

export async function addBlockAction(formData: FormData): Promise<void> {
  const user = await reqUser()
  const projectId = String(formData.get('projectId') ?? '')
  const roomType = String(formData.get('roomType') ?? '').trim()
  if (!roomType) redirect(`${base(projectId)}?err=${enc('Room type is required.')}`)
  await addRoomBlock(user.id, {
    hotelId: String(formData.get('hotelId') ?? ''),
    roomType,
    totalRooms: Math.max(0, Number(formData.get('totalRooms') ?? '0') || 0),
    rate: Math.max(0, Number(formData.get('rate') ?? '0') || 0),
  }).catch(() => {})
  revalidatePath(base(projectId))
  redirect(base(projectId))
}

export async function deleteBlockAction(formData: FormData): Promise<void> {
  const user = await reqUser()
  const projectId = String(formData.get('projectId') ?? '')
  await deleteRoomBlock(user.id, String(formData.get('id') ?? '')).catch(() => {})
  revalidatePath(base(projectId))
  redirect(base(projectId))
}

export async function deleteHotelAction(formData: FormData): Promise<void> {
  const user = await reqUser()
  const projectId = String(formData.get('projectId') ?? '')
  await deleteHotel(user.id, String(formData.get('id') ?? '')).catch(() => {})
  revalidatePath(base(projectId))
  redirect(base(projectId))
}

export async function allocateAction(formData: FormData): Promise<void> {
  const user = await reqUser()
  const projectId = String(formData.get('projectId') ?? '')
  const hotelId = String(formData.get('hotelId') ?? '')
  const partyId = String(formData.get('partyId') ?? '')
  const roomType = String(formData.get('roomType') ?? '').trim()
  if (!hotelId || !partyId || !roomType) {
    redirect(`${base(projectId)}?err=${enc('Hotel, party and room type are required.')}`)
  }
  await allocateRoom(user.id, {
    hotelId,
    partyId,
    roomType,
    roomNumber: String(formData.get('roomNumber') ?? '').trim() || null,
    occupancy: Math.max(1, Number(formData.get('occupancy') ?? '1') || 1),
    checkInDate: String(formData.get('checkInDate') ?? '') || null,
    checkOutDate: String(formData.get('checkOutDate') ?? '') || null,
    notes: String(formData.get('notes') ?? '').trim() || null,
  }).catch(() => {})
  revalidatePath(base(projectId))
  redirect(`${base(projectId)}?msg=${enc('Room allocated.')}`)
}

export async function stayStatusAction(formData: FormData): Promise<void> {
  const user = await reqUser()
  const projectId = String(formData.get('projectId') ?? '')
  await setStayStatus(user.id, {
    id: String(formData.get('id') ?? ''),
    status: String(formData.get('status') ?? 'RESERVED'),
  }).catch(() => {})
  revalidatePath(base(projectId))
  redirect(base(projectId))
}

export async function toggleKitAction(formData: FormData): Promise<void> {
  const user = await reqUser()
  const projectId = String(formData.get('projectId') ?? '')
  await setAllocationFlags(user.id, {
    id: String(formData.get('id') ?? ''),
    welcomeKit: String(formData.get('value') ?? '') === '1',
  }).catch(() => {})
  revalidatePath(base(projectId))
  redirect(base(projectId))
}

export async function toggleKeyAction(formData: FormData): Promise<void> {
  const user = await reqUser()
  const projectId = String(formData.get('projectId') ?? '')
  await setAllocationFlags(user.id, {
    id: String(formData.get('id') ?? ''),
    keyHanded: String(formData.get('value') ?? '') === '1',
  }).catch(() => {})
  revalidatePath(base(projectId))
  redirect(base(projectId))
}

export async function deleteAllocationAction(formData: FormData): Promise<void> {
  const user = await reqUser()
  const projectId = String(formData.get('projectId') ?? '')
  await deleteAllocation(user.id, String(formData.get('id') ?? '')).catch(() => {})
  revalidatePath(base(projectId))
  redirect(base(projectId))
}
