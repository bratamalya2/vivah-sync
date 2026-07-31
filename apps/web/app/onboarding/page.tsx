import { redirect } from 'next/navigation'
import { getUser } from '@/lib/auth'
import { getMyContext } from '@vivahsync/db'
import OnboardingForm from './OnboardingForm'

export const dynamic = 'force-dynamic'

export default async function OnboardingPage() {
  const user = await getUser()
  if (!user) redirect('/login')

  const ctx = await getMyContext(user.id)
  if (ctx.org?.type === 'FAMILY') redirect('/family')
  if (ctx.org?.type === 'VENDOR') redirect('/vendor')
  if (ctx.onboarded) redirect('/dashboard')

  const defaultFullName =
    typeof user.user_metadata?.full_name === 'string' ? user.user_metadata.full_name : ''

  return <OnboardingForm defaultFullName={defaultFullName} />
}
