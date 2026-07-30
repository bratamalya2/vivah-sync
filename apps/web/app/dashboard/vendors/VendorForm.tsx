'use client'

import { useActionState, useEffect, useRef } from 'react'
import { VENDOR_CATEGORIES } from '@/lib/categories'
import { addVendor, type FormState } from './actions'

export default function VendorForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(addVendor, null)
  const ref = useRef<HTMLFormElement>(null)
  useEffect(() => {
    if (state?.ok) ref.current?.reset()
  }, [state])

  return (
    <form action={action} ref={ref} className="newform">
      {state?.error && <p className="err">{state.error}</p>}
      {state?.ok && <p className="ok">Vendor added to your roster.</p>}
      <label>
        Vendor name
        <input name="name" required placeholder="Ramesh Dhol Party" />
      </label>
      <label>
        Category
        <select name="category" required defaultValue="">
          <option value="" disabled>
            Select…
          </option>
          {VENDOR_CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </label>
      <div className="row2">
        <label>
          Contact
          <input name="contactName" placeholder="Ramesh" />
        </label>
        <label>
          Phone
          <input name="contactPhone" placeholder="+91…" />
        </label>
      </div>
      <label>
        Email
        <input name="contactEmail" type="email" placeholder="optional" />
      </label>
      <button type="submit" disabled={pending}>
        {pending ? 'Adding…' : 'Add vendor'}
      </button>
    </form>
  )
}
