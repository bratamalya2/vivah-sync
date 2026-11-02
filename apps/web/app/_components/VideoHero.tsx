import Link from 'next/link'
import type { CSSProperties } from 'react'
import HeroVideo from './HeroVideo'
import { WORDMARK } from './wordmark'

/** Full-screen video hero for the marketing landing page, with its nav overlaid. */
export default function VideoHero({
  startHref,
  startLabel,
  signedIn,
}: {
  startHref: string
  startLabel: string
  signedIn: boolean
}) {
  return (
    <header className="lp-vh">
      <HeroVideo />
      <div className="lp-vh-noise" aria-hidden="true" />
      <div className="lp-vh-shade" aria-hidden="true" />

      <nav className="lp-vh-nav" aria-label="Main">
        <a href="#features" className="lp-vh-navlink hide-sm">
          What it does
        </a>
        <a href="#how" className="lp-vh-navlink hide-sm">
          How it works
        </a>
        {!signedIn && (
          <Link href="/login" className="lp-vh-navlink">
            Sign in
          </Link>
        )}
        <Link href={startHref} className="lp-btn gold sm">
          {startLabel}
        </Link>
      </nav>

      <div className="lp-vh-content">
        <h1 className="lp-vh-mark" aria-label="VivahSync">
          {WORDMARK.map(({ ch, gold }, i) => (
            <span
              key={i}
              aria-hidden="true"
              className={gold ? 'gold' : undefined}
              style={{ '--i': i } as CSSProperties}
            >
              {ch}
            </span>
          ))}
        </h1>

        <div className="lp-vh-copy">
          <div className="lp-kicker">The operational system of record for wedding planners</div>
          <p className="lp-vh-lead">
            Run every Indian wedding like a <em>production.</em>
          </p>
          <p className="lp-vh-sub">
            VivahSync keeps a multi-day wedding — every ceremony, venue, vendor and payment — in one
            place your whole team trusts. The sequence holds, nothing double-books, and the big day
            runs to plan.
          </p>
          <div className="lp-cta-row">
            <Link href={startHref} className="lp-btn gold">
              {startLabel}
              <svg
                width={16}
                height={16}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2.2}
                strokeLinecap="square"
                aria-hidden="true"
                className="lp-vh-arrow"
              >
                <path d="M4 12h15M13 6l6 6-6 6" />
              </svg>
            </Link>
            {!signedIn && (
              <Link href="/login" className="lp-btn light">
                Sign in
              </Link>
            )}
          </div>
          {!signedIn && <p className="lp-note">Free to start · No card required</p>}
        </div>
      </div>
    </header>
  )
}
