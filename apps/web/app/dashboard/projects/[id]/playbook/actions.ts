'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { getUser } from '@/lib/auth'
import { generatePlaybook } from '@vivahsync/db'
import { translateDbError } from '@vivahsync/core'

export async function generatePlaybookAction(formData: FormData): Promise<void> {
  const user = await getUser()
  if (!user) redirect('/login')
  const projectId = String(formData.get('projectId') ?? '')
  const base = `/dashboard/projects/${projectId}/playbook`

  let target: string
  try {
    const g = await generatePlaybook(user.id, projectId)
    revalidatePath(base)
    target = `${base}?pb=${g.id}&msg=${encodeURIComponent(
      `Version ${g.version} generated${g.is_draft ? ' (draft)' : ''}.`,
    )}`
  } catch (e) {
    target = `${base}?err=${encodeURIComponent(translateDbError(e)?.message ?? 'Could not generate the playbook.')}`
  }
  redirect(target)
}
