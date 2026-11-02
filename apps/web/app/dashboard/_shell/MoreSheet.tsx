'use client'

import { useEffect, useRef, type MouseEvent } from 'react'
import { usePathname } from 'next/navigation'
import { signOutAction } from '@/app/dashboard/actions'
import { Icon } from './icons'
import SidebarNav from './SidebarNav'
import type { NavGroup } from './nav'

/**
 * The bottom bar's "More" tab (≤900px, where the sidebar is hidden): a bottom
 * sheet listing every section the sidebar would, plus who's signed in and a
 * Sign out button — the only way to reach either on a phone. A native <dialog>
 * opened with showModal() gives focus trapping, Esc-to-close and a backdrop.
 */
export default function MoreSheet({
  groups,
  userName,
  userEmail,
}: {
  groups: NavGroup[]
  userName: string
  userEmail: string
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const pathname = usePathname()

  useEffect(() => {
    ref.current?.close()
  }, [pathname])

  // backdrop clicks land on the <dialog> itself; link clicks close it even when
  // they point at the page we're already on (no pathname change)
  const onDialogClick = (e: MouseEvent<HTMLDialogElement>) => {
    if (e.target === e.currentTarget || (e.target as Element).closest('a')) e.currentTarget.close()
  }

  return (
    <>
      <button
        type="button"
        className="shell-tab"
        aria-haspopup="dialog"
        onClick={() => ref.current?.showModal()}
      >
        <span style={{ position: 'relative', display: 'grid', placeItems: 'center' }}>
          <Icon name="menu" size={20} />
        </span>
        <span className="tlbl">More</span>
      </button>

      <dialog ref={ref} className="shell-sheet" aria-labelledby="shell-sheet-title" onClick={onDialogClick}>
        <div className="shell-sheet-head">
          <span id="shell-sheet-title">All sections</span>
          <button
            type="button"
            className="shell-sheet-x"
            aria-label="Close"
            onClick={() => ref.current?.close()}
          >
            <Icon name="x" size={18} />
          </button>
        </div>
        <nav aria-label="All sections">
          <SidebarNav groups={groups} />
        </nav>
        <div className="shell-sheet-user">
          <div className="who">
            {userName && <span className="n">{userName}</span>}
            <span className="e">{userEmail}</span>
          </div>
          <form action={signOutAction}>
            <button type="submit" className="shell-sheet-signout">
              Sign out
            </button>
          </form>
        </div>
      </dialog>
    </>
  )
}
