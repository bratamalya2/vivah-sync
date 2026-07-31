'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { getUser } from '@/lib/auth'
import { getMyContext, createVendor, inviteVendor, type VendorCategory } from '@vivahsync/db'
import { translateDbError } from '@vivahsync/core'

export type FormState = { error?: string; ok?: boolean } | null

/** Invite a roster vendor to the self-service portal by email. */
export async function inviteVendorToPortal(formData: FormData): Promise<void> {
  const user = await getUser()
  if (!user) redirect('/login')

  const vendorId = String(formData.get('vendorId') ?? '')
  const email = String(formData.get('email') ?? '').trim()

  let target: string
  try {
    await inviteVendor(user.id, { vendorId, email })
    target = `/dashboard/vendors?msg=${encodeURIComponent(`Portal invitation sent to ${email}.`)}`
  } catch (e) {
    target = `/dashboard/vendors?err=${encodeURIComponent(
      translateDbError(e)?.message ?? 'Could not send the invitation.',
    )}`
  }
  revalidatePath('/dashboard/vendors')
  redirect(target)
}

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
