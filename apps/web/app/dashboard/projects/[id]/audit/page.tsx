import { redirect, notFound } from 'next/navigation'
import { getUserCached, getProjectCached } from '@/lib/context'
import { listAuditLog } from '@vivahsync/db'
import PageHeader from '../../../_shell/PageHeader'

export const dynamic = 'force-dynamic'

const ACTION_LABEL: Record<string, string> = {
  VENUE_RULE_OVERRIDE: 'Venue rule override',
  LEDGER_EDIT: 'Ledger entry edited',
  LEDGER_REVERSAL: 'Ledger entry reversed',
}

const inr = (n: unknown) => `₹${new Intl.NumberFormat('en-IN').format(Number(n))}`

function describe(detail: Record<string, unknown> | null): string {
  if (!detail) return ''
  if (detail.rule_key) {
    return `${detail.rule_key} → ${detail.override_value}  ·  “${detail.rationale}”`
  }
  if (detail.from && detail.to) {
    const f = detail.from as Record<string, unknown>
    const t = detail.to as Record<string, unknown>
    return `${f.direction} ${inr(f.amount)} (${f.mode}) → ${t.direction} ${inr(t.amount)} (${t.mode})`
  }
  if (detail.reverses) {
    return `posted a reversing entry of ${inr(detail.amount)} (${detail.direction})`
  }
  return JSON.stringify(detail)
}

export default async function AuditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await getUserCached()
  if (!user) redirect('/login')

  const project = await getProjectCached(user.id, id)
  if (!project) notFound()

  const entries = await listAuditLog(user.id, id)

  return (
    <main className="dash">
      <PageHeader kicker="Immutable · accountable changes" title="Audit log" />

      {entries.length === 0 ? (
        <div className="empty" style={{ marginTop: '1.5rem' }}>
          No audited actions yet. Venue rule exceptions and other accountable changes are recorded
          here, immutably.
        </div>
      ) : (
        <ul className="auditlist">
          {entries.map((a) => (
            <li key={a.id} className="auditrow">
              <span className="audittime">{a.created_at}</span>
              <div className="auditbody">
                <div>
                  <span className="auditaction">{ACTION_LABEL[a.action] ?? a.action}</span>
                  {a.actor_name && <span className="auditactor"> by {a.actor_name}</span>}
                </div>
                <div className="auditdetail">{describe(a.detail)}</div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
