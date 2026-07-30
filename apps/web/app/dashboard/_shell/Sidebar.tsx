import SidebarNav from './SidebarNav'
import type { NavGroup } from './nav'

/** The 238px desktop rail: section-grouped nav + a scope card. */
export default function Sidebar({
  groups,
  scope,
}: {
  groups: NavGroup[]
  scope: 'agency' | 'project' | 'family'
}) {
  return (
    <aside className="shell-sidebar">
      <SidebarNav groups={groups} />
      {scope === 'project' && (
        <div className="shell-scope">
          <div className="h">Data scope</div>
          <div className="b">
            You are <strong>FULL</strong> on this project. Vendors see only their own booking; family
            sees the schedule only.
          </div>
        </div>
      )}
      {scope === 'family' && (
        <div className="shell-scope">
          <div className="h">Read-only</div>
          <div className="b">
            You can see the <strong>schedule</strong>. Money and vendor operations stay hidden.
          </div>
        </div>
      )}
    </aside>
  )
}
