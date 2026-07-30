'use client'

import { useEffect, useState } from 'react'
import type { LedgerRow as Row } from '@vivahsync/db'
import { editLedgerAction, deleteLedgerAction, reverseLedgerAction } from './actions'

const MODES = ['CASH', 'BANK', 'UPI', 'CARD']
const PAYERS = ['CLIENT', 'PLANNER', 'VENDOR', 'VENUE']
const inr = (n: number) => `₹${new Intl.NumberFormat('en-IN').format(n)}`

function countdown(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export default function LedgerRow({
  entry,
  projectId,
  vendors,
}: {
  entry: Row
  projectId: string
  vendors: { id: string; name: string }[]
}) {
  // remaining is null until mounted (avoids SSR/client clock hydration mismatch)
  const [remaining, setRemaining] = useState<number | null>(null)
  const [editing, setEditing] = useState(false)

  useEffect(() => {
    const tick = () => setRemaining(Math.max(0, entry.editable_until_ms - Date.now()))
    tick()
    const t = setInterval(tick, 1000)
    return () => clearInterval(t)
  }, [entry.editable_until_ms])

  const isReversal = entry.reverses_id !== null
  // pre-mount: trust the server's is_locked; after mount: live clock
  const editable = !isReversal && (remaining === null ? !entry.is_locked : remaining > 0)
  const locked = !editable
  const canReverse = locked && !isReversal && !entry.reversed

  return (
    <li className={`ledgerrow${entry.reversed ? ' isreversed' : ''}`}>
      <div className="ltop">
        <span className={`lamount ${entry.direction === 'INFLOW' ? 'inflow' : 'outflow'}`}>
          {entry.direction === 'INFLOW' ? '+ ' : '− '}
          {inr(entry.amount)}
        </span>
        {isReversal ? (
          <span className="badge lrev">Reversal</span>
        ) : entry.reversed ? (
          <span className="badge lreversed">Reversed</span>
        ) : editable ? (
          <span className="badge lediting">
            editable {remaining === null ? '' : countdown(remaining)}
          </span>
        ) : (
          <span className="badge llocked">Locked</span>
        )}
      </div>

      <div className="lmeta">
        {entry.mode} · {entry.payer}
        {entry.vendor_name ? ` · ${entry.vendor_name}` : ''}
        {entry.note ? ` · ${entry.note}` : ''}
      </div>
      <div className="lsub">
        paid {entry.paid_at} · added {entry.created_at}
      </div>

      <div className="lactions">
        {editable && (
          <>
            <button type="button" className="mini ghostmini" onClick={() => setEditing((v) => !v)}>
              {editing ? 'Cancel' : 'Edit'}
            </button>
            <form action={deleteLedgerAction} className="inlineform">
              <input type="hidden" name="projectId" value={projectId} />
              <input type="hidden" name="id" value={entry.id} />
              <button type="submit" className="mini ghostmini">
                Delete
              </button>
            </form>
          </>
        )}
        {canReverse && (
          <form action={reverseLedgerAction} className="inlineform">
            <input type="hidden" name="projectId" value={projectId} />
            <input type="hidden" name="id" value={entry.id} />
            <button type="submit" className="mini">
              Post reversing entry
            </button>
          </form>
        )}
      </div>

      {editing && editable && (
        <form action={editLedgerAction} className="ledgerform">
          <input type="hidden" name="projectId" value={projectId} />
          <input type="hidden" name="id" value={entry.id} />
          <div className="row2">
            <label>
              Direction
              <select name="direction" defaultValue={entry.direction}>
                <option value="INFLOW">Money in</option>
                <option value="OUTFLOW">Money out</option>
              </select>
            </label>
            <label>
              Amount ₹
              <input name="amount" type="number" min="1" step="0.01" defaultValue={entry.amount} required />
            </label>
          </div>
          <div className="row2">
            <label>
              Mode
              <select name="mode" defaultValue={entry.mode}>
                {MODES.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Payer
              <select name="payer" defaultValue={entry.payer}>
                {PAYERS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label>
            Vendor (optional)
            <select name="vendorId" defaultValue="">
              <option value="">—</option>
              {vendors.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Paid at
            <input name="paidAt" type="datetime-local" defaultValue={entry.paid_at.replace(' ', 'T')} />
          </label>
          <label>
            Note
            <input name="note" defaultValue={entry.note ?? ''} />
          </label>
          <button type="submit" className="mini">
            Save changes
          </button>
        </form>
      )}
    </li>
  )
}
