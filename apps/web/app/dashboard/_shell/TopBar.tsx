import type { User } from '@supabase/supabase-js'
import { signOutAction } from '@/app/dashboard/actions'
import BrandLogo from '@/app/_components/BrandLogo'

type OrgLite = { id: string; name: string; type: string }
type ProjectLite = {
  id: string
  name: string
  city: string
  start_date: string
  end_date: string
}

function initials(fullName: string, email: string): string {
  const src = fullName.trim() || email
  const parts = src.split(/[\s@._-]+/).filter(Boolean)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return (src.slice(0, 2) || '·').toUpperCase()
}

/** The persistent 52px maroon bar: brand · agency · (project box) · T−N · user. */
export default function TopBar({
  user,
  org,
  project,
  tMinus,
}: {
  user: User
  org: OrgLite | null
  project?: ProjectLite | null
  tMinus?: string | null
}) {
  const fullName = (user.user_metadata?.full_name as string | undefined) ?? ''
  const email = user.email ?? ''
  const display = fullName || email

  return (
    <header className="shell-topbar">
      <div className="shell-logo">
        <BrandLogo className="shell-logo-image" />
      </div>

      {org && (
        <>
          <div className="shell-div" />
          <div className="shell-agency">{org.name}</div>
        </>
      )}

      {project && (
        <div className="shell-projbox">
          <span className="k">Project</span>
          <span className="v">{project.name}</span>
          <span className="m">
            {project.start_date}–{project.end_date} · {project.city}
          </span>
        </div>
      )}

      <div className="shell-spacer" />

      {tMinus && <div className="shell-tminus">{tMinus}</div>}

      <div className="shell-user">
        <div className="shell-avatar" title={display}>
          {initials(fullName, email)}
        </div>
        <div className="shell-username">{display}</div>
        <form action={signOutAction}>
          <button className="shell-signout" type="submit">
            Sign out
          </button>
        </form>
      </div>
    </header>
  )
}
