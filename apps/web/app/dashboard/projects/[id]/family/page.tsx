import { redirect, notFound } from 'next/navigation'
import { getUserCached, getProjectCached } from '@/lib/context'
import { listProjectInvitations } from '@vivahsync/db'
import { inviteFamilyAction } from './actions'
import PageHeader from '../../../_shell/PageHeader'

export const dynamic = 'force-dynamic'

export default async function ProjectFamilyPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ err?: string; msg?: string }>
}) {
  const { id } = await params
  const { err, msg } = await searchParams
  const user = await getUserCached()
  if (!user) redirect('/login')

  const project = await getProjectCached(user.id, id)
  if (!project) notFound()

  const invites = await listProjectInvitations(user.id, id)

  return (
    <main className="dash">
      <PageHeader kicker="Read-only schedule invitations" title="Family access" />

      {err && <p className="err banner">{err}</p>}
      {msg && <p className="ok banner">{msg}</p>}

      <section className="dashbody">
        <div className="col-main">
          <div className="col-head">
            <h2>Invited family</h2>
            <span className="count">{invites.length}</span>
          </div>
          {invites.length === 0 ? (
            <div className="empty">
              No family members invited yet. They get a strictly read-only view of the schedule —
              never pricing, contracts, vendor contacts, or risks.
            </div>
          ) : (
            <ul className="projlist">
              {invites.map((iv) => (
                <li key={iv.email} className="projitem">
                  <div className="pname">{iv.invitee_name ?? iv.email}</div>
                  <div className="pmeta">{iv.email}</div>
                  <span className={`badge ${iv.claimed_at ? 'st-accepted' : 'st-sent'}`}>
                    {iv.claimed_at ? 'Active' : 'Invited'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <aside className="col-side">
          <h3>Invite a family member</h3>
          <form action={inviteFamilyAction} className="newform">
            <input type="hidden" name="projectId" value={id} />
            <label>
              Email
              <input name="email" type="email" required placeholder="aunt.meera@example.com" />
            </label>
            <label>
              Name
              <input name="name" placeholder="Aunt Meera" />
            </label>
            <button type="submit">Invite</button>
          </form>
          <p className="muted" style={{ fontSize: '0.78rem', marginTop: '0.7rem' }}>
            They sign up with this email; access is granted automatically on first sign-in.
          </p>
        </aside>
      </section>
    </main>
  )
}
