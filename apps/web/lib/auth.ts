import { createSupabaseServerClient } from './supabase/server'
import type { User } from '@supabase/supabase-js'

/** The authenticated Supabase user for the current request, or null. */
export async function getUser(): Promise<User | null> {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user
}
