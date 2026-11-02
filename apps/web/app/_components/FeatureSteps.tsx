'use client'

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'

export interface FeatureStep {
  /** Short label shown above the title — e.g. "Run-of-show". */
  step: string
  title: string
  content: string
  points: string[]
  /** Rendered on the server and passed through; swapped in the media stage. */
  media: ReactNode
}

/**
 * Auto-advancing feature tour: a step list on one side, one media panel at a
 * time on the other. The active step's gold progress rule is a CSS animation;
 * its animationend advances the tour, so anything that pauses the animation
 * (hover, keyboard focus, off-screen, the Pause button) also pauses the tour.
 * Under reduced motion the rule never animates, so the tour only moves on click.
 */
export default function FeatureSteps({
  features,
  autoPlayInterval = 6000,
}: {
  features: FeatureStep[]
  autoPlayInterval?: number
}) {
  const [current, setCurrent] = useState(0)
  const [leaving, setLeaving] = useState<number | null>(null)
  const [paused, setPaused] = useState(false)
  const [inView, setInView] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting), { threshold: 0.35 })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  const go = (i: number) => {
    if (i === current) return
    setLeaving(current)
    setCurrent(i)
  }

  const idle = paused || !inView

  return (
    <div
      ref={ref}
      className={`lp-fs${idle ? ' is-idle' : ''}`}
      style={{ '--fs-interval': `${autoPlayInterval}ms` } as CSSProperties}
    >
      <div className="lp-fs-side">
        <ol className="lp-fs-steps">
          {features.map((f, i) => {
            const state = i === current ? ' is-on' : i < current ? ' is-done' : ''
            return (
              <li key={f.step} className={`lp-fs-step${state}`}>
                <button
                  type="button"
                  className="lp-fs-btn"
                  aria-current={i === current ? 'step' : undefined}
                  aria-controls={`lp-fs-panel-${i}`}
                  onClick={() => go(i)}
                >
                  <span className="lp-fs-mark" aria-hidden="true">
                    {i < current ? '✓' : i + 1}
                  </span>
                  <span className="lp-fs-text">
                    <span className="lp-feat-eyebrow">{f.step}</span>
                    <span className="lp-fs-title">{f.title}</span>
                  </span>
                </button>
                <div className="lp-fs-more">
                  <div>
                    <p className="lp-feat-body">{f.content}</p>
                    <ul className="lp-feat-list">
                      {f.points.map((p) => (
                        <li key={p}>{p}</li>
                      ))}
                    </ul>
                  </div>
                </div>
                {i === current && (
                  <span className="lp-fs-progress" aria-hidden="true">
                    <span
                      key={current}
                      onAnimationEnd={() => go((current + 1) % features.length)}
                    />
                  </span>
                )}
              </li>
            )
          })}
        </ol>
        <button
          type="button"
          className="lp-fs-toggle"
          aria-pressed={paused}
          onClick={() => setPaused((p) => !p)}
        >
          {paused ? 'Play tour' : 'Pause tour'}
        </button>
      </div>

      <div className="lp-fs-stage">
        {features.map((f, i) => (
          <div
            key={f.step}
            id={`lp-fs-panel-${i}`}
            className={`lp-fs-panel${i === current ? ' is-on' : i === leaving ? ' is-leaving' : ''}`}
          >
            {f.media}
          </div>
        ))}
      </div>
    </div>
  )
}
