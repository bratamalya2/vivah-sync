'use client'

import { useActionState } from 'react'
import { createAgency, type FormState } from './actions'
import BrandLogo from '@/app/_components/BrandLogo'

export default function OnboardingForm({ defaultFullName }: { defaultFullName: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(createAgency, null)

  return (
    <main className="authwrap">
      <form action={action} className="authcard">
        <BrandLogo className="auth-logo" />
        <h1>Set up your agency</h1>
        <p className="muted">
          This creates your workspace. You&apos;ll be able to invite teammates and add weddings
          next.
        </p>
        {state?.error && <p className="err">{state.error}</p>}
        <label>
          Agency name
          <input name="orgName" type="text" required autoFocus placeholder="e.g. Shubh Muhurat" />
        </label>
        <label>
          Your name
          <input name="fullName" type="text" defaultValue={defaultFullName} />
        </label>
        <button type="submit" disabled={pending}>
          {pending ? 'Creating…' : 'Create agency'}
        </button>
      </form>
    </main>
  )
}
