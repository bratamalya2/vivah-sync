'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Icon } from './icons'
import type { NavGroup } from './nav'

function isActive(pathname: string, href: string, match?: 'exact' | 'startsWith') {
  if (match === 'startsWith') return pathname === href || pathname.startsWith(`${href}/`)
  return pathname === href
}

export default function SidebarNav({ groups }: { groups: NavGroup[] }) {
  const pathname = usePathname()
  return (
    <>
      {groups.map((g) => (
        <div key={g.label}>
          <div className="shell-navgroup">{g.label}</div>
          {g.items.map((it) => (
            <Link
              key={it.href}
              href={it.href}
              className="shell-navitem"
              aria-current={isActive(pathname, it.href, it.match) ? 'page' : undefined}
            >
              <span className="shell-navicon">
                <Icon name={it.icon} size={15} />
              </span>
              <span className="lbl">{it.label}</span>
              {it.badge && <span className={`bdg${it.badgeHigh ? ' high' : ''}`}>{it.badge}</span>}
            </Link>
          ))}
        </div>
      ))}
    </>
  )
}
