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
import {
  prepareEvidenceUpload,
  finalizeEvidenceUpload,
  type PrepareInput,
  type PrepareResult,
  type FinalizeInput,
  type FinalizeResult,
} from '@/lib/evidenceUpload'
import { translateDbError, describeActionError } from '@vivahsync/core'

function projBase(projectId: string) {
  return `/dashboard/projects/${projectId}`
}
async function requireUser() {
  const user = await getUser()
  if (!user) redirect('/login')
  return user
}

/** Query string for a caught error: `prevented=…` for a guardrail catch, else `err=…`. */
function errParam(e: unknown, fallback: string): string {
  const d = describeActionError(e, fallback)
  return d.prevented
    ? `prevented=${encodeURIComponent(d.prevented)}`
    : `err=${encodeURIComponent(d.err ?? fallback)}`
}

export type FormState = {
  error?: string
  ok?: boolean
  retryable?: boolean
  intervention?: boolean
  headline?: string
} | null

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
    return {
      error: rv?.message ?? 'Could not schedule the ceremony.',
      retryable: rv?.retryable,
      intervention: rv?.intervention,
      headline: rv?.headline,
    }
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
    target = `${projBase(projectId)}?${errParam(e, 'Could not reschedule.')}`
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
    redirect(`${projBase(projectId)}?${errParam(e, 'Could not record acknowledgement.')}`)
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
    redirect(`${projBase(projectId)}?${errParam(e, 'Could not apply the change.')}`)
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
    redirect(`${projBase(projectId)}?${errParam(e, 'Could not update the ceremony.')}`)
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
    redirect(`${projBase(projectId)}?${errParam(e, 'Could not delete the ceremony.')}`)
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
    redirect(`${projBase(projectId)}?${errParam(e, 'Could not update the spaces.')}`)
  }
  revalidatePath(projBase(projectId))
  redirect(`${projBase(projectId)}?msg=${encodeURIComponent('Spaces updated.')}`)
}

/** Evidence upload, step 1: the access check, then a one-time direct-upload token. */
export async function prepareEvidenceUploadAction(input: PrepareInput): Promise<PrepareResult> {
  const user = await requireUser()
  return prepareEvidenceUpload(await getEventForUpload(user.id, input.eventId), input)
}

/** Evidence upload, step 3: verify what reached Storage and record it. */
export async function finalizeEvidenceUploadAction(input: FinalizeInput): Promise<FinalizeResult> {
  const user = await requireUser()
  const projectId = await getEventForUpload(user.id, input.eventId)
  const result = await finalizeEvidenceUpload(projectId, input, (stored) =>
    recordEvidence(user.id, {
      id: stored.mediaId,
      projectId: projectId!,
      entityType: 'event',
      entityId: input.eventId,
      storagePath: stored.path,
      contentType: stored.contentType,
      fileName: input.fileName,
      byteSize: stored.size,
    }),
  )
  if (result.ok && projectId) revalidatePath(projBase(projectId))
  return result
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
