import type { ReactNode } from 'react'

/** Replaces each page's old `.dashhead`: an uppercase kicker + the page title,
 *  with optional right-aligned actions. */
export default function PageHeader({
  kicker,
  title,
  children,
}: {
  kicker?: string
  title: ReactNode
  children?: ReactNode
}) {
  return (
    <div className="pagehead">
      <div>
        {kicker && <div className="kicker">{kicker}</div>}
        <h1>{title}</h1>
      </div>
      {children && <div className="pageheadactions">{children}</div>}
    </div>
  )
}
