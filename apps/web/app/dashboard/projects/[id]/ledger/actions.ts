'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { getUser } from '@/lib/auth'
import {
  recordLedgerEntry,
  editLedgerEntry,
  deleteLedgerEntry,
  reverseLedgerEntry,
  type LedgerDirection,
  type PaymentMode,
  type PayerEntity,
} from '@vivahsync/db'
import { translateDbError } from '@vivahsync/core'

function base(projectId: string) {
  return `/dashboard/projects/${projectId}/ledger`
}
async function requireUser() {
  const user = await getUser()
  if (!user) redirect('/login')
  return user
}
// datetime-local ("YYYY-MM-DDTHH:MM") → IST ISO; blank → now
function toIso(dtLocal: string): string {
  return dtLocal ? `${dtLocal}:00+05:30` : new Date().toISOString()
}
function parseAmount(raw: string): number | null {
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? n : null
}

export async function addLedgerAction(formData: FormData): Promise<void> {
  const user = await requireUser()
  const projectId = String(formData.get('projectId') ?? '')
  const amount = parseAmount(String(formData.get('amount') ?? ''))
  if (amount === null) redirect(`${base(projectId)}?err=${encodeURIComponent('Enter a positive amount.')}`)

  let target: string
  try {
    await recordLedgerEntry(user.id, {
      projectId,
      direction: String(formData.get('direction') ?? 'INFLOW') as LedgerDirection,
      amount: amount!,
      mode: String(formData.get('mode') ?? 'BANK') as PaymentMode,
      payer: String(formData.get('payer') ?? 'CLIENT') as PayerEntity,
      vendorId: String(formData.get('vendorId') ?? '') || null,
      note: String(formData.get('note') ?? '').trim() || null,
      paidAt: toIso(String(formData.get('paidAt') ?? '')),
    })
    revalidatePath(base(projectId))
    target = `${base(projectId)}?msg=${encodeURIComponent('Payment recorded.')}`
  } catch (e) {
    target = `${base(projectId)}?err=${encodeURIComponent(translateDbError(e)?.message ?? 'Could not record the payment.')}`
  }
  redirect(target)
}

export async function editLedgerAction(formData: FormData): Promise<void> {
  const user = await requireUser()
  const projectId = String(formData.get('projectId') ?? '')
  const id = String(formData.get('id') ?? '')
  const amount = parseAmount(String(formData.get('amount') ?? ''))
  if (amount === null) redirect(`${base(projectId)}?err=${encodeURIComponent('Enter a positive amount.')}`)

  let target: string
  try {
    await editLedgerEntry(user.id, {
      id,
      direction: String(formData.get('direction') ?? 'INFLOW') as LedgerDirection,
      amount: amount!,
      mode: String(formData.get('mode') ?? 'BANK') as PaymentMode,
      payer: String(formData.get('payer') ?? 'CLIENT') as PayerEntity,
      vendorId: String(formData.get('vendorId') ?? '') || null,
      note: String(formData.get('note') ?? '').trim() || null,
      paidAt: toIso(String(formData.get('paidAt') ?? '')),
    })
    revalidatePath(base(projectId))
    target = `${base(projectId)}?msg=${encodeURIComponent('Entry updated.')}`
  } catch (e) {
    target = `${base(projectId)}?err=${encodeURIComponent(translateDbError(e)?.message ?? 'Could not update the entry.')}`
  }
  redirect(target)
}

export async function deleteLedgerAction(formData: FormData): Promise<void> {
  const user = await requireUser()
  const projectId = String(formData.get('projectId') ?? '')
  const id = String(formData.get('id') ?? '')
  let target: string
  try {
    await deleteLedgerEntry(user.id, id)
    revalidatePath(base(projectId))
    target = `${base(projectId)}?msg=${encodeURIComponent('Entry deleted.')}`
  } catch (e) {
    target = `${base(projectId)}?err=${encodeURIComponent(translateDbError(e)?.message ?? 'Could not delete the entry.')}`
  }
  redirect(target)
}

export async function reverseLedgerAction(formData: FormData): Promise<void> {
  const user = await requireUser()
  const projectId = String(formData.get('projectId') ?? '')
  const id = String(formData.get('id') ?? '')
  let target: string
  try {
    await reverseLedgerEntry(user.id, id)
    revalidatePath(base(projectId))
    target = `${base(projectId)}?msg=${encodeURIComponent('Reversing entry posted.')}`
  } catch (e) {
    target = `${base(projectId)}?err=${encodeURIComponent(translateDbError(e)?.message ?? 'Could not reverse the entry.')}`
  }
  redirect(target)
}
