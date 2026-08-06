'use client'

import { useRef, useState } from 'react'
import { saveMilestonesAction } from '../actions'
import SubmitButton from '@/app/_components/SubmitButton'

interface Row {
  key: string
  id: string | null
  label: string
  amount: string
  dueDate: string
}
const inr = (n: number) => `₹${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(n)}`
const uid = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `k${Date.now()}${performance.now()}`
const num = (s: string) => {
  const n = parseFloat(s)
  return Number.isFinite(n) ? n : 0
}

// The "spreadsheet view": a continuous, keyboard-driven grid of payment
// milestones with cell-level validation mirroring the DB's 100% rule.
export default function MilestoneGrid({
  projectId,
  contractId,
  total,
  initial,
}: {
  projectId: string
  contractId: string
  total: number
  initial: { id: string; label: string; amount: number; due_date: string | null }[]
}) {
  const gridRef = useRef<HTMLDivElement>(null)
  const [rows, setRows] = useState<Row[]>(() =>
    initial.length
      ? initial.map((m) => ({ key: m.id, id: m.id, label: m.label, amount: String(m.amount), dueDate: m.due_date ?? '' }))
      : [{ key: uid(), id: null, label: '', amount: '', dueDate: '' }],
  )

  const set = (key: string, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)))
  const addRow = () => {
    const key = uid()
    setRows((rs) => [...rs, { key, id: null, label: '', amount: '', dueDate: '' }])
    // focus the new row's first cell after paint
    requestAnimationFrame(() => {
      gridRef.current?.querySelector<HTMLInputElement>(`[data-row="${rows.length}"][data-col="0"]`)?.focus()
    })
  }
  const removeRow = (key: string) => setRows((rs) => (rs.length > 1 ? rs.filter((r) => r.key !== key) : rs))

  // Enter adds a row; ArrowUp/ArrowDown move to the same column in the adjacent row.
  const onKeyDown = (e: React.KeyboardEvent, rowIdx: number, col: number) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (rowIdx === rows.length - 1) addRow()
      else gridRef.current?.querySelector<HTMLInputElement>(`[data-row="${rowIdx + 1}"][data-col="${col}"]`)?.focus()
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      const target = rowIdx + (e.key === 'ArrowDown' ? 1 : -1)
      const el = gridRef.current?.querySelector<HTMLInputElement>(`[data-row="${target}"][data-col="${col}"]`)
      if (el) {
        e.preventDefault()
        el.focus()
      }
    }
  }

  const sum = rows.reduce((s, r) => s + num(r.amount), 0)
  const remaining = total - sum
  const pct = total > 0 ? (sum / total) * 100 : 0
  const over = sum > total + 0.005
  const balanced = Math.abs(sum - total) < 0.005
  const rowInvalid = (r: Row) => (r.label.trim() !== '' || r.amount !== '') && (!r.label.trim() || !(num(r.amount) > 0))
  const anyInvalid = rows.some(rowInvalid)

  const serialized = rows
    .filter((r) => r.label.trim() || num(r.amount) > 0)
    .map((r, i) => ({ id: r.id, label: r.label.trim(), amount: num(r.amount), dueDate: r.dueDate || null, sortOrder: i }))

  return (
    <form action={saveMilestonesAction} className="mgrid-form">
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="contractId" value={contractId} />
      <input type="hidden" name="milestones" value={JSON.stringify(serialized)} />

      <div className="mgrid" ref={gridRef}>
        <div className="mgrid-head">
          <span>Milestone</span>
          <span>Amount (₹)</span>
          <span>Due date</span>
          <span />
        </div>
        {rows.map((r, i) => {
          const cellOver = over && num(r.amount) > 0
          const missing = rowInvalid(r)
          return (
            <div className="mgrid-row" key={r.key}>
              <input
                className={`mcell${missing && !r.label.trim() ? ' bad' : ''}`}
                data-row={i}
                data-col={0}
                value={r.label}
                placeholder="Booking advance"
                onChange={(e) => set(r.key, { label: e.target.value })}
                onKeyDown={(e) => onKeyDown(e, i, 0)}
              />
              <input
                className={`mcell mnum${cellOver ? ' over' : ''}${missing && !(num(r.amount) > 0) ? ' bad' : ''}`}
                data-row={i}
                data-col={1}
                inputMode="decimal"
                value={r.amount}
                placeholder="0"
                onChange={(e) => set(r.key, { amount: e.target.value.replace(/[^\d.]/g, '') })}
                onKeyDown={(e) => onKeyDown(e, i, 1)}
              />
              <input
                className="mcell"
                data-row={i}
                data-col={2}
                type="date"
                value={r.dueDate}
                onChange={(e) => set(r.key, { dueDate: e.target.value })}
                onKeyDown={(e) => onKeyDown(e, i, 2)}
              />
              <button type="button" className="mdel" aria-label="Remove milestone" onClick={() => removeRow(r.key)}>
                ×
              </button>
            </div>
          )
        })}
      </div>

      <button type="button" className="mini ghostmini" onClick={addRow} style={{ marginTop: '0.5rem' }}>
        + Add milestone
      </button>

      <div className="mbalance">
        <div className="mbar">
          <div
            className={`mbar-fill${over ? ' over' : balanced ? ' full' : ''}`}
            style={{ width: `${Math.min(100, pct)}%` }}
          />
        </div>
        <div className={`msum${over ? ' over' : balanced ? ' ok' : ''}`}>
          {inr(sum)} of {inr(total)} · {Math.round(pct)}%
          {over
            ? ` — over by ${inr(sum - total)}`
            : balanced
              ? ' — balanced ✓'
              : ` — ${inr(remaining)} unallocated`}
        </div>
      </div>

      <div style={{ marginTop: '0.7rem', display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
        <SubmitButton className="mini" disabled={over || anyInvalid} pendingLabel="Saving…">
          Save payment plan
        </SubmitButton>
        {over && <span className="hint">Trim the plan to 100% or less to save.</span>}
        {!over && anyInvalid && <span className="hint">Each milestone needs a label and a positive amount.</span>}
      </div>
    </form>
  )
}
