'use client'

import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { WORDMARK } from './wordmark'

const MIN_MS = 1800 // let the blueprint and wordmark land
const MAX_MS = 4000 // never hold the page hostage to a slow video
const EXIT_MS = 950 // curtain lift (incl. its delay) before unmounting

function seen(key: string): boolean {
  try {
    return sessionStorage.getItem(key) === '1'
  } catch {
    return true
  }
}

/**
 * The loading screen itself: a drifting maroon blueprint grid with the
 * wordmark and a gold progress rule. It lifts once the hero video can play
 * (after a short minimum), then unmounts. The inline gate in LandingIntro has
 * already hidden it before paint if this session saw it; the layout effect
 * covers client-side navigations, where that inline script doesn't run.
 */
export default function IntroCurtain({ storageKey }: { storageKey: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const show = useRef<boolean | null>(null)
  const [phase, setPhase] = useState<'on' | 'leaving' | 'gone'>('on')

  useLayoutEffect(() => {
    // Decide once — Strict Mode re-runs effects, and we mark the session below.
    if (show.current === null) {
      show.current = !seen(storageKey)
      if (show.current) {
        try {
          sessionStorage.setItem(storageKey, '1')
        } catch {}
      }
    }
    if (!show.current) {
      setPhase('gone')
      return
    }
    ref.current?.setAttribute('data-intro', '')

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const minMs = reduce ? 500 : MIN_MS
    const timers: number[] = []
    let done = false
    // performance.now() counts from navigation start — the curtain has been
    // on screen since first paint, not just since hydration.
    const finish = () => {
      if (done) return
      done = true
      timers.push(
        window.setTimeout(
          () => {
            setPhase('leaving')
            timers.push(window.setTimeout(() => setPhase('gone'), reduce ? 350 : EXIT_MS))
          },
          Math.max(0, minMs - performance.now()),
        ),
      )
    }

    const video = document.querySelector<HTMLVideoElement>('.lp-vh-video')
    if (!video || video.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) finish()
    else video.addEventListener('canplay', finish, { once: true })
    timers.push(window.setTimeout(finish, Math.max(0, MAX_MS - performance.now())))

    return () => {
      timers.forEach(clearTimeout)
      video?.removeEventListener('canplay', finish)
    }
  }, [storageKey])

  if (phase === 'gone') return null

  return (
    <div
      id="lp-intro"
      ref={ref}
      className={phase === 'leaving' ? 'lp-intro is-leaving' : 'lp-intro'}
      aria-hidden="true"
      // the inline gate sets data-intro / data-skip before hydration
      suppressHydrationWarning
    >
      <div className="lp-intro-grid" />
      <div className="lp-intro-noise" />
      <div className="lp-intro-content">
        <div className="lp-kicker">Setting the stage</div>
        <div className="lp-intro-mark">
          {WORDMARK.map(({ ch, gold }, i) => (
            <span key={i} className={gold ? 'gold' : undefined} style={{ '--i': i } as CSSProperties}>
              {ch}
            </span>
          ))}
        </div>
        <div className="lp-intro-bar">
          <span />
        </div>
      </div>
    </div>
  )
}
