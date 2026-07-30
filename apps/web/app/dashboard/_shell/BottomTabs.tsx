'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Icon } from './icons'
import type { NavItem } from './nav'

function isActive(pathname: string, href: string, match?: 'exact' | 'startsWith') {
  if (match === 'startsWith') return pathname === href || pathname.startsWith(`${href}/`)
  return pathname === href
}

export default function BottomTabs({ tabs }: { tabs: NavItem[] }) {
  const pathname = usePathname()
  return (
    <nav
      className="shell-bottomtabs"
      style={{ gridTemplateColumns: `repeat(${tabs.length}, 1fr)` }}
    >
      {tabs.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          className="shell-tab"
          aria-current={isActive(pathname, t.href, t.match) ? 'page' : undefined}
        >
          <span style={{ position: 'relative', display: 'grid', placeItems: 'center' }}>
            <Icon name={t.icon} size={20} />
            {t.badge && <span className="tbadge">{t.badge}</span>}
          </span>
          <span className="tlbl">{t.label}</span>
        </Link>
      ))}
    </nav>
  )
}
