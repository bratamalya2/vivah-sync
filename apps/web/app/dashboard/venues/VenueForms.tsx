'use client'

import { useActionState, useEffect, useRef } from 'react'
import { addVenue, addSpace, type FormState } from './actions'

export function AddVenueForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(addVenue, null)
  const ref = useRef<HTMLFormElement>(null)
  useEffect(() => {
    if (state?.ok) ref.current?.reset()
  }, [state])

  return (
    <form action={action} ref={ref} className="newform">
      {state?.error && <p className="err">{state.error}</p>}
      {state?.ok && <p className="ok">Venue added.</p>}
      <label>
        Venue name
        <input name="name" required placeholder="Rambagh Palace" />
      </label>
      <label>
        Address
        <input name="address" placeholder="Bhawani Singh Rd, Jaipur" />
      </label>
      <div className="row2">
        <label>
          Contact
          <input name="contactName" placeholder="Mr. Sharma" />
        </label>
        <label>
          Phone
          <input name="contactPhone" placeholder="+91…" />
        </label>
      </div>
      <button type="submit" disabled={pending}>
        {pending ? 'Adding…' : 'Add venue'}
      </button>
    </form>
  )
}

export function AddSpaceForm({ venues }: { venues: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState<FormState, FormData>(addSpace, null)
  const ref = useRef<HTMLFormElement>(null)
  useEffect(() => {
    if (state?.ok) ref.current?.reset()
  }, [state])

  if (venues.length === 0) {
    return <p className="muted">Add a venue first, then you can add its spaces.</p>
  }

  return (
    <form action={action} ref={ref} className="newform">
      {state?.error && <p className="err">{state.error}</p>}
      {state?.ok && <p className="ok">Space added.</p>}
      <label>
        Venue
        <select name="venueId" required defaultValue="">
          <option value="" disabled>
            Select a venue…
          </option>
          {venues.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Space name
        <input name="name" required placeholder="Front Lawn" />
      </label>
      <div className="row2">
        <label>
          Comfortable
          <input name="comfortCapacity" type="number" min={0} placeholder="350" />
        </label>
        <label>
          Legal max
          <input name="legalMaxCapacity" type="number" min={0} placeholder="500" />
        </label>
      </div>
      <button type="submit" disabled={pending}>
        {pending ? 'Adding…' : 'Add space'}
      </button>
    </form>
  )
}
