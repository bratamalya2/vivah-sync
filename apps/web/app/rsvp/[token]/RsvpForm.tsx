'use client'

import { useState } from 'react'
import { rsvpSubmitAction } from './actions'
import SubmitButton from '@/app/_components/SubmitButton'

type Status = 'PENDING' | 'YES' | 'NO' | 'MAYBE'
interface Ev {
  id: string
  name: string
  when: string
}
interface Row {
  key: string
  id: string | null
  name: string
  isChild: boolean
  isPlusOne: boolean
  dietary: string
  assistance: string
  statuses: Record<string, Status>
}
const uid = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `k${Date.now()}${Math.round(performance.now())}`

export default function RsvpForm({
  token,
  events,
  guests,
  rsvps,
  plusOnesAllowed,
}: {
  token: string
  events: Ev[]
  guests: { id: string; name: string; is_child: boolean; is_plus_one: boolean; dietary: string | null; assistance: string | null }[]
  rsvps: { guest_id: string; event_id: string; status: Status }[]
  plusOnesAllowed: number
}) {
  const statusFor = (gid: string) => {
    const m: Record<string, Status> = {}
    for (const e of events) m[e.id] = 'PENDING'
    for (const r of rsvps) if (r.guest_id === gid) m[r.event_id] = r.status
    return m
  }
  const [rows, setRows] = useState<Row[]>(() =>
    guests.map((g) => ({
      key: g.id,
      id: g.id,
      name: g.name,
      isChild: g.is_child,
      isPlusOne: g.is_plus_one,
      dietary: g.dietary ?? '',
      assistance: g.assistance ?? '',
      statuses: statusFor(g.id),
    })),
  )

  const patch = (key: string, p: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...p } : r)))
  const setStatus = (key: string, evId: string, st: Status) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, statuses: { ...r.statuses, [evId]: st } } : r)))
  const newCount = rows.filter((r) => !r.id).length
  const addGuest = () => {
    if (newCount >= plusOnesAllowed) return
    const st: Record<string, Status> = {}
    for (const e of events) st[e.id] = 'PENDING'
    setRows((rs) => [...rs, { key: uid(), id: null, name: '', isChild: false, isPlusOne: true, dietary: '', assistance: '', statuses: st }])
  }
  const removeGuest = (key: string) => setRows((rs) => rs.filter((r) => r.key !== key))

  const payload = rows
    .filter((r) => r.name.trim())
    .map((r) => ({
      id: r.id,
      name: r.name.trim(),
      isChild: r.isChild,
      isPlusOne: r.isPlusOne,
      dietary: r.dietary.trim() || null,
      assistance: r.assistance.trim() || null,
      rsvps: events.map((e) => ({ eventId: e.id, status: r.statuses[e.id] || 'PENDING' })),
    }))

  return (
    <form action={rsvpSubmitAction} className="rsvp-form">
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="payload" value={JSON.stringify(payload)} />

      {rows.map((r) => (
        <div className="rsvp-guest" key={r.key}>
          <div className="rsvp-guest-top">
            <input
              className="rsvp-name"
              value={r.name}
              placeholder="Guest name"
              onChange={(e) => patch(r.key, { name: e.target.value })}
            />
            <label className="rsvp-child">
              <input type="checkbox" checked={r.isChild} onChange={(e) => patch(r.key, { isChild: e.target.checked })} /> child
            </label>
            {!r.id && (
              <button type="button" className="rsvp-remove" onClick={() => removeGuest(r.key)} aria-label="Remove">
                ×
              </button>
            )}
          </div>

          <div className="rsvp-events">
            {events.map((ev) => (
              <div className="rsvp-ev" key={ev.id}>
                <div className="rsvp-ev-name">
                  {ev.name} <span className="rsvp-ev-when">{ev.when}</span>
                </div>
                <div className="rsvp-seg">
                  {(['YES', 'MAYBE', 'NO'] as const).map((opt) => (
                    <button
                      type="button"
                      key={opt}
                      className={`rsvp-opt${r.statuses[ev.id] === opt ? ` on ${opt.toLowerCase()}` : ''}`}
                      onClick={() => setStatus(r.key, ev.id, opt)}
                    >
                      {opt === 'YES' ? 'Yes' : opt === 'MAYBE' ? 'Maybe' : 'No'}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="rsvp-meta">
            <input
              className="rsvp-metainput"
              value={r.dietary}
              placeholder="Dietary / allergies (optional)"
              onChange={(e) => patch(r.key, { dietary: e.target.value })}
            />
            <input
              className="rsvp-metainput"
              value={r.assistance}
              placeholder="Special assistance (optional)"
              onChange={(e) => patch(r.key, { assistance: e.target.value })}
            />
          </div>
        </div>
      ))}

      {plusOnesAllowed > 0 && (
        <button type="button" className="rsvp-add" onClick={addGuest} disabled={newCount >= plusOnesAllowed}>
          + Add a guest ({newCount}/{plusOnesAllowed})
        </button>
      )}

      <SubmitButton className="rsvp-submit" pendingLabel="Submitting…">
        Submit RSVP
      </SubmitButton>
    </form>
  )
}
