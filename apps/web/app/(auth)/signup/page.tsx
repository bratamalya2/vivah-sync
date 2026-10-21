'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import { signUp, type FormState } from './actions'
import BrandLogo from '@/app/_components/BrandLogo'

export default function SignupPage() {
  const [state, action, pending] = useActionState<FormState, FormData>(signUp, null)

  return (
    <main className="authwrap">
      <form action={action} className="authcard">
        <BrandLogo className="auth-logo" />
        <h1>Create your agency</h1>
        {state?.error && <p className="err">{state.error}</p>}
        {state?.message && <p className="ok">{state.message}</p>}
        <label>
          Your name
          <input name="fullName" type="text" autoComplete="name" />
        </label>
        <label>
          Work email
          <input name="email" type="email" autoComplete="email" required />
        </label>
        <label>
          Password
          <input
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
          />
          <span className="hint">At least 8 characters</span>
        </label>
        <button type="submit" disabled={pending}>
          {pending ? 'Creating…' : 'Create account'}
        </button>
        <p className="muted">
          Already have an account? <Link href="/login">Sign in</Link>
        </p>
      </form>
    </main>
  )
}
