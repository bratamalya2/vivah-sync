'use client'

import { useActionState, useEffect, useRef } from 'react'
import { scheduleCeremony, type FormState } from './actions'

interface SpaceOption {
  id: string
  label: string
}

export default function ScheduleForm({
  projectId,
  minDate,
  maxDate,
  spaces,
}: {
  projectId: string
  minDate: string
  maxDate: string
  spaces: SpaceOption[]
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(scheduleCeremony, null)
  const ref = useRef<HTMLFormElement>(null)
  useEffect(() => {
    if (state?.ok) ref.current?.reset()
  }, [state])

  return (
    <form action={action} ref={ref} className="newform">
      <input type="hidden" name="projectId" value={projectId} />
      {state?.error &&
        (state.intervention ? (
          <p className="prevented">
            {state.headline ? <strong>{state.headline} — </strong> : null}
            {state.error}
          </p>
        ) : (
          <p className="err">{state.error}</p>
        ))}
      {state?.ok && <p className="ok">Ceremony scheduled.</p>}

      <label>
        Ceremony name
        <input name="name" required placeholder="Sangeet" />
      </label>
      <label>
        Date
        <input name="date" type="date" required min={minDate} max={maxDate} defaultValue={minDate} />
      </label>
      <div className="row2">
        <label>
          Start
          <input name="startTime" type="time" required defaultValue="18:00" />
        </label>
        <label>
          End
          <input name="endTime" type="time" required defaultValue="22:00" />
        </label>
      </div>
      <div className="row2">
        <label>
          Setup (min)
          <input name="setupMinutes" type="number" min={0} defaultValue={60} />
        </label>
        <label>
          Teardown (min)
          <input name="teardownMinutes" type="number" min={0} defaultValue={30} />
        </label>
      </div>
      <label>
        Space
        <select name="spaceId" defaultValue="">
          <option value="">— no space yet —</option>
          {spaces.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        Expected guests
        <input name="guestCount" type="number" min={0} placeholder="400" />
      </label>
      <button type="submit" disabled={pending}>
        {pending ? 'Scheduling…' : 'Schedule ceremony'}
      </button>
    </form>
  )
}
