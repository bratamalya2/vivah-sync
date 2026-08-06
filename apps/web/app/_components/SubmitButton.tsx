'use client'

import { useFormStatus } from 'react-dom'
import type { ReactNode } from 'react'

/**
 * A submit button that disables itself and (optionally) swaps its label while its
 * parent <form action={serverAction}> is in flight — instant feedback for the
 * inline server-action forms that don't use useActionState.
 */
export default function SubmitButton({
  children,
  pendingLabel,
  className,
  disabled,
}: {
  children: ReactNode
  pendingLabel?: string
  className?: string
  disabled?: boolean
}) {
  const { pending } = useFormStatus()
  return (
    <button type="submit" className={className} disabled={pending || disabled} aria-busy={pending}>
      {pending ? (pendingLabel ?? children) : children}
    </button>
  )
}
