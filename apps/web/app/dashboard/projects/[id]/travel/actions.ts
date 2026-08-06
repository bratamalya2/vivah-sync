'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { getUser } from '@/lib/auth'
import { addTravel, updateTravelStatus, setDispatch, deleteTravel } from '@vivahsync/db'

function base(projectId: string) {
  return `/dashboard/projects/${projectId}/travel`
}
async function reqUser() {
  const u = await getUser()
  if (!u) redirect('/login')
  return u
}
const enc = encodeURIComponent

export async function addTravelAction(formData: FormData): Promise<void> {
  const user = await reqUser()
  const projectId = String(formData.get('projectId') ?? '')
  const partyId = String(formData.get('partyId') ?? '')
  const date = String(formData.get('date') ?? '')
  const time = String(formData.get('time') ?? '')
  if (!partyId || !date || !time) {
    redirect(`${base(projectId)}?err=${enc('Party, date and time are required.')}`)
  }
  await addTravel(user.id, {
    partyId,
    direction: String(formData.get('direction') ?? 'ARRIVAL') === 'DEPARTURE' ? 'DEPARTURE' : 'ARRIVAL',
    mode: (['FLIGHT', 'TRAIN', 'CAR', 'OTHER'].includes(String(formData.get('mode'))) ? String(formData.get('mode')) : 'FLIGHT') as 'FLIGHT',
    carrierNumber: String(formData.get('carrierNumber') ?? '').trim() || null,
    scheduledAt: `${date}T${time}:00+05:30`,
    location: String(formData.get('location') ?? '').trim() || null,
    hotel: String(formData.get('hotel') ?? '').trim() || null,
    headcount: Number(formData.get('headcount') ?? '1') || 1,
  }).catch(() => {})
  revalidatePath(base(projectId))
  redirect(`${base(projectId)}?msg=${enc('Travel leg added.')}`)
}

export async function travelStatusAction(formData: FormData): Promise<void> {
  const user = await reqUser()
  const projectId = String(formData.get('projectId') ?? '')
  await updateTravelStatus(user.id, {
    id: String(formData.get('id') ?? ''),
    status: String(formData.get('status') ?? 'SCHEDULED'),
    delayNote: String(formData.get('delayNote') ?? '').trim() || null,
  }).catch(() => {})
  revalidatePath(base(projectId))
  redirect(base(projectId))
}

export async function dispatchAction(formData: FormData): Promise<void> {
  const user = await reqUser()
  const projectId = String(formData.get('projectId') ?? '')
  await setDispatch(user.id, {
    id: String(formData.get('id') ?? ''),
    driverName: String(formData.get('driverName') ?? '').trim() || null,
    driverPhone: String(formData.get('driverPhone') ?? '').trim() || null,
    vehicle: String(formData.get('vehicle') ?? '').trim() || null,
  }).catch(() => {})
  revalidatePath(base(projectId))
  redirect(`${base(projectId)}?msg=${enc('Dispatch updated.')}`)
}

export async function deleteTravelAction(formData: FormData): Promise<void> {
  const user = await reqUser()
  const projectId = String(formData.get('projectId') ?? '')
  await deleteTravel(user.id, String(formData.get('id') ?? '')).catch(() => {})
  revalidatePath(base(projectId))
  redirect(base(projectId))
}
