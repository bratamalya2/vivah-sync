import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getUser } from '@/lib/auth'
import { getMyContext, listProjects, getDashboardFacts } from '@vivahsync/db'
import { computeRisks, type Risk } from '@vivahsync/core'
import { categoryLabel } from '@/lib/categories'
import NewWeddingForm from './NewWeddingForm'
import AppShell from './_shell/AppShell'
import PageHeader from './_shell/PageHeader'

export const dynamic = 'force-dynamic'

const PROXIMITY = Number(process.env.RISK_PROXIMITY_DAYS ?? '14') || 14

function whenLabel(days: number): string {
  if (days <= 0) return 'today'
  if (days === 1) return 'tomorrow'
  return `in ${days}d`
}

export default async function DashboardPage() {
  const user = await getUser()
  if (!user) redirect('/login')

  const ctx = await getMyContext(user.id)
  if (!ctx.onboarded || !ctx.org) redirect('/onboarding')
  if (ctx.org.type === 'FAMILY') redirect('/family')

  const [projects, facts] = await Promise.all([
    listProjects(user.id),
    getDashboardFacts(user.id, PROXIMITY),
  ])

  // group the cross-project facts by wedding and score each with the shared engine
  const byProject = new Map<
    string,
    { name: string; requirements: typeof facts.requirements; eventsWithoutSpace: typeof facts.eventsWithoutSpace; pendingChanges: typeof facts.pendingChanges }
  >()
  const bucket = (pid: string, pname: string) => {
    let b = byProject.get(pid)
    if (!b) {
      b = { name: pname, requirements: [], eventsWithoutSpace: [], pendingChanges: [] }
      byProject.set(pid, b)
    }
    return b
  }
  for (const r of facts.requirements) bucket(r.project_id, r.project_name).requirements.push(r)
  for (const e of facts.eventsWithoutSpace) bucket(e.project_id, e.project_name).eventsWithoutSpace.push(e)
  for (const c of facts.pendingChanges) bucket(c.project_id, c.project_name).pendingChanges.push(c)

  const riskByProject = new Map<string, { total: number; high: number }>()
  const allRisks: (Risk & { projectId: string; projectName: string })[] = []
  for (const [pid, b] of byProject) {
    const risks = computeRisks(b, { proximityDays: PROXIMITY, categoryLabel })
    riskByProject.set(pid, { total: risks.length, high: risks.filter((r) => r.severity === 'HIGH').length })
    for (const r of risks) allRisks.push({ ...r, projectId: pid, projectName: b.name })
  }
  allRisks.sort((a, b) => b.score - a.score)
  const totalHigh = allRisks.filter((r) => r.severity === 'HIGH').length
  const weddingsAtRisk = new Set(allRisks.map((r) => r.projectId)).size

  return (
    <AppShell scope="agency" user={user} org={ctx.org}>
      <main className="dash">
        <PageHeader kicker="Agency workspace · computed live" title={ctx.org.name} />

        {projects.length > 0 && (
        <section className="summaryrow">
          <div className="panel">
            <div className="col-head">
              <h3>Needs action</h3>
              {allRisks.length > 0 && (
                <span className="rs sev-high">{totalHigh} high</span>
              )}
            </div>
            {allRisks.length === 0 ? (
              <div className="allclear">✓ All clear across your weddings.</div>
            ) : (
              <>
                <div className="muted summarysub">
                  {allRisks.length} item{allRisks.length > 1 ? 's' : ''} across {weddingsAtRisk} wedding
                  {weddingsAtRisk > 1 ? 's' : ''}
                </div>
                <ul className="toprisks">
                  {allRisks.slice(0, 6).map((r, i) => (
                    <li key={i}>
                      <Link href={`/dashboard/projects/${r.projectId}/risks`}>
                        <span className={`badge sev-${r.severity.toLowerCase()}`}>{r.severity}</span>
                        <span className="trtitle">{r.title}</span>
                        <span className="trmeta">
                          {r.projectName} · {whenLabel(r.daysUntil)}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
                {allRisks.length > 6 && (
                  <div className="muted summarysub">+ {allRisks.length - 6} more</div>
                )}
              </>
            )}
          </div>

          <div className="panel">
            <h3>Upcoming ceremonies</h3>
            {facts.upcomingEvents.length === 0 ? (
              <div className="muted summarysub">Nothing in the next {PROXIMITY} days.</div>
            ) : (
              <ul className="upcoming">
                {facts.upcomingEvents.map((u, i) => (
                  <li key={i}>
                    <Link href={`/dashboard/projects/${u.project_id}`}>
                      <span className="update">{u.event_date}</span>
                      <span className="upname">
                        {u.event_name} <span className="muted">· {u.project_name}</span>
                      </span>
                      <span className="upwhen">{whenLabel(u.days_until)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      )}

      <section className="dashbody">
        <div className="col-main">
          <div className="col-head">
            <h2>Weddings</h2>
            <span className="count">{projects.length}</span>
          </div>

          {projects.length === 0 ? (
            <div className="empty">
              No weddings yet. Add your first one from the panel on the right.
            </div>
          ) : (
            <ul className="projlist">
              {projects.map((p) => {
                const rc = riskByProject.get(p.id)
                return (
                  <li key={p.id} className="projitem">
                    <Link href={`/dashboard/projects/${p.id}`} className="pname plink">
                      {p.name}
                    </Link>
                    <div className="pmeta">
                      {p.city} · {p.start_date} → {p.end_date}
                      {p.expected_guest_count ? ` · ${p.expected_guest_count} guests` : ''}
                    </div>
                    <span className={`badge ${p.status.toLowerCase()}`}>{p.status}</span>
                    {rc && rc.total > 0 && (
                      <Link
                        href={`/dashboard/projects/${p.id}/risks`}
                        className={`riskpill projpill${rc.high > 0 ? ' high' : ''}`}
                      >
                        {rc.total} risk{rc.total > 1 ? 's' : ''}
                      </Link>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <aside className="col-side">
          <h3>New wedding</h3>
          <NewWeddingForm />
        </aside>
      </section>
      </main>
    </AppShell>
  )
}
