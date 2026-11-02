'use client'

import { useEffect, useRef } from 'react'

/**
 * Background video for the landing hero. Each viewport downloads only its own
 * cut (mobile ≤760px, desktop otherwise). React doesn't serialize `muted` into
 * server HTML, which blocks iOS autoplay — so it's set on the element here.
 * Reduced-motion users get the paused poster frame instead of a moving loop.
 */
export default function HeroVideo() {
  const ref = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.muted = true
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      el.pause()
      return
    }
    el.play().catch(() => {
      // Autoplay refused (e.g. data-saver) — the poster stays up, which is fine.
    })
  }, [])

  return (
    <video
      ref={ref}
      className="lp-vh-video"
      autoPlay
      muted
      loop
      playsInline
      preload="metadata"
      poster="/img/hero-baraat.jpg"
      aria-hidden="true"
      tabIndex={-1}
    >
      <source src="/videos/hero_mobile.mp4" type="video/mp4" media="(max-width: 760px)" />
      <source src="/videos/hero_pc.mp4" type="video/mp4" />
    </video>
  )
}
