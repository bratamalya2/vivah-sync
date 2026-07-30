'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { getUser } from '@/lib/auth'
import {
  scheduleEvent,
  rescheduleEvent,
  acknowledgeChange,
  finalizeProposal,
  cancelProposal,
  addVenueOverride,
  editEvent,
  deleteEvent,
  setEventSpaces,
  getEventForUpload,
  recordEvidence,
  type VenueRuleKey,
} from '@vivahsync/db'
import { ensureEvidenceBucket, uploadEvidence, deleteEvidenceObject } from '@vivahsync/db/storage'
import { translateDbError } from '@vivahsync/core'

function projBase(projectId: string) {
  return `/dashboard/projects/${projectId}`
}
async function requireUser() {
  const user = await getUser()
  if (!user) redirect('/login')
  return user
}

export type FormState = { error?: string; ok?: boolean; retryable?: boolean } | null

export async function scheduleCeremony(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getUser()
  if (!user) redirect('/login')

  const projectId = String(formData.get('projectId') ?? '')
  const name = String(formData.get('name') ?? '').trim()
  const date = String(formData.get('date') ?? '')
  const startTime = String(formData.get('startTime') ?? '')
  const endTime = String(formData.get('endTime') ?? '')
  const spaceId = String(formData.get('spaceId') ?? '') || null

  if (!projectId || !name || !date || !startTime || !endTime) {
    return { error: 'Name, date, start and end time are required.' }
  }
  if (endTime <= startTime) return { error: 'End time must be after the start time.' }

  const setupMinutes = Number(formData.get('setupMinutes') ?? '0') || 0
  const teardownMinutes = Number(formData.get('teardownMinutes') ?? '0') || 0
  const guestRaw = String(formData.get('guestCount') ?? '').trim()
  const guestCount = guestRaw ? Number(guestRaw) : null
  if (guestCount !== null && (!Number.isFinite(guestCount) || guestCount < 0)) {
    return { error: 'Guest count must be a positive number.' }
  }

  // IST — the whole product operates on Asia/Kolkata.
  const startsAt = `${date}T${startTime}:00+05:30`
  const endsAt = `${date}T${endTime}:00+05:30`

  try {
    await scheduleEvent(user.id, {
      projectId,
      name,
      startsAt,
      endsAt,
      setupMinutes,
      teardownMinutes,
      guestCount,
      spaceId,
    })
  } catch (e) {
    const rv = translateDbError(e)
    return { error: rv?.message ?? 'Could not schedule the ceremony.', retryable: rv?.retryable }
  }

  revalidatePath(`/dashboard/projects/${projectId}`)
  return { ok: true }
}

export async function rescheduleAction(formData: FormData): Promise<void> {
  const user = await requireUser()
  const projectId = String(formData.get('projectId') ?? '')
  const eventId = String(formData.get('eventId') ?? '')
  const date = String(formData.get('date') ?? '')
  const startTime = String(formData.get('startTime') ?? '')
  const endTime = String(formData.get('endTime') ?? '')

  if (!eventId || !date || !startTime || !endTime) {
    redirect(`${projBase(projectId)}?err=${encodeURIComponent('Date, start and end are required.')}`)
  }
  if (endTime <= startTime) {
    redirect(`${projBase(projectId)}?err=${encodeURIComponent('End time must be after start time.')}`)
  }

  // NB: never call redirect() inside try — its NEXT_REDIRECT throw would be
  // caught below and mis-reported as an error. Compute the target, redirect after.
  let target: string
  try {
    const r = await rescheduleEvent(user.id, {
      eventId,
      newStartsAt: `${date}T${startTime}:00+05:30`,
      newEndsAt: `${date}T${endTime}:00+05:30`,
    })
    revalidatePath(projBase(projectId))
    const msg = r.applied
      ? 'Ceremony rescheduled.'
      : `Change proposed — ${r.impacted} vendor(s) must acknowledge before it applies.`
    target = `${projBase(projectId)}?msg=${encodeURIComponent(msg)}`
  } catch (e) {
    target = `${projBase(projectId)}?err=${encodeURIComponent(translateDbError(e)?.message ?? 'Could not reschedule.')}`
  }
  redirect(target)
}

export async function acknowledgeAction(formData: FormData): Promise<void> {
  const user = await requireUser()
  const projectId = String(formData.get('projectId') ?? '')
  const ackId = String(formData.get('ackId') ?? '')
  try {
    await acknowledgeChange(user.id, ackId)
  } catch (e) {
    redirect(`${projBase(projectId)}?err=${encodeURIComponent(translateDbError(e)?.message ?? 'Could not record acknowledgement.')}`)
  }
  revalidatePath(projBase(projectId))
  redirect(projBase(projectId))
}

export async function finalizeAction(formData: FormData): Promise<void> {
  const user = await requireUser()
  const projectId = String(formData.get('projectId') ?? '')
  const proposalId = String(formData.get('proposalId') ?? '')
  try {
    await finalizeProposal(user.id, proposalId)
  } catch (e) {
    redirect(`${projBase(projectId)}?err=${encodeURIComponent(translateDbError(e)?.message ?? 'Could not apply the change.')}`)
  }
  revalidatePath(projBase(projectId))
  redirect(`${projBase(projectId)}?msg=${encodeURIComponent('Schedule change applied.')}`)
}

export async function editEventAction(formData: FormData): Promise<void> {
  const user = await requireUser()
  const projectId = String(formData.get('projectId') ?? '')
  const eventId = String(formData.get('eventId') ?? '')
  const name = String(formData.get('name') ?? '').trim()
  const guestRaw = String(formData.get('guestCount') ?? '').trim()
  const setupMinutes = Number(formData.get('setupMinutes') ?? '0') || 0
  const teardownMinutes = Number(formData.get('teardownMinutes') ?? '0') || 0
  if (!name) redirect(`${projBase(projectId)}?err=${encodeURIComponent('Ceremony name is required.')}`)
  const guestCount = guestRaw ? Number(guestRaw) : null
  try {
    await editEvent(user.id, { eventId, name, guestCount, setupMinutes, teardownMinutes })
  } catch (e) {
    redirect(`${projBase(projectId)}?err=${encodeURIComponent(translateDbError(e)?.message ?? 'Could not update the ceremony.')}`)
  }
  revalidatePath(projBase(projectId))
  redirect(`${projBase(projectId)}?msg=${encodeURIComponent('Ceremony updated.')}`)
}

export async function deleteEventAction(formData: FormData): Promise<void> {
  const user = await requireUser()
  const projectId = String(formData.get('projectId') ?? '')
  const eventId = String(formData.get('eventId') ?? '')
  try {
    await deleteEvent(user.id, eventId)
  } catch (e) {
    redirect(`${projBase(projectId)}?err=${encodeURIComponent(translateDbError(e)?.message ?? 'Could not delete the ceremony.')}`)
  }
  revalidatePath(projBase(projectId))
  redirect(`${projBase(projectId)}?msg=${encodeURIComponent('Ceremony deleted.')}`)
}

export async function setEventSpacesAction(formData: FormData): Promise<void> {
  const user = await requireUser()
  const projectId = String(formData.get('projectId') ?? '')
  const eventId = String(formData.get('eventId') ?? '')
  const spaceIds = formData.getAll('spaceId').map((v) => String(v)).filter(Boolean)
  try {
    await setEventSpaces(user.id, { eventId, spaceIds })
  } catch (e) {
    redirect(`${projBase(projectId)}?err=${encodeURIComponent(translateDbError(e)?.message ?? 'Could not update the spaces.')}`)
  }
  revalidatePath(projBase(projectId))
  redirect(`${projBase(projectId)}?msg=${encodeURIComponent('Spaces updated.')}`)
}

const MAX_UPLOAD = 30 * 1024 * 1024 // 30 MB

export async function uploadEvidenceAction(formData: FormData): Promise<void> {
  const user = await requireUser()
  const projectId = String(formData.get('projectId') ?? '')
  const eventId = String(formData.get('eventId') ?? '')
  const base = projBase(projectId)
  const file = formData.get('file')

  if (!(file instanceof File) || file.size === 0) {
    redirect(`${base}?err=${encodeURIComponent('Choose a photo or video to upload.')}`)
  }
  const f = file as File
  if (f.size > MAX_UPLOAD) {
    redirect(`${base}?err=${encodeURIComponent('File is too large (max 30 MB).')}`)
  }

  // authoritative access check — returns the project id iff the caller may upload
  const proj = await getEventForUpload(user.id, eventId)
  if (!proj) redirect(`${base}?err=${encodeURIComponent('You are not allowed to add evidence here.')}`)

  const mediaId = crypto.randomUUID()
  const dot = f.name.lastIndexOf('.')
  const ext = dot >= 0 ? f.name.slice(dot).toLowerCase() : ''
  const path = `${proj}/${mediaId}${ext}`
  const bytes = Buffer.from(await f.arrayBuffer())

  let target: string
  try {
    await ensureEvidenceBucket()
    await uploadEvidence(path, bytes, f.type || 'application/octet-stream')
    try {
      await recordEvidence(user.id, {
        id: mediaId,
        projectId: proj!,
        entityType: 'event',
        entityId: eventId,
        storagePath: path,
        contentType: f.type || null,
        fileName: f.name,
        byteSize: f.size,
      })
    } catch (e) {
      await deleteEvidenceObject(path) // don't leave orphaned bytes if the row insert fails
      throw e
    }
    revalidatePath(base)
    target = `${base}?msg=${encodeURIComponent('Evidence uploaded.')}`
  } catch (e) {
    target = `${base}?err=${encodeURIComponent(translateDbError(e)?.message ?? 'Upload failed.')}`
  }
  redirect(target)
}

export async function addOverrideAction(formData: FormData): Promise<void> {
  const user = await requireUser()
  const projectId = String(formData.get('projectId') ?? '')
  const eventId = String(formData.get('eventId') ?? '')
  const ruleKey = String(formData.get('ruleKey') ?? '') as VenueRuleKey
  const overrideValue = String(formData.get('overrideValue') ?? '').trim()
  const rationale = String(formData.get('rationale') ?? '').trim()

  if (!eventId || !ruleKey || !overrideValue) {
    redirect(`${projBase(projectId)}?err=${encodeURIComponent('Rule, value and rationale are required.')}`)
  }
  if (!rationale) {
    redirect(`${projBase(projectId)}?err=${encodeURIComponent('A documented rationale is required to override a venue rule.')}`)
  }
  try {
    await addVenueOverride(user.id, { eventId, ruleKey, overrideValue, rationale })
  } catch (e) {
    redirect(`${projBase(projectId)}?err=${encodeURIComponent(translateDbError(e)?.message ?? 'Could not save the exception.')}`)
  }
  revalidatePath(projBase(projectId))
  redirect(`${projBase(projectId)}?msg=${encodeURIComponent('Venue exception recorded (audited).')}`)
}

export async function cancelProposalAction(formData: FormData): Promise<void> {
  const user = await requireUser()
  const projectId = String(formData.get('projectId') ?? '')
  const proposalId = String(formData.get('proposalId') ?? '')
  try {
    await cancelProposal(user.id, proposalId)
  } catch (e) {
    redirect(`${projBase(projectId)}?err=${encodeURIComponent(translateDbError(e)?.message ?? 'Could not cancel.')}`)
  }
  revalidatePath(projBase(projectId))
  redirect(projBase(projectId))
}
