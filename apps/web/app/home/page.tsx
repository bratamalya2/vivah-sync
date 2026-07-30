import { redirect } from 'next/navigation'
import { getUser } from '@/lib/auth'
import { getMyContext, claimFamilyInvitations } from '@vivahsync/db'

export const dynamic = 'force-dynamic'

// Post-login resolver: claims any pending family invitations, then routes the
// user to the right home — planner dashboard, family portal, or onboarding.
export default async function HomePage() {
  const user = await getUser()
  if (!user) redirect('/login')

  await claimFamilyInvitations(user.id) // idempotent; provisions family access if invited
  const ctx = await getMyContext(user.id)

  if (!ctx.org) redirect('/onboarding') // brand-new planner
  if (ctx.org.type === 'FAMILY') redirect('/family')
  redirect('/dashboard')
}
