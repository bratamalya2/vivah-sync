import type { ReactNode } from 'react'
import type { User } from '@supabase/supabase-js'
import TopBar from './TopBar'
import Sidebar from './Sidebar'
import BottomTabs from './BottomTabs'
import {
  agencyGroups,
  projectGroups,
  familyGroups,
  agencyTabs,
  projectTabs,
  familyTabs,
  type NavGroup,
  type NavItem,
  type RiskCount,
} from './nav'

type OrgLite = { id: string; name: string; type: string }
type ProjectLite = {
  id: string
  name: string
  city: string
  start_date: string
  end_date: string
}

/**
 * The persistent chrome frame: maroon top bar, a 238px sidebar (desktop) and a
 * 5-tab bottom bar (mobile), around a scrolling content area. Rendered once per
 * scope by that scope's layout; never nested (route groups keep agency and
 * project chrome in mutually exclusive branches, so the bar never doubles).
 */
export default function AppShell({
  scope,
  user,
  org,
  project,
  tMinus,
  risks,
  children,
}: {
  scope: 'agency' | 'project' | 'family'
  user: User
  org: OrgLite | null
  project?: ProjectLite | null
  tMinus?: string | null
  risks?: RiskCount
  children: ReactNode
}) {
  let groups: NavGroup[]
  let tabs: NavItem[]
  if (scope === 'project' && project) {
    groups = projectGroups(project.id, project.name, risks)
    tabs = projectTabs(project.id, risks)
  } else if (scope === 'family') {
    groups = familyGroups(project?.id)
    tabs = familyTabs(project?.id)
  } else {
    groups = agencyGroups()
    tabs = agencyTabs()
  }

  return (
    <div className="shell-root">
      <TopBar
        user={user}
        org={org}
        project={scope === 'agency' ? null : project}
        tMinus={scope === 'project' ? tMinus : null}
      />
      <div className="shell-body">
        <Sidebar groups={groups} scope={scope} />
        <div className="shell-main">{children}</div>
      </div>
      <BottomTabs tabs={tabs} />
    </div>
  )
}
