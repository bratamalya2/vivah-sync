import type { ReactNode } from 'react'
import { redirect } from 'next/navigation'
import { computeRisks } from '@vivahsync/core'
import { getUserCached, getMyContextCached, getProjectCached, getRiskFactsCached } from '@/lib/context'
import AppShell from '../../_shell/AppShell'
import { daysOutLabel } from '../../_shell/daysOut'

const PROXIMITY = Number(process.env.RISK_PROXIMITY_DAYS ?? '14') || 14

export const dynamic = 'force-dynamic'

export default async function ProjectLayout({
  children,
  params,
}: {
  children: ReactNode
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const user = await getUserCached()
  if (!user) redirect('/login')

  const [ctx, project] = await Promise.all([
    getMyContextCached(user.id),
    getProjectCached(user.id, id),
  ])

  let risks = { count: 0, high: 0 }
  if (project) {
    const facts = await getRiskFactsCached(user.id, id)
    const rs = computeRisks(facts, { proximityDays: PROXIMITY })
    risks = { count: rs.length, high: rs.filter((r) => r.severity === 'HIGH').length }
  }

  return (
    <AppShell
      scope="project"
      user={user}
      org={ctx.org}
      project={project ?? undefined}
      tMinus={project ? daysOutLabel(project.start_date) : null}
      risks={risks}
    >
      {children}
    </AppShell>
  )
}
