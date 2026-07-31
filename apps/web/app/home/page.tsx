import { redirect } from 'next/navigation'
import { getUser } from '@/lib/auth'
import { getMyContext, claimFamilyInvitations, claimVendorInvitations } from '@vivahsync/db'

export const dynamic = 'force-dynamic'

// Post-login resolver: claims any pending family/vendor invitations, then routes
// the user to the right home — planner dashboard, vendor portal, family portal,
// or onboarding.
export default async function HomePage() {
  const user = await getUser()
  if (!user) redirect('/login')

  // idempotent; provision family / vendor access if invited
  await claimFamilyInvitations(user.id)
  await claimVendorInvitations(user.id)
  const ctx = await getMyContext(user.id)

  if (!ctx.org) redirect('/onboarding') // brand-new planner
  if (ctx.org.type === 'FAMILY') redirect('/family')
  if (ctx.org.type === 'VENDOR') redirect('/vendor')
  redirect('/dashboard')
}
