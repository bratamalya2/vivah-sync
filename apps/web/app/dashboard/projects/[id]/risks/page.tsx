import Link from 'next/link'
import { redirect, notFound } from 'next/navigation'
import { getUserCached, getProjectCached, getRiskFactsCached } from '@/lib/context'
import { computeRisks, type RiskSeverity } from '@vivahsync/core'
import { categoryLabel } from '@/lib/categories'
import PageHeader from '../../../_shell/PageHeader'

export const dynamic = 'force-dynamic'

const PROXIMITY = Number(process.env.RISK_PROXIMITY_DAYS ?? '14') || 14

function whenLabel(days: number): string {
  if (days <= 0) return 'today'
  if (days === 1) return 'tomorrow'
  return `in ${days} days`
}

export default async function RisksPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await getUserCached()
  if (!user) redirect('/login')

  const project = await getProjectCached(user.id, id)
  if (!project) notFound()

  const facts = await getRiskFactsCached(user.id, id)
  const risks = computeRisks(facts, { proximityDays: PROXIMITY, categoryLabel })
  const count = (sev: RiskSeverity) => risks.filter((r) => r.severity === sev).length

  return (
    <main className="dash">
      <PageHeader kicker="Computed live · never stored" title="Open risks" />

      {risks.length === 0 ? (
        <div className="neutral">
          <div className="neutralicon">✓</div>
          <div>
            <strong>No high-priority risks detected.</strong>
            <div className="muted">
              Every requirement approaching within {PROXIMITY} days has a vendor, spaces are
              assigned, and no schedule changes are pending.
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="risksummary">
            <span className="rs sev-high">{count('HIGH')} high</span>
            <span className="rs sev-medium">{count('MEDIUM')} medium</span>
            <span className="rs sev-low">{count('LOW')} low</span>
          </div>
          <ul className="risklist">
            {risks.map((r, i) => (
              <li key={i} className={`riskcard sev-${r.severity.toLowerCase()}`}>
                <span className={`badge sev-${r.severity.toLowerCase()}`}>{r.severity}</span>
                <div className="riskbody">
                  <div className="risktitle">{r.title}</div>
                  <div className="riskdetail">{r.detail}</div>
                  <div className="riskmeta">
                    {r.eventName} · {r.eventDate} · {whenLabel(r.daysUntil)}
                  </div>
                </div>
                <RiskAction projectId={id} type={r.type} />
              </li>
            ))}
          </ul>
        </>
      )}
    </main>
  )
}

function RiskAction({ projectId, type }: { projectId: string; type: string }) {
  const href =
    type === 'PENDING_SCHEDULE_CHANGE'
      ? `/dashboard/projects/${projectId}`
      : type === 'NO_SPACE'
        ? `/dashboard/projects/${projectId}`
        : `/dashboard/projects/${projectId}/vendors`
  const label = type === 'PENDING_SCHEDULE_CHANGE' || type === 'NO_SPACE' ? 'Open run of show' : 'Fix vendoring'
  return (
    <Link href={href} className="mini ghostmini riskfix">
      {label}
    </Link>
  )
}
