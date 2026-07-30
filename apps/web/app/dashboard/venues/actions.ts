'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { getUser } from '@/lib/auth'
import { getMyContext, createVenue, createSpace } from '@vivahsync/db'
import { translateDbError } from '@vivahsync/core'

export type FormState = { error?: string; ok?: boolean } | null

export async function addVenue(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getUser()
  if (!user) redirect('/login')
  const ctx = await getMyContext(user.id)
  if (!ctx.org) redirect('/onboarding')

  const name = String(formData.get('name') ?? '').trim()
  if (!name) return { error: 'Venue name is required.' }

  try {
    await createVenue(user.id, {
      ownerOrgId: ctx.org.id,
      name,
      address: String(formData.get('address') ?? '').trim() || null,
      contactName: String(formData.get('contactName') ?? '').trim() || null,
      contactPhone: String(formData.get('contactPhone') ?? '').trim() || null,
    })
  } catch (e) {
    return { error: translateDbError(e)?.message ?? 'Could not add the venue.' }
  }
  revalidatePath('/dashboard/venues')
  return { ok: true }
}

export async function addSpace(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getUser()
  if (!user) redirect('/login')

  const venueId = String(formData.get('venueId') ?? '')
  const name = String(formData.get('name') ?? '').trim()
  if (!venueId || !name) return { error: 'Pick a venue and enter a space name.' }

  const comfortRaw = String(formData.get('comfortCapacity') ?? '').trim()
  const legalRaw = String(formData.get('legalMaxCapacity') ?? '').trim()
  const comfortCapacity = comfortRaw ? Number(comfortRaw) : null
  const legalMaxCapacity = legalRaw ? Number(legalRaw) : null
  if (comfortCapacity !== null && (!Number.isFinite(comfortCapacity) || comfortCapacity < 0)) {
    return { error: 'Comfortable capacity must be a positive number.' }
  }
  if (legalMaxCapacity !== null && (!Number.isFinite(legalMaxCapacity) || legalMaxCapacity < 0)) {
    return { error: 'Legal maximum must be a positive number.' }
  }

  try {
    await createSpace(user.id, { venueId, name, comfortCapacity, legalMaxCapacity })
  } catch (e) {
    return { error: translateDbError(e)?.message ?? 'Could not add the space.' }
  }
  revalidatePath('/dashboard/venues')
  return { ok: true }
}
