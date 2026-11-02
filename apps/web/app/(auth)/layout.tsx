import Link from 'next/link'
import BrandLogo from '@/app/_components/BrandLogo'

/**
 * Shared frame for /login and /signup: the form pane on the left, a maroon
 * panel with a slow gold grain-gradient on the right (stacked below on
 * narrow screens). Each page renders only its form.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="au">
      <section className="au-pane">
        <div className="au-pane-in">
          <Link href="/" className="au-brand" aria-label="VivahSync home">
            <BrandLogo className="au-logo" />
          </Link>
          {children}
        </div>
      </section>

      <aside className="au-art">
        <div className="au-art-glow" aria-hidden="true" />
        <div className="au-art-grain" aria-hidden="true" />
        <div className="au-art-in">
          <div>
            <p className="au-art-title">
              Every ritual,
              <br />
              <em>in its place.</em>
            </p>
            <p className="au-art-sub">
              One system for every ceremony, venue, vendor and payment — so the big day runs to
              plan.
            </p>
          </div>
          <Link href="/" className="lp-btn light au-art-link">
            <svg
              width={16}
              height={16}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.2}
              strokeLinecap="square"
              aria-hidden="true"
            >
              <path d="M20 12H5M11 6l-6 6 6 6" />
            </svg>
            Back to VivahSync
          </Link>
        </div>
      </aside>
    </main>
  )
}
