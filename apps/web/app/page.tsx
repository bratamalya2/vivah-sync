/* eslint-disable @next/next/no-img-element */
import Link from 'next/link'
import { getUser } from '@/lib/auth'

export const dynamic = 'force-dynamic'

const ICON: Record<string, string> = {
  calendar: 'M8 2v4M16 2v4M3 10h18M3 6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  grid: 'M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z',
  users:
    'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 7a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
  rupee: 'M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6',
  venue: 'M3 21h18M6 21V7l6-4 6 4v14M10 9h4M10 13h4M10 17h4',
  shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
  chevron: 'm9 18 6-6-6-6',
}

function Ico({ n, s = 20 }: { n: string; s?: number }) {
  const d = ICON[n]
  if (!d) return null
  return (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
  )
}

export default async function LandingPage() {
  const user = await getUser()
  const startHref = user ? '/home' : '/signup'
  const startLabel = user ? 'Go to your workspace' : 'Start free'

  return (
    <div className="lp">
      {/* nav */}
      <nav className="lp-nav">
        <div className="lp-nav-in">
          <Link href="/" className="lp-brand">
            <span className="lp-mark">∞</span>
            <span className="lp-word">
              Vivah<span>Sync</span>
            </span>
          </Link>
          <div className="lp-navlinks">
            <a href="#features" className="lp-navlink hide-sm">
              What it does
            </a>
            <a href="#how" className="lp-navlink hide-sm">
              How it works
            </a>
            {!user && (
              <Link href="/login" className="lp-navlink">
                Sign in
              </Link>
            )}
            <Link href={startHref} className="lp-btn primary sm">
              {startLabel}
            </Link>
          </div>
        </div>
      </nav>

      {/* hero */}
      <header className="lp-hero">
        <div className="lp-hero-in">
          <div>
            <div className="lp-kicker">The operational system of record for wedding planners</div>
            <h1 className="lp-h1">
              Run every Indian wedding like a <em>production.</em>
            </h1>
            <p className="lp-sub">
              VivahSync keeps a multi-day wedding — every ceremony, venue, vendor and payment — in
              one place your whole team trusts. The sequence holds, nothing double-books, and the big
              day runs to plan.
            </p>
            <div className="lp-cta-row">
              <Link href={startHref} className="lp-btn primary">
                {startLabel}
              </Link>
              {!user && (
                <Link href="/login" className="lp-btn ghost">
                  Sign in
                </Link>
              )}
            </div>
            {!user && (
              <p className="lp-note" style={{ marginTop: 14 }}>
                Free to start · No card required
              </p>
            )}
          </div>
          <figure className="lp-figure lp-hero-figure">
            <img
              className="lp-img"
              src="/img/hero-baraat.jpg"
              alt="A baraat — the groom's wedding procession — in Jaipur"
              loading="eager"
              decoding="async"
            />
            <div className="lp-chip">
              <div className="n">6 ceremonies</div>
              <div className="l">Haldi to Vidaai — sequenced on one run-of-show.</div>
            </div>
          </figure>
        </div>
      </header>

      {/* stat band */}
      <section className="lp-stats">
        <div className="lp-stats-in">
          <div className="lp-stat">
            <div className="n maroon">5 days</div>
            <div className="l">of ceremonies on one continuous run-of-show</div>
          </div>
          <div className="lp-stat">
            <div className="n gold">Zero</div>
            <div className="l">double-booked spaces — the system won&rsquo;t save one</div>
          </div>
          <div className="lp-stat">
            <div className="n">1 view</div>
            <div className="l">a read-only schedule for the couple&rsquo;s family</div>
          </div>
          <div className="lp-stat">
            <div className="n gold">100%</div>
            <div className="l">of changes kept on an auditable record</div>
          </div>
        </div>
      </section>

      {/* photo band */}
      <section className="lp-band">
        <div className="lp-band-in">
          <div>
            <figure className="lp-figure lp-bandfig">
              <img
                className="lp-img"
                src="/img/ceremony-fire.jpg"
                alt="Sacred fire ritual at a Hindu wedding"
                loading="lazy"
                decoding="async"
              />
            </figure>
            <p className="lp-bandcap">
              <strong>Every ritual, in its place.</strong> The pheras, the muhurat, the timings —
              held to the plan.
            </p>
          </div>
          <div>
            <figure className="lp-figure lp-bandfig">
              <img
                className="lp-img"
                src="/img/garlands.jpg"
                alt="Bride and groom exchanging flower garlands"
                loading="lazy"
                decoding="async"
              />
            </figure>
            <p className="lp-bandcap">
              <strong>Nothing left to chance.</strong> Vendors, spaces and payments — coordinated to
              the moment.
            </p>
          </div>
        </div>
      </section>

      {/* features */}
      <section className="lp-sec" id="features">
        <div className="lp-sec-in">
          <div className="lp-sec-head">
            <div className="lp-kicker">What it does</div>
            <h2 className="lp-sec-title">
              Everything a wedding needs to run — <em>in one system.</em>
            </h2>
            <p className="lp-sec-lead">
              From the first ceremony slot to the final payment, VivahSync gives your team a single
              place to plan, coordinate and track — with the guardrails that keep a big, moving event
              from slipping.
            </p>
          </div>

          {/* run-of-show */}
          <div className="lp-feature">
            <div>
              <div className="lp-feat-eyebrow">Run-of-show</div>
              <h3 className="lp-feat-title">One timeline for the whole celebration</h3>
              <p className="lp-feat-body">
                Lay out every ceremony across the days, with setup and teardown built in. Move one
                and the whole team sees it — the schedule always tells the truth.
              </p>
              <ul className="lp-feat-list">
                <li>Sangeet, Haldi, Mehndi and the Pheras, in sequence</li>
                <li>Setup and teardown time reserved automatically</li>
                <li>Reschedule with a clear record of what changed</li>
              </ul>
            </div>
            <div className="lp-feat-media">
              <div className="lp-info">
                <div className="lp-info-head">
                  <span>Run-of-show · Mehra–Kapoor</span>
                  <span>5 days</span>
                </div>
                <div className="lp-info-body">
                  <div className="lp-gantt">
                    {[
                      { l: 'Haldi', left: 3, w: 13, c: 'var(--vs-gold-500)' },
                      { l: 'Mehndi', left: 23, w: 13, c: 'var(--vs-gold-600)' },
                      { l: 'Sangeet', left: 43, w: 15, c: 'var(--maroon)' },
                      { l: 'Pheras', left: 63, w: 21, c: 'var(--vs-maroon-500)' },
                      { l: 'Vidaai', left: 88, w: 9, c: 'var(--color-neutral-500)' },
                    ].map((b) => (
                      <div key={b.l} className="lp-grow">
                        <span className="lp-glabel">{b.l}</span>
                        <div className="lp-gtrack">
                          <div
                            className="lp-gbar"
                            style={{ left: `${b.left}%`, width: `${b.w}%`, background: b.c }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="lp-gaxis">
                    <span />
                    <div className="lp-gdays">
                      <span>Day 1</span>
                      <span>Day 2</span>
                      <span>Day 3</span>
                      <span>Day 4</span>
                      <span>Day 5</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* venues */}
          <div className="lp-feature rev">
            <div>
              <div className="lp-feat-eyebrow">Venues &amp; spaces</div>
              <h3 className="lp-feat-title">Book a space once. Never twice.</h3>
              <p className="lp-feat-body">
                Map each venue&rsquo;s spaces and their real capacity. Assign a ceremony and the
                calendar guards it — an overlap or an over-capacity room simply can&rsquo;t be saved.
              </p>
              <ul className="lp-feat-list">
                <li>Every space with its true guest capacity</li>
                <li>Overlapping bookings are refused, not just flagged</li>
                <li>See peak load before the day, not on it</li>
              </ul>
            </div>
            <div className="lp-feat-media">
              <div className="lp-info">
                <div className="lp-info-head">
                  <span>Fairmont Jaipur · peak load</span>
                  <span>4 spaces</span>
                </div>
                <div className="lp-info-body">
                  <div className="lp-cap">
                    {[
                      { s: 'Mughal Lawn', use: 520, cap: 600, pct: 87, warn: false },
                      { s: 'Regal Ballroom', use: 300, cap: 450, pct: 67, warn: false },
                      { s: 'Amber Terrace', use: 210, cap: 200, pct: 100, warn: true },
                    ].map((c) => (
                      <div key={c.s}>
                        <div className="lp-captop">
                          <span className="cs">{c.s}</span>
                          <span className="cn">
                            {c.use} / {c.cap}
                          </span>
                        </div>
                        <div className="lp-captrack">
                          <div
                            className={`lp-capfill${c.warn ? ' warn' : ''}`}
                            style={{ width: `${c.pct}%` }}
                          />
                        </div>
                        {c.warn && (
                          <div className="lp-capnote">
                            <Ico n="shield" s={13} /> Over capacity — this booking is refused.
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* vendors */}
          <div className="lp-feature">
            <div>
              <div className="lp-feat-eyebrow">Vendors</div>
              <h3 className="lp-feat-title">From shortlist to locked commitment</h3>
              <p className="lp-feat-body">
                Track every vendor from first enquiry to a confirmed booking. The moment they accept,
                the agreed scope is locked in — no quiet changes to what both sides signed up for.
              </p>
              <ul className="lp-feat-list">
                <li>A clear status for every engagement</li>
                <li>Acceptance locks the scope both sides agreed to</li>
                <li>Nothing slips between draft and confirmed</li>
              </ul>
            </div>
            <div className="lp-feat-media">
              <div className="lp-info">
                <div className="lp-info-head">
                  <span>Booking lifecycle</span>
                  <span>Photographer · Sharma Studios</span>
                </div>
                <div className="lp-info-body">
                  <div className="lp-flow">
                    <span className="lp-pill">Draft</span>
                    <span className="lp-arrow">
                      <Ico n="chevron" s={14} />
                    </span>
                    <span className="lp-pill">Sent</span>
                    <span className="lp-arrow">
                      <Ico n="chevron" s={14} />
                    </span>
                    <span className="lp-pill on">Accepted</span>
                    <span className="lp-arrow">
                      <Ico n="chevron" s={14} />
                    </span>
                    <span className="lp-pill">Confirmed</span>
                  </div>
                  <p className="lp-flownote">
                    Draft → Sent → Accepted → Confirmed moves in one direction. Once accepted, the
                    commitment is fixed — later edits never rewrite what the vendor agreed to.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* money */}
          <div className="lp-feature rev">
            <div>
              <div className="lp-feat-eyebrow">Money</div>
              <h3 className="lp-feat-title">An honest ledger, end to end</h3>
              <p className="lp-feat-body">
                Every rupee in and out on one ledger you can trust. Corrections stay visible as
                reversals — the trail is never quietly rewritten behind anyone&rsquo;s back.
              </p>
              <ul className="lp-feat-list">
                <li>Inflow, outflow and cash-on-hand at a glance</li>
                <li>Committed-but-unpaid, always current</li>
                <li>Mistakes are reversed on the record, never erased</li>
              </ul>
            </div>
            <div className="lp-feat-media">
              <div className="lp-info">
                <div className="lp-info-head">
                  <span>Money · Mehra–Kapoor</span>
                  <span>live</span>
                </div>
                <div className="lp-info-body" style={{ padding: 0 }}>
                  <div className="lp-kpis">
                    <div className="lp-kpi">
                      <div className="l">Inflow</div>
                      <div className="v gold">₹42.0L</div>
                    </div>
                    <div className="lp-kpi">
                      <div className="l">Outflow</div>
                      <div className="v dngr">₹28.6L</div>
                    </div>
                    <div className="lp-kpi">
                      <div className="l">Cash on hand</div>
                      <div className="v">₹13.4L</div>
                    </div>
                    <div className="lp-kpi">
                      <div className="l">Committed, unpaid</div>
                      <div className="v gold">₹9.2L</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* family */}
          <div className="lp-feature">
            <div>
              <div className="lp-feat-eyebrow">For the family</div>
              <h3 className="lp-feat-title">A calm, beautiful view for the couple&rsquo;s family</h3>
              <p className="lp-feat-body">
                Share a read-only schedule with the family — the ceremonies and their timings,
                nothing else. No pricing, no vendor logistics, no clutter. Just where to be, and when.
              </p>
              <ul className="lp-feat-list">
                <li>The run-of-show, beautifully simple</li>
                <li>Money and logistics stay hidden by design</li>
                <li>Always up to date, on any phone</li>
              </ul>
            </div>
            <div className="lp-feat-media">
              <figure className="lp-figure lp-feat-figure">
                <img
                  className="lp-img"
                  src="/img/mehndi.jpg"
                  alt="Intricate mehndi (henna) applied on a bride's hands"
                  loading="lazy"
                  decoding="async"
                />
              </figure>
            </div>
          </div>
        </div>
      </section>

      {/* differentiator */}
      <section className="lp-diff">
        <div className="lp-diff-in">
          <h2 className="lp-diff-title">
            Most tools let you save a broken plan. <em>VivahSync won&rsquo;t.</em>
          </h2>
          <p className="lp-diff-lead">
            A double-booked mandap, a ceremony outside the venue&rsquo;s hours, an unbalanced budget —
            the kinds of mistakes that only surface on the day. VivahSync is built to refuse them the
            moment you try to save, so the plan you&rsquo;re looking at is always one that can
            actually happen.
          </p>
          <div className="lp-diff-grid">
            <div className="lp-diff-cell">
              <span className="ico">
                <Ico n="calendar" s={22} />
              </span>
              <div className="t">No clashes</div>
              <div className="b">Two ceremonies can&rsquo;t hold the same space at the same time.</div>
            </div>
            <div className="lp-diff-cell">
              <span className="ico">
                <Ico n="venue" s={22} />
              </span>
              <div className="t">Within the rules</div>
              <div className="b">Bookings respect each venue&rsquo;s access hours and capacity.</div>
            </div>
            <div className="lp-diff-cell">
              <span className="ico">
                <Ico n="rupee" s={22} />
              </span>
              <div className="t">Balances that add up</div>
              <div className="b">Payment plans and the ledger are kept consistent, always.</div>
            </div>
          </div>
        </div>
      </section>

      {/* how it works */}
      <section className="lp-sec" id="how">
        <div className="lp-sec-in">
          <div className="lp-sec-head">
            <div className="lp-kicker">How it works</div>
            <h2 className="lp-sec-title">Three steps to a wedding under control</h2>
          </div>
          <div className="lp-steps">
            <div className="lp-step">
              <span className="s-ico">
                <Ico n="grid" s={24} />
              </span>
              <div className="s-n">Step 1</div>
              <div className="s-t">Set up the wedding</div>
              <div className="s-b">Add the couple, the dates, the venues and their bookable spaces.</div>
            </div>
            <div className="lp-step">
              <span className="s-ico">
                <Ico n="calendar" s={24} />
              </span>
              <div className="s-n">Step 2</div>
              <div className="s-t">Build the run-of-show</div>
              <div className="s-b">Place every ceremony across the days, with setup and teardown.</div>
            </div>
            <div className="lp-step">
              <span className="s-ico">
                <Ico n="users" s={24} />
              </span>
              <div className="s-n">Step 3</div>
              <div className="s-t">Coordinate &amp; track</div>
              <div className="s-b">
                Book vendors, record payments, and share the schedule with the family.
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* poster CTA */}
      <section className="lp-poster">
        <div className="lp-poster-in">
          <h2>
            Bring order to <em>the big day.</em>
          </h2>
          <p className="pp">
            Start free today. Set up your first wedding in minutes — no card, no commitment — and see
            a whole celebration come together in one place.
          </p>
          <div className="cta">
            <Link href={startHref} className="lp-btn gold">
              {startLabel}
            </Link>
            {!user && (
              <Link href="/login" className="lp-btn light">
                Sign in
              </Link>
            )}
            <span className="lp-note">Built for planners and the vendors they work with.</span>
          </div>
        </div>
      </section>

      {/* footer */}
      <footer className="lp-foot">
        <div className="lp-foot-in">
          <div>
            <div className="lp-foot-brand">
              Vivah<span>Sync</span>
            </div>
            <div className="lp-foot-tag">
              The operational system of record for Indian wedding planning agencies.
            </div>
            <div style={{ marginTop: 14, display: 'flex', gap: 12 }}>
              <Link href={startHref} className="lp-btn primary sm">
                {startLabel}
              </Link>
              {!user && (
                <Link href="/login" className="lp-btn ghost sm">
                  Sign in
                </Link>
              )}
            </div>
          </div>
          <div className="lp-credits">
            <span className="h">Photography</span>
            Wedding photographs via{' '}
            <a href="https://commons.wikimedia.org/" target="_blank" rel="noopener noreferrer">
              Wikimedia Commons
            </a>
            , used under their licenses — Baraat procession © Christian Haugen (CC BY 2.0); Fire
            ritual © Paolo Crosetto (CC BY-SA 2.0); Garland exchange © Sumita Roy Dutta (CC BY-SA
            4.0); Mehndi © Kritzolina (CC BY-SA 4.0). Presented in black &amp; white.
            <div style={{ marginTop: 12 }}>© 2026 VivahSync</div>
          </div>
        </div>
      </footer>
    </div>
  )
}
