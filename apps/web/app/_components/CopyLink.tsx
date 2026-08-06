'use client'

import { useState } from 'react'

/** Copies an absolute app URL (built from the current origin) to the clipboard. */
export default function CopyLink({
  token,
  path = 'rsvp',
  label = 'Copy RSVP link',
  className = 'mini ghostmini',
}: {
  token: string
  path?: string
  label?: string
  className?: string
}) {
  const [done, setDone] = useState(false)
  return (
    <button
      type="button"
      className={className}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(`${window.location.origin}/${path}/${token}`)
          setDone(true)
          setTimeout(() => setDone(false), 1500)
        } catch {
          /* clipboard blocked — ignore */
        }
      }}
    >
      {done ? 'Copied ✓' : label}
    </button>
  )
}
