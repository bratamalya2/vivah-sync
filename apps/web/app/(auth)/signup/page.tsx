'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import { signUp, type FormState } from './actions'
import AuthField from '../AuthField'

export default function SignupPage() {
  const [state, action, pending] = useActionState<FormState, FormData>(signUp, null)

  return (
    <>
      <h1 className="au-title">Create your agency</h1>
      <p className="au-lead">Set up your planning agency in minutes. Free to start.</p>

      <form action={action} className="au-form">
        {state?.error && <p className="err">{state.error}</p>}
        {state?.message && <p className="ok">{state.message}</p>}
        <div className="au-row">
          <AuthField
            label="First name"
            name="firstName"
            type="text"
            autoComplete="given-name"
            defaultValue={state?.values?.firstName}
          />
          <AuthField
            label="Last name"
            name="lastName"
            type="text"
            autoComplete="family-name"
            defaultValue={state?.values?.lastName}
          />
        </div>
        <AuthField
          label="Work email"
          name="email"
          type="email"
          autoComplete="email"
          defaultValue={state?.values?.email}
          required
        />
        <div>
          <AuthField
            label="Password"
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
          />
          <span className="hint au-hint">At least 8 characters</span>
        </div>
        <button type="submit" className="au-submit" disabled={pending}>
          {pending ? 'Creating…' : 'Create account'}
        </button>
      </form>

      <p className="au-switch">
        Already have an account? <Link href="/login">Sign in</Link>
      </p>
    </>
  )
}
