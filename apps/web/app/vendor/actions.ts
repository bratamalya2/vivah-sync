'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { getUser } from '@/lib/auth'
import {
  vendorRespondBooking,
  vendorAcknowledge,
  vendorEventProject,
  vendorRecordEvidence,
} from '@vivahsync/db'
import { ensureEvidenceBucket, uploadEvidence, deleteEvidenceObject } from '@vivahsync/db/storage'
import { translateDbError } from '@vivahsync/core'

const MAX_UPLOAD = 30 * 1024 * 1024 // 30 MB

export async function respondBookingAction(formData: FormData): Promise<void> {
  const user = await getUser()
  if (!user) redirect('/login')

  const bookingId = String(formData.get('bookingId') ?? '')
  const accept = String(formData.get('accept') ?? '') === 'accept'
  const reason = String(formData.get('reason') ?? '').trim() || null

  let target: string
  try {
    await vendorRespondBooking(user.id, { bookingId, accept, reason })
    target = `/vendor?msg=${encodeURIComponent(accept ? 'Booking accepted.' : 'Booking declined.')}`
  } catch (e) {
    target = `/vendor?err=${encodeURIComponent(
      translateDbError(e)?.message ?? 'Could not update the booking. Please retry.',
    )}`
  }
  revalidatePath('/vendor')
  redirect(target)
}

export async function acknowledgeChangeAction(formData: FormData): Promise<void> {
  const user = await getUser()
  if (!user) redirect('/login')

  const ackId = String(formData.get('ackId') ?? '')

  let target: string
  try {
    await vendorAcknowledge(user.id, { ackId })
    target = `/vendor?msg=${encodeURIComponent('Schedule change acknowledged.')}`
  } catch (e) {
    target = `/vendor?err=${encodeURIComponent(
      translateDbError(e)?.message ?? 'Could not acknowledge the change. Please retry.',
    )}`
  }
  revalidatePath('/vendor')
  redirect(target)
}

export async function uploadVendorEvidenceAction(formData: FormData): Promise<void> {
  const user = await getUser()
  if (!user) redirect('/login')

  const eventId = String(formData.get('eventId') ?? '')
  const file = formData.get('file')
  if (!(file instanceof File) || file.size === 0) {
    redirect(`/vendor?err=${encodeURIComponent('Choose a photo or video to upload.')}`)
  }
  const f = file as File
  if (f.size > MAX_UPLOAD) {
    redirect(`/vendor?err=${encodeURIComponent('File is too large (max 30 MB).')}`)
  }

  // authoritative check — the project id iff the vendor is booked on this ceremony
  const project = await vendorEventProject(user.id, eventId)
  if (!project) {
    redirect(`/vendor?err=${encodeURIComponent('You are not allowed to add evidence here.')}`)
  }

  const mediaId = crypto.randomUUID()
  const dot = f.name.lastIndexOf('.')
  const ext = dot >= 0 ? f.name.slice(dot).toLowerCase() : ''
  const path = `${project}/${mediaId}${ext}`
  const bytes = Buffer.from(await f.arrayBuffer())

  let target: string
  try {
    await ensureEvidenceBucket()
    await uploadEvidence(path, bytes, f.type || 'application/octet-stream')
    try {
      await vendorRecordEvidence(user.id, {
        id: mediaId,
        eventId,
        storagePath: path,
        contentType: f.type || null,
        fileName: f.name,
        byteSize: f.size,
      })
    } catch (e) {
      await deleteEvidenceObject(path) // don't leave orphaned bytes if the row insert fails
      throw e
    }
    target = `/vendor?msg=${encodeURIComponent('Evidence uploaded.')}`
  } catch (e) {
    target = `/vendor?err=${encodeURIComponent(translateDbError(e)?.message ?? 'Upload failed.')}`
  }
  revalidatePath('/vendor')
  redirect(target)
}
