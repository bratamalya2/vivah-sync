import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

/**
 * Supabase client for Server Components / Route Handlers. Reads and writes the
 * auth session cookies. Use this for auth (sign-in state, user identity) and
 * simple reads. The constraint-heavy transactional core goes through
 * @vivahsync/db (Prisma/pg + withUser), not through here.
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(
          cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[],
        ) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options as never)
            }
          } catch {
            // Called from a Server Component render — safe to ignore; the
            // middleware/route handler will refresh the session cookie.
          }
        },
      },
    },
  )
}
