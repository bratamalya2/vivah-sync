'use server'

import { redirect } from 'next/navigation'
import { submitRsvp, type RsvpGuestInput } from '@vivahsync/db'

// Public (no-login) RSVP submission — the token IS the authorization; submitRsvp
// is strictly token-scoped and ignores any tampered guest ids.
export async function rsvpSubmitAction(formData: FormData): Promise<void> {
  const token = String(formData.get('token') ?? '')
  let guests: RsvpGuestInput[] = []
  try {
    guests = JSON.parse(String(formData.get('payload') ?? '[]'))
  } catch {
    guests = []
  }
  const res = await submitRsvp(token, guests)
  if (res.ok) redirect(`/rsvp/${token}?done=1`)
  redirect(`/rsvp/${token}?err=${encodeURIComponent(res.error ?? 'Could not submit your RSVP.')}`)
}
