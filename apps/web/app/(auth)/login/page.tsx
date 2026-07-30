'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import { signIn, type FormState } from './actions'

export default function LoginPage() {
  const [state, action, pending] = useActionState<FormState, FormData>(signIn, null)

  return (
    <main className="authwrap">
      <form action={action} className="authcard">
        <div className="authbrand">
          Vivah<span>Sync</span>
        </div>
        <h1>Sign in</h1>
        {state?.error && <p className="err">{state.error}</p>}
        <label>
          Email
          <input name="email" type="email" autoComplete="email" required />
        </label>
        <label>
          Password
          <input name="password" type="password" autoComplete="current-password" required />
        </label>
        <button type="submit" disabled={pending}>
          {pending ? 'Signing in…' : 'Sign in'}
        </button>
        <p className="muted">
          No account? <Link href="/signup">Create your agency</Link>
        </p>
      </form>
    </main>
  )
}
