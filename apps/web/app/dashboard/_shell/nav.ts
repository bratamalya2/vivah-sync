/**
 * Pure nav-config builders (no React) — server-built, passed as serializable
 * data into the client SidebarNav / BottomTabs. `match` controls active-state:
 * 'exact' = only this exact path; 'startsWith' = this path or a descendant.
 */
export type NavItem = {
  label: string
  href: string
  icon: string
  badge?: string
  badgeHigh?: boolean
  match?: 'exact' | 'startsWith'
}
export type NavGroup = { label: string; items: NavItem[] }
export type RiskCount = { count: number; high: number }

const agencyItems: NavItem[] = [
  { label: 'Weddings', href: '/dashboard', icon: 'grid', match: 'exact' },
  { label: 'Venues', href: '/dashboard/venues', icon: 'venue', match: 'startsWith' },
  { label: 'Vendors', href: '/dashboard/vendors', icon: 'vendors', match: 'startsWith' },
]

export function agencyGroups(): NavGroup[] {
  return [{ label: 'Agency', items: agencyItems }]
}

export function projectGroups(id: string, projectName: string, risks?: RiskCount): NavGroup[] {
  const base = `/dashboard/projects/${id}`
  return [
    { label: 'Agency', items: agencyItems },
    {
      label: projectName || 'Project',
      items: [
        { label: 'Run of show', href: base, icon: 'calendar', match: 'exact' },
        { label: 'Guests', href: `${base}/guests`, icon: 'vendors', match: 'startsWith' },
        { label: 'Travel', href: `${base}/travel`, icon: 'arrow', match: 'startsWith' },
        { label: 'Hotels', href: `${base}/hotels`, icon: 'venue', match: 'startsWith' },
        { label: 'Messaging', href: `${base}/broadcast`, icon: 'message', match: 'startsWith' },
        { label: 'Vendors', href: `${base}/vendors`, icon: 'vendors', match: 'startsWith' },
        { label: 'Contracts', href: `${base}/contracts`, icon: 'file', match: 'startsWith' },
        { label: 'Ledger', href: `${base}/ledger`, icon: 'rupee', match: 'startsWith' },
        {
          label: 'Risks',
          href: `${base}/risks`,
          icon: 'alert',
          match: 'startsWith',
          badge: risks && risks.count > 0 ? String(risks.count) : undefined,
          badgeHigh: !!(risks && risks.high > 0),
        },
        { label: 'Playbook', href: `${base}/playbook`, icon: 'file', match: 'startsWith' },
        { label: 'Audit', href: `${base}/audit`, icon: 'list', match: 'startsWith' },
        { label: 'Family', href: `${base}/family`, icon: 'family', match: 'startsWith' },
      ],
    },
  ]
}

export function familyGroups(id?: string): NavGroup[] {
  const items: NavItem[] = [{ label: 'My weddings', href: '/family', icon: 'grid', match: 'exact' }]
  if (id) items.push({ label: 'Schedule', href: `/family/${id}`, icon: 'calendar', match: 'exact' })
  return [{ label: 'Family view', items }]
}

export function agencyTabs(): NavItem[] {
  return agencyItems
}

export function projectTabs(id: string, risks?: RiskCount): NavItem[] {
  const base = `/dashboard/projects/${id}`
  return [
    { label: 'Schedule', href: base, icon: 'calendar', match: 'exact' },
    {
      label: 'Risks',
      href: `${base}/risks`,
      icon: 'alert',
      match: 'startsWith',
      badge: risks && risks.count > 0 ? String(risks.count) : undefined,
      badgeHigh: !!(risks && risks.high > 0),
    },
    { label: 'Vendors', href: `${base}/vendors`, icon: 'vendors', match: 'startsWith' },
    { label: 'Money', href: `${base}/ledger`, icon: 'rupee', match: 'startsWith' },
    { label: 'Playbook', href: `${base}/playbook`, icon: 'file', match: 'startsWith' },
  ]
}

export function familyTabs(id?: string): NavItem[] {
  const items: NavItem[] = [{ label: 'Weddings', href: '/family', icon: 'grid', match: 'exact' }]
  if (id) items.push({ label: 'Schedule', href: `/family/${id}`, icon: 'calendar', match: 'exact' })
  return items
}

export function vendorGroups(pending?: number): NavGroup[] {
  return [
    {
      label: 'Vendor',
      items: [
        {
          label: 'My bookings',
          href: '/vendor',
          icon: 'calendar',
          match: 'exact',
          badge: pending && pending > 0 ? String(pending) : undefined,
        },
      ],
    },
  ]
}

export function vendorTabs(pending?: number): NavItem[] {
  return [
    {
      label: 'Bookings',
      href: '/vendor',
      icon: 'calendar',
      match: 'exact',
      badge: pending && pending > 0 ? String(pending) : undefined,
    },
  ]
}
