'use server'

import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'

/** `values` echoes what was typed so the form can refill after React resets it. */
export type FormState = {
  error?: string
  message?: string
  values?: { firstName: string; lastName: string; email: string }
} | null

export async function signUp(_prev: FormState, formData: FormData): Promise<FormState> {
  const email = String(formData.get('email') ?? '').trim()
  const password = String(formData.get('password') ?? '')
  const firstName = String(formData.get('firstName') ?? '').trim()
  const lastName = String(formData.get('lastName') ?? '').trim()
  const fullName = [firstName, lastName].filter(Boolean).join(' ')
  const values = { firstName, lastName, email }

  if (!email || !password) return { error: 'Email and password are required.', values }
  if (password.length < 8) return { error: 'Password must be at least 8 characters.', values }

  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName || null } },
  })
  if (error) return { error: error.message, values }

  // With email auto-confirm (dev) a session is returned immediately → onboard.
  // Without it (prod), the user must confirm via email first, then sign in.
  if (data.session) redirect('/home')
  return { message: 'Account created. Check your email to confirm, then sign in.' }
}
