'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { getUser } from '@/lib/auth'
import {
  createContract,
  saveMilestones,
  activateContract,
  setContractDraft,
  deleteContract,
  markMilestonePaid,
  type MilestoneInput,
} from '@vivahsync/db'
import { describeActionError } from '@vivahsync/core'

function base(projectId: string) {
  return `/dashboard/projects/${projectId}/contracts`
}
async function reqUser() {
  const u = await getUser()
  if (!u) redirect('/login')
  return u
}
function errParam(e: unknown, fallback: string): string {
  const d = describeActionError(e, fallback)
  return d.prevented
    ? `prevented=${encodeURIComponent(d.prevented)}`
    : `err=${encodeURIComponent(d.err ?? fallback)}`
}

export async function createContractAction(formData: FormData): Promise<void> {
  const user = await reqUser()
  const projectId = String(formData.get('projectId') ?? '')
  const vendorId = String(formData.get('vendorId') ?? '')
  const title = String(formData.get('title') ?? '').trim()
  const totalAmount = Number(formData.get('totalAmount') ?? '0')
  const notes = String(formData.get('notes') ?? '').trim() || null
  const source = String(formData.get('source') ?? 'MANUAL') === 'PDF_EXTRACTED' ? 'PDF_EXTRACTED' : 'MANUAL'

  if (!vendorId || !title || !Number.isFinite(totalAmount) || totalAmount <= 0) {
    redirect(`${base(projectId)}?err=${encodeURIComponent('Vendor, a title and a positive total are required.')}`)
  }

  let milestones: { label: string; amount: number; dueDate: string | null }[] = []
  const raw = String(formData.get('milestones') ?? '')
  if (raw) {
    try {
      milestones = JSON.parse(raw)
    } catch {
      milestones = []
    }
  }

  let target: string
  try {
    const c = await createContract(user.id, {
      projectId,
      vendorId,
      title,
      totalAmount,
      source,
      notes,
      milestones,
    })
    target = `${base(projectId)}/${c.id}?msg=${encodeURIComponent('Contract created — review its payment plan.')}`
  } catch (e) {
    target = `${base(projectId)}?${errParam(e, 'Could not create the contract.')}`
  }
  revalidatePath(base(projectId))
  redirect(target)
}

export async function saveMilestonesAction(formData: FormData): Promise<void> {
  const user = await reqUser()
  const projectId = String(formData.get('projectId') ?? '')
  const contractId = String(formData.get('contractId') ?? '')
  const dest = `${base(projectId)}/${contractId}`

  let milestones: MilestoneInput[] = []
  try {
    milestones = JSON.parse(String(formData.get('milestones') ?? '[]'))
  } catch {
    milestones = []
  }

  let target: string
  try {
    await saveMilestones(user.id, { contractId, milestones })
    target = `${dest}?msg=${encodeURIComponent('Payment plan saved.')}`
  } catch (e) {
    target = `${dest}?${errParam(e, 'Could not save the payment plan.')}`
  }
  revalidatePath(dest)
  redirect(target)
}

export async function activateContractAction(formData: FormData): Promise<void> {
  const user = await reqUser()
  const projectId = String(formData.get('projectId') ?? '')
  const contractId = String(formData.get('contractId') ?? '')
  const dest = `${base(projectId)}/${contractId}`
  let target: string
  try {
    await activateContract(user.id, contractId)
    target = `${dest}?msg=${encodeURIComponent('Contract activated — its payment plan is locked in at 100%.')}`
  } catch (e) {
    target = `${dest}?${errParam(e, 'Could not activate the contract.')}`
  }
  revalidatePath(dest)
  redirect(target)
}

export async function setDraftAction(formData: FormData): Promise<void> {
  const user = await reqUser()
  const projectId = String(formData.get('projectId') ?? '')
  const contractId = String(formData.get('contractId') ?? '')
  const dest = `${base(projectId)}/${contractId}`
  await setContractDraft(user.id, contractId).catch(() => {})
  revalidatePath(dest)
  redirect(dest)
}

export async function deleteContractAction(formData: FormData): Promise<void> {
  const user = await reqUser()
  const projectId = String(formData.get('projectId') ?? '')
  const contractId = String(formData.get('contractId') ?? '')
  await deleteContract(user.id, contractId).catch(() => {})
  revalidatePath(base(projectId))
  redirect(`${base(projectId)}?msg=${encodeURIComponent('Contract deleted.')}`)
}

export async function toggleMilestonePaidAction(formData: FormData): Promise<void> {
  const user = await reqUser()
  const projectId = String(formData.get('projectId') ?? '')
  const contractId = String(formData.get('contractId') ?? '')
  const milestoneId = String(formData.get('milestoneId') ?? '')
  const paid = String(formData.get('paid') ?? '') === 'true'
  await markMilestonePaid(user.id, { milestoneId, paid }).catch(() => {})
  revalidatePath(`${base(projectId)}/${contractId}`)
  redirect(`${base(projectId)}/${contractId}`)
}
