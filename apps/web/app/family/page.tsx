import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getUser } from '@/lib/auth'
import { getMyContext, claimFamilyInvitations, listProjects } from '@vivahsync/db'
import AppShell from '@/app/dashboard/_shell/AppShell'
import PageHeader from '@/app/dashboard/_shell/PageHeader'

export const dynamic = 'force-dynamic'

export default async function FamilyHome() {
  const user = await getUser()
  if (!user) redirect('/login')

  await claimFamilyInvitations(user.id)
  const ctx = await getMyContext(user.id)
  if (ctx.org?.type === 'PLANNER') redirect('/dashboard')

  const projects = await listProjects(user.id)

  return (
    <AppShell scope="family" user={user} org={ctx.org}>
      <main className="dash">
        <PageHeader kicker="Read-only access" title="Family view" />

      <div className="col-head" style={{ marginTop: '1.5rem' }}>
        <h2>Weddings shared with you</h2>
        <span className="count">{projects.length}</span>
      </div>

      {projects.length === 0 ? (
        <div className="empty">
          No weddings have been shared with you yet. When your planner shares one, it will appear
          here.
        </div>
      ) : (
        <ul className="projlist">
          {projects.map((p) => (
            <li key={p.id} className="projitem">
              <Link href={`/family/${p.id}`} className="pname plink">
                {p.name}
              </Link>
              <div className="pmeta">
                {p.city} · {p.start_date} → {p.end_date}
              </div>
            </li>
          ))}
        </ul>
      )}
      </main>
    </AppShell>
  )
}
