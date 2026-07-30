'use server'

import { redirect } from 'next/navigation'
import { getUser } from '@/lib/auth'
import { onboardPlanner } from '@vivahsync/db'
import { translateDbError } from '@vivahsync/core'

export type FormState = { error?: string } | null

export async function createAgency(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getUser()
  if (!user) redirect('/login')

  const orgName = String(formData.get('orgName') ?? '').trim()
  const fullName = String(formData.get('fullName') ?? '').trim() || null
  if (!orgName) return { error: 'Agency name is required.' }

  try {
    await onboardPlanner(user.id, { orgName, fullName, email: user.email ?? null })
  } catch (e) {
    return { error: translateDbError(e)?.message ?? 'Could not create your agency. Please retry.' }
  }
  redirect('/dashboard')
}
