'use client'

import { useRef, useState } from 'react'
import { createContractAction } from './actions'
import SubmitButton from '@/app/_components/SubmitButton'

interface Milestone {
  label: string
  amount: number
  dueDate: string | null
}
type Status = { kind: 'idle' | 'loading' | 'error' | 'ok'; msg?: string }

export default function NewContractForm({
  projectId,
  vendors,
}: {
  projectId: string
  vendors: { id: string; name: string }[]
}) {
  const [title, setTitle] = useState('')
  const [total, setTotal] = useState('')
  const [notes, setNotes] = useState('')
  const [milestones, setMilestones] = useState<Milestone[]>([])
  const [source, setSource] = useState('MANUAL')
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const fileRef = useRef<HTMLInputElement>(null)

  async function extract() {
    const f = fileRef.current?.files?.[0]
    if (!f) {
      setStatus({ kind: 'error', msg: 'Choose a PDF first.' })
      return
    }
    setStatus({ kind: 'loading' })
    try {
      const fd = new FormData()
      fd.append('file', f)
      const res = await fetch('/api/extract-contract', { method: 'POST', body: fd })
      const data = await res.json()
      if (data.error) {
        setStatus({ kind: 'error', msg: data.error })
        return
      }
      if (data.title) setTitle(data.title)
      if (data.total != null) setTotal(String(data.total))
      const ms: Milestone[] = Array.isArray(data.milestones) ? data.milestones : []
      setMilestones(ms)
      setSource('PDF_EXTRACTED')
      setStatus({
        kind: 'ok',
        msg: `Extracted the contract${ms.length ? ` and ${ms.length} payment milestone${ms.length > 1 ? 's' : ''}` : ''}. Review, then confirm.`,
      })
    } catch {
      setStatus({ kind: 'error', msg: 'Extraction failed. Fill the form manually.' })
    }
  }

  return (
    <form action={createContractAction} className="newform">
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="source" value={source} />
      <input type="hidden" name="milestones" value={JSON.stringify(milestones)} />

      <div className="pdfextract">
        <span className="hint">Have a contract PDF? Auto-fill this form:</span>
        <div className="actionrow" style={{ marginTop: '0.4rem' }}>
          <input ref={fileRef} type="file" accept="application/pdf" className="evfile" />
          <button
            type="button"
            className="mini ghostmini"
            onClick={extract}
            disabled={status.kind === 'loading'}
          >
            {status.kind === 'loading' ? 'Extracting…' : 'Extract from PDF'}
          </button>
        </div>
        {status.kind === 'error' && <p className="err" style={{ marginTop: '0.4rem' }}>{status.msg}</p>}
        {status.kind === 'ok' && <p className="ok" style={{ marginTop: '0.4rem' }}>{status.msg}</p>}
      </div>

      <label>
        Vendor
        <select name="vendorId" required defaultValue="">
          <option value="" disabled>
            Select a vendor…
          </option>
          {vendors.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Title
        <input
          name="title"
          required
          placeholder="Photography & videography"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </label>
      <label>
        Total value (₹)
        <input
          name="totalAmount"
          type="number"
          min={1}
          step="1"
          required
          placeholder="250000"
          value={total}
          onChange={(e) => setTotal(e.target.value)}
        />
      </label>
      {milestones.length > 0 && (
        <span className="hint">
          Payment plan: {milestones.map((m) => m.label).join(', ')} — edit it after creating.
        </span>
      )}
      <label>
        Notes
        <input name="notes" placeholder="optional" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </label>
      <SubmitButton pendingLabel="Creating…">Create contract</SubmitButton>
    </form>
  )
}
