'use client'

import { useActionState, useEffect, useRef } from 'react'
import { createWedding, type FormState } from './actions'

export default function NewWeddingForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(createWedding, null)
  const formRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    if (state?.ok) formRef.current?.reset()
  }, [state])

  return (
    <form action={action} ref={formRef} className="newform">
      {state?.error && <p className="err">{state.error}</p>}
      {state?.ok && <p className="ok">Wedding added.</p>}
      <label>
        Client / wedding name
        <input name="name" type="text" required placeholder="Mehra–Kapoor" />
      </label>
      <label>
        City
        <input name="city" type="text" required placeholder="Jaipur" />
      </label>
      <div className="row2">
        <label>
          Start date
          <input name="startDate" type="date" required />
        </label>
        <label>
          End date
          <input name="endDate" type="date" required />
        </label>
      </div>
      <label>
        Expected guests
        <input name="guestCount" type="number" min={0} placeholder="400" />
      </label>
      <button type="submit" disabled={pending}>
        {pending ? 'Adding…' : 'Add wedding'}
      </button>
    </form>
  )
}
