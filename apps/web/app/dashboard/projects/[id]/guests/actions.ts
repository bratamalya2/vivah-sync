'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { getUser } from '@/lib/auth'
import {
  createParty,
  deleteParty,
  updatePartyContact,
  addGuest,
  updateGuest,
  deleteGuest,
  setPartyInvites,
} from '@vivahsync/db'
import { translateDbError } from '@vivahsync/core'

function base(projectId: string) {
  return `/dashboard/projects/${projectId}/guests`
}
async function reqUser() {
  const u = await getUser()
  if (!u) redirect('/login')
  return u
}
const enc = encodeURIComponent

export async function createPartyAction(formData: FormData): Promise<void> {
  const user = await reqUser()
  const projectId = String(formData.get('projectId') ?? '')
  const name = String(formData.get('name') ?? '').trim()
  if (!name) redirect(`${base(projectId)}?err=${enc('A party / family name is required.')}`)

  let target: string
  try {
    const p = await createParty(user.id, {
      projectId,
      name,
      contactName: String(formData.get('contactName') ?? '').trim() || null,
      contactPhone: String(formData.get('contactPhone') ?? '').trim() || null,
      contactEmail: String(formData.get('contactEmail') ?? '').trim() || null,
      plusOnesAllowed: Number(formData.get('plusOnesAllowed') ?? '0') || 0,
    })
    target = `${base(projectId)}/${p.id}?msg=${enc('Party added — share their RSVP link.')}`
  } catch (e) {
    target = `${base(projectId)}?err=${enc(translateDbError(e)?.message ?? 'Could not add the party.')}`
  }
  revalidatePath(base(projectId))
  redirect(target)
}

export async function updateContactAction(formData: FormData): Promise<void> {
  const user = await reqUser()
  const projectId = String(formData.get('projectId') ?? '')
  const partyId = String(formData.get('partyId') ?? '')
  await updatePartyContact(user.id, {
    partyId,
    name: String(formData.get('name') ?? '').trim(),
    contactName: String(formData.get('contactName') ?? '').trim() || null,
    contactPhone: String(formData.get('contactPhone') ?? '').trim() || null,
    contactEmail: String(formData.get('contactEmail') ?? '').trim() || null,
    plusOnesAllowed: Number(formData.get('plusOnesAllowed') ?? '0') || 0,
  }).catch(() => {})
  revalidatePath(`${base(projectId)}/${partyId}`)
  redirect(`${base(projectId)}/${partyId}?msg=${enc('Party updated.')}`)
}

export async function deletePartyAction(formData: FormData): Promise<void> {
  const user = await reqUser()
  const projectId = String(formData.get('projectId') ?? '')
  const partyId = String(formData.get('partyId') ?? '')
  await deleteParty(user.id, partyId).catch(() => {})
  revalidatePath(base(projectId))
  redirect(`${base(projectId)}?msg=${enc('Party removed.')}`)
}

export async function addGuestAction(formData: FormData): Promise<void> {
  const user = await reqUser()
  const projectId = String(formData.get('projectId') ?? '')
  const partyId = String(formData.get('partyId') ?? '')
  const name = String(formData.get('name') ?? '').trim()
  if (name) {
    await addGuest(user.id, { partyId, name, isChild: String(formData.get('isChild') ?? '') === 'on' }).catch(() => {})
  }
  revalidatePath(`${base(projectId)}/${partyId}`)
  redirect(`${base(projectId)}/${partyId}`)
}

export async function updateGuestAction(formData: FormData): Promise<void> {
  const user = await reqUser()
  const projectId = String(formData.get('projectId') ?? '')
  const partyId = String(formData.get('partyId') ?? '')
  const guestId = String(formData.get('guestId') ?? '')
  await updateGuest(user.id, {
    guestId,
    name: String(formData.get('name') ?? '').trim(),
    isChild: String(formData.get('isChild') ?? '') === 'on',
    dietary: String(formData.get('dietary') ?? '').trim() || null,
    assistance: String(formData.get('assistance') ?? '').trim() || null,
  }).catch(() => {})
  revalidatePath(`${base(projectId)}/${partyId}`)
  redirect(`${base(projectId)}/${partyId}?msg=${enc('Guest updated.')}`)
}

export async function deleteGuestAction(formData: FormData): Promise<void> {
  const user = await reqUser()
  const projectId = String(formData.get('projectId') ?? '')
  const partyId = String(formData.get('partyId') ?? '')
  await deleteGuest(user.id, String(formData.get('guestId') ?? '')).catch(() => {})
  revalidatePath(`${base(projectId)}/${partyId}`)
  redirect(`${base(projectId)}/${partyId}`)
}

export async function setInvitesAction(formData: FormData): Promise<void> {
  const user = await reqUser()
  const projectId = String(formData.get('projectId') ?? '')
  const partyId = String(formData.get('partyId') ?? '')
  const eventIds = formData.getAll('eventId').map((v) => String(v)).filter(Boolean)
  await setPartyInvites(user.id, { partyId, eventIds }).catch(() => {})
  revalidatePath(`${base(projectId)}/${partyId}`)
  redirect(`${base(projectId)}/${partyId}?msg=${enc('Invites updated.')}`)
}
