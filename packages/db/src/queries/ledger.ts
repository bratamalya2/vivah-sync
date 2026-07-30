// FR-2961 (relaxed) payment ledger. Entries are editable/deletable for 15
// minutes, then locked — corrections after that are reversing entries. The
// window + reversal rules are enforced by triggers; this layer orchestrates.

import { withUser } from '../withUser.js'

export type LedgerDirection = 'INFLOW' | 'OUTFLOW'
export type PaymentMode = 'CASH' | 'BANK' | 'UPI' | 'CARD'
export type PayerEntity = 'CLIENT' | 'PLANNER' | 'VENDOR' | 'VENUE'

export interface LedgerInput {
  projectId: string
  direction: LedgerDirection
  amount: number
  mode: PaymentMode
  payer: PayerEntity
  vendorId?: string | null
  note?: string | null
  paidAt: string // ISO
}

export async function recordLedgerEntry(userId: string, input: LedgerInput): Promise<{ id: string }> {
  return withUser(userId, async (tx) => {
    const r = await tx.query<{ id: string }>(
      `insert into ledger_entries (project_id, direction, amount, mode, payer, vendor_id, note, paid_at)
       values ($1, $2::ledger_direction, $3, $4::payment_mode, $5::payer_entity, $6, $7, $8::timestamptz)
       returning id`,
      [
        input.projectId, input.direction, input.amount, input.mode, input.payer,
        input.vendorId ?? null, input.note ?? null, input.paidAt,
      ],
    )
    return { id: r.rows[0].id }
  })
}

/** Edit an entry. Trigger rejects (23514) if it is already locked (>15 min). */
export async function editLedgerEntry(
  userId: string,
  input: {
    id: string
    direction: LedgerDirection
    amount: number
    mode: PaymentMode
    payer: PayerEntity
    vendorId?: string | null
    note?: string | null
    paidAt: string
  },
): Promise<void> {
  await withUser(userId, async (tx) => {
    await tx.query(
      `update ledger_entries
          set direction = $2::ledger_direction, amount = $3, mode = $4::payment_mode,
              payer = $5::payer_entity, vendor_id = $6, note = $7, paid_at = $8::timestamptz
        where id = $1`,
      [input.id, input.direction, input.amount, input.mode, input.payer, input.vendorId ?? null, input.note ?? null, input.paidAt],
    )
  })
}

/** Delete an entry. Trigger rejects (23514) if it is already locked (>15 min). */
export async function deleteLedgerEntry(userId: string, id: string): Promise<void> {
  await withUser(userId, (tx) => tx.query('delete from ledger_entries where id = $1', [id]))
}

/** Post a reversing entry that negates a (locked) entry. Returns the reversal id. */
export async function reverseLedgerEntry(userId: string, id: string): Promise<{ id: string }> {
  return withUser(userId, async (tx) => {
    const r = await tx.query<{ id: string }>(
      `insert into ledger_entries (project_id, direction, amount, currency, mode, payer, vendor_id, note, paid_at, reverses_id)
       select e.project_id,
              (case e.direction when 'INFLOW' then 'OUTFLOW' else 'INFLOW' end)::ledger_direction,
              e.amount, e.currency, e.mode, e.payer, e.vendor_id,
              'Reversal of ' || left(e.id::text, 8), now(), e.id
         from ledger_entries e
        where e.id = $1
       returning id`,
      [id],
    )
    if (!r.rows[0]) throw new Error('entry not found')
    return { id: r.rows[0].id }
  })
}

export interface LedgerRow {
  id: string
  direction: LedgerDirection
  amount: number
  mode: string
  payer: string
  vendor_name: string | null
  note: string | null
  paid_at: string
  created_at: string
  editable_until_ms: number
  is_locked: boolean
  reverses_id: string | null
  reversed: boolean
}

export async function listProjectLedger(userId: string, projectId: string): Promise<LedgerRow[]> {
  return withUser(userId, async (tx) => {
    const r = await tx.query<LedgerRow & { amount: string }>(
      `select e.id, e.direction::text as direction, e.amount::float8 as amount,
              e.mode::text as mode, e.payer::text as payer, v.name as vendor_name, e.note,
              to_char(e.paid_at    at time zone 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI') as paid_at,
              to_char(e.created_at at time zone 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI') as created_at,
              (extract(epoch from (e.created_at + interval '15 minutes')) * 1000)::bigint as editable_until_ms,
              (now() > e.created_at + interval '15 minutes') as is_locked,
              e.reverses_id,
              exists (select 1 from ledger_entries r where r.reverses_id = e.id) as reversed
         from ledger_entries e
         left join vendor_profiles v on v.id = e.vendor_id
        where e.project_id = $1
        order by e.created_at desc`,
      [projectId],
    )
    return r.rows as unknown as LedgerRow[]
  })
}
