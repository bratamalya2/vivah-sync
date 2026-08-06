'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { getUser } from '@/lib/auth'
import { sendBroadcast, type BroadcastChannel, type Audience } from '@vivahsync/db'

function base(projectId: string) {
  return `/dashboard/projects/${projectId}/broadcast`
}
const enc = encodeURIComponent
const CHANNELS = ['WHATSAPP', 'SMS', 'EMAIL']
const AUDIENCES = ['ALL', 'PENDING_RSVP', 'ATTENDING', 'ARRIVING']

export async function sendBroadcastAction(formData: FormData): Promise<void> {
  const user = await getUser()
  if (!user) redirect('/login')
  const projectId = String(formData.get('projectId') ?? '')
  const body = String(formData.get('body') ?? '').trim()
  if (!body) redirect(`${base(projectId)}?err=${enc('Message body is required.')}`)

  const channel = (CHANNELS.includes(String(formData.get('channel'))) ? String(formData.get('channel')) : 'WHATSAPP') as BroadcastChannel
  const audience = (AUDIENCES.includes(String(formData.get('audience'))) ? String(formData.get('audience')) : 'ALL') as Audience

  const res = await sendBroadcast(user.id, {
    projectId,
    channel,
    audience,
    subject: String(formData.get('subject') ?? '').trim() || null,
    body,
  }).catch(() => ({ recipients: 0 }))

  revalidatePath(base(projectId))
  redirect(
    `${base(projectId)}?msg=${enc(`Queued to ${res.recipients} part${res.recipients === 1 ? 'y' : 'ies'} (send is stubbed — no message actually dispatched).`)}`,
  )
}
