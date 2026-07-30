'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { getUser } from '@/lib/auth'
import { inviteFamily } from '@vivahsync/db'
import { translateDbError } from '@vivahsync/core'

export async function inviteFamilyAction(formData: FormData): Promise<void> {
  const user = await getUser()
  if (!user) redirect('/login')
  const projectId = String(formData.get('projectId') ?? '')
  const email = String(formData.get('email') ?? '').trim()
  const name = String(formData.get('name') ?? '').trim() || null
  const base = `/dashboard/projects/${projectId}/family`

  let target: string
  if (!email) {
    target = `${base}?err=${encodeURIComponent('An email address is required.')}`
  } else {
    try {
      await inviteFamily(user.id, { projectId, email, name })
      revalidatePath(base)
      target = `${base}?msg=${encodeURIComponent('Invitation saved. They gain access the next time they sign in.')}`
    } catch (e) {
      target = `${base}?err=${encodeURIComponent(translateDbError(e)?.message ?? 'Could not invite.')}`
    }
  }
  redirect(target)
}
