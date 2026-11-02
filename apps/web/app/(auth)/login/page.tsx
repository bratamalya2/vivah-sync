'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import { signIn, type FormState } from './actions'
import AuthField from '../AuthField'

export default function LoginPage() {
  const [state, action, pending] = useActionState<FormState, FormData>(signIn, null)

  return (
    <>
      <h1 className="au-title">Sign in</h1>
      <p className="au-lead">Welcome back — your weddings are waiting.</p>

      <form action={action} className="au-form">
        {state?.error && <p className="err">{state.error}</p>}
        <AuthField
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          defaultValue={state?.email}
          required
        />
        <AuthField
          label="Password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
        <button type="submit" className="au-submit" disabled={pending}>
          {pending ? 'Signing in…' : 'Sign in'}
        </button>
      </form>

      <p className="au-switch">
        No account? <Link href="/signup">Create your agency</Link>
      </p>
    </>
  )
}
