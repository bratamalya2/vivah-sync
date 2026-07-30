'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { getUser } from '@/lib/auth'
import {
  addRequirement,
  createBooking,
  transitionBooking,
  type VendorCategory,
  type BookingStatus,
} from '@vivahsync/db'
import { translateDbError } from '@vivahsync/core'

function base(projectId: string) {
  return `/dashboard/projects/${projectId}/vendors`
}

async function requireUser() {
  const user = await getUser()
  if (!user) redirect('/login')
  return user
}

export async function addRequirementAction(formData: FormData): Promise<void> {
  const user = await requireUser()
  const projectId = String(formData.get('projectId') ?? '')
  const eventId = String(formData.get('eventId') ?? '')
  const category = String(formData.get('category') ?? '') as VendorCategory
  const scopeNotes = String(formData.get('scopeNotes') ?? '').trim()
  const date = String(formData.get('date') ?? '')
  const arrivalTime = String(formData.get('arrivalTime') ?? '')
  const completionTime = String(formData.get('completionTime') ?? '')

  if (!eventId || !category || !scopeNotes || !date || !arrivalTime || !completionTime) {
    redirect(`${base(projectId)}?err=${encodeURIComponent('All requirement fields are required.')}`)
  }
  if (completionTime <= arrivalTime) {
    redirect(`${base(projectId)}?err=${encodeURIComponent('Completion time must be after arrival.')}`)
  }

  try {
    await addRequirement(user.id, {
      eventId,
      category,
      scopeNotes,
      arrivalAt: `${date}T${arrivalTime}:00+05:30`,
      completionAt: `${date}T${completionTime}:00+05:30`,
    })
  } catch (e) {
    redirect(`${base(projectId)}?err=${encodeURIComponent(translateDbError(e)?.message ?? 'Could not add requirement.')}`)
  }
  revalidatePath(base(projectId))
  redirect(base(projectId))
}

export async function createBookingAction(formData: FormData): Promise<void> {
  const user = await requireUser()
  const projectId = String(formData.get('projectId') ?? '')
  const requirementId = String(formData.get('requirementId') ?? '')
  const vendorId = String(formData.get('vendorId') ?? '')
  const send = String(formData.get('send') ?? '') === '1'

  if (!requirementId || !vendorId) {
    redirect(`${base(projectId)}?err=${encodeURIComponent('Pick a vendor to book.')}`)
  }
  try {
    await createBooking(user.id, { requirementId, vendorId, send })
  } catch (e) {
    redirect(`${base(projectId)}?err=${encodeURIComponent(translateDbError(e)?.message ?? 'Could not create booking.')}`)
  }
  revalidatePath(base(projectId))
  redirect(base(projectId))
}

export async function transitionBookingAction(formData: FormData): Promise<void> {
  const user = await requireUser()
  const projectId = String(formData.get('projectId') ?? '')
  const bookingId = String(formData.get('bookingId') ?? '')
  const toStatus = String(formData.get('toStatus') ?? '') as BookingStatus
  const rejectionReason = String(formData.get('rejectionReason') ?? '').trim() || null

  try {
    await transitionBooking(user.id, { bookingId, toStatus, rejectionReason })
  } catch (e) {
    redirect(`${base(projectId)}?err=${encodeURIComponent(translateDbError(e)?.message ?? 'Could not update booking.')}`)
  }
  revalidatePath(base(projectId))
  redirect(base(projectId))
}
