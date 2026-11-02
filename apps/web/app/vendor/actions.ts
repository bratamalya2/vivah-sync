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
import {
  prepareEvidenceUpload,
  finalizeEvidenceUpload,
  type PrepareInput,
  type PrepareResult,
  type FinalizeInput,
  type FinalizeResult,
} from '@/lib/evidenceUpload'
import { translateDbError } from '@vivahsync/core'

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

/** Evidence upload, step 1: only a vendor booked on this ceremony gets a token. */
export async function prepareVendorEvidenceUploadAction(input: PrepareInput): Promise<PrepareResult> {
  const user = await getUser()
  if (!user) redirect('/login')
  return prepareEvidenceUpload(await vendorEventProject(user.id, input.eventId), input)
}

/** Evidence upload, step 3: verify what reached Storage and record it as the vendor. */
export async function finalizeVendorEvidenceUploadAction(input: FinalizeInput): Promise<FinalizeResult> {
  const user = await getUser()
  if (!user) redirect('/login')
  const projectId = await vendorEventProject(user.id, input.eventId)
  const result = await finalizeEvidenceUpload(projectId, input, (stored) =>
    vendorRecordEvidence(user.id, {
      id: stored.mediaId,
      eventId: input.eventId,
      storagePath: stored.path,
      contentType: stored.contentType,
      fileName: input.fileName,
      byteSize: stored.size,
    }),
  )
  if (result.ok) revalidatePath('/vendor')
  return result
}
