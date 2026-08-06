'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { getUser } from '@/lib/auth'
import { getMyContext, createProject, applyWeddingTemplate } from '@vivahsync/db'
import { translateDbError } from '@vivahsync/core'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export type FormState = { error?: string; ok?: boolean } | null

export async function createWedding(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getUser()
  if (!user) redirect('/login')

  const ctx = await getMyContext(user.id)
  if (!ctx.org) redirect('/onboarding')

  const name = String(formData.get('name') ?? '').trim()
  const city = String(formData.get('city') ?? '').trim()
  const startDate = String(formData.get('startDate') ?? '')
  const endDate = String(formData.get('endDate') ?? '')
  const guestRaw = String(formData.get('guestCount') ?? '').trim()

  if (!name || !city || !startDate || !endDate) {
    return { error: 'Client name, city and both dates are required.' }
  }
  if (endDate < startDate) return { error: 'End date cannot be before the start date.' }

  let guestCount: number | null = null
  if (guestRaw) {
    guestCount = Number(guestRaw)
    if (!Number.isFinite(guestCount) || guestCount < 0) {
      return { error: 'Guest count must be a positive number.' }
    }
  }

  const template = String(formData.get('template') ?? '').trim()
  try {
    const project = await createProject(user.id, {
      ownerOrgId: ctx.org.id,
      name,
      city,
      startDate,
      endDate,
      guestCount,
    })
    if (template) {
      await applyWeddingTemplate(user.id, { projectId: project.id, templateKey: template })
    }
  } catch (e) {
    return { error: translateDbError(e)?.message ?? 'Could not create the wedding. Please retry.' }
  }

  revalidatePath('/dashboard')
  return { ok: true }
}

export async function signOutAction(): Promise<void> {
  const supabase = await createSupabaseServerClient()
  await supabase.auth.signOut()
  redirect('/login')
}
