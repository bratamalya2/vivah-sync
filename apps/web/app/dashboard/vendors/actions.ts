'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { getUser } from '@/lib/auth'
import { getMyContext, createVendor, type VendorCategory } from '@vivahsync/db'
import { translateDbError } from '@vivahsync/core'

export type FormState = { error?: string; ok?: boolean } | null

export async function addVendor(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getUser()
  if (!user) redirect('/login')
  const ctx = await getMyContext(user.id)
  if (!ctx.org) redirect('/onboarding')

  const name = String(formData.get('name') ?? '').trim()
  const category = String(formData.get('category') ?? '') as VendorCategory
  if (!name || !category) return { error: 'Vendor name and category are required.' }

  try {
    await createVendor(user.id, {
      ownerOrgId: ctx.org.id,
      name,
      category,
      contactName: String(formData.get('contactName') ?? '').trim() || null,
      contactPhone: String(formData.get('contactPhone') ?? '').trim() || null,
      contactEmail: String(formData.get('contactEmail') ?? '').trim() || null,
    })
  } catch (e) {
    return { error: translateDbError(e)?.message ?? 'Could not add the vendor.' }
  }
  revalidatePath('/dashboard/vendors')
  return { ok: true }
}
