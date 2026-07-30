// FR-261 data access: reschedule a ceremony (directly when unencumbered, or via
// a proposal when vendors have locked commitments), and drive the acknowledgement
// workflow. The database is the enforcer — this layer just orchestrates.

import { withUser } from '../withUser.js'

export interface RescheduleResult {
  applied: boolean
  impacted: number
  proposalId?: string
}

/**
 * Move a ceremony. If no vendor has an ACCEPTED/CONFIRMED booking on it, the
 * change is applied immediately (space bookings recomputed, overlap re-checked).
 * Otherwise a proposal is raised with an acknowledgement per impacted vendor and
 * the ceremony is left untouched until the proposal is applied.
 */
export async function rescheduleEvent(
  userId: string,
  input: { eventId: string; newStartsAt: string; newEndsAt: string },
): Promise<RescheduleResult> {
  return withUser(userId, async (tx) => {
    const locked = await tx.query<{ id: string }>(
      `select b.id
         from booking_requests b
         join vendor_requirements r on r.id = b.requirement_id
        where r.event_id = $1 and b.status in ('ACCEPTED','CONFIRMED')`,
      [input.eventId],
    )

    if (locked.rows.length === 0) {
      // no locked commitments — apply directly (triggers recompute + re-check)
      await tx.query(
        `update events set starts_at = $2::timestamptz, ends_at = $3::timestamptz where id = $1`,
        [input.eventId, input.newStartsAt, input.newEndsAt],
      )
      return { applied: true, impacted: 0 }
    }

    const pending = await tx.query(
      `select 1 from schedule_change_proposals where event_id = $1 and status = 'PROPOSED'`,
      [input.eventId],
    )
    if (pending.rowCount > 0) {
      const e: Error & { code?: string } = new Error(
        'A schedule change is already pending for this ceremony.',
      )
      e.code = '23505'
      throw e
    }

    const prop = await tx.query<{ id: string }>(
      `insert into schedule_change_proposals (event_id, proposed_starts_at, proposed_ends_at)
       values ($1, $2::timestamptz, $3::timestamptz) returning id`,
      [input.eventId, input.newStartsAt, input.newEndsAt],
    )
    const proposalId = prop.rows[0].id

    await tx.query(
      `insert into change_acknowledgements (proposal_id, booking_id)
       select $1, b.id
         from booking_requests b
         join vendor_requirements r on r.id = b.requirement_id
        where r.event_id = $2 and b.status in ('ACCEPTED','CONFIRMED')`,
      [proposalId, input.eventId],
    )

    return { applied: false, impacted: locked.rows.length, proposalId }
  })
}

export interface AckRow {
  id: string
  vendor_name: string
  booking_status: string
  acknowledged: boolean
}

export interface ProposalRow {
  id: string
  event_name: string
  current_start: string
  current_end: string
  proposed_start: string
  proposed_end: string
  status: string
  acks: AckRow[]
}

export async function listProposals(userId: string, projectId: string): Promise<ProposalRow[]> {
  return withUser(userId, async (tx) => {
    const props = await tx.query<Omit<ProposalRow, 'acks'>>(
      `select p.id, e.name as event_name,
              to_char(e.starts_at          at time zone 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI') as current_start,
              to_char(e.ends_at            at time zone 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI') as current_end,
              to_char(p.proposed_starts_at at time zone 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI') as proposed_start,
              to_char(p.proposed_ends_at   at time zone 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI') as proposed_end,
              p.status::text as status
         from schedule_change_proposals p
         join events e on e.id = p.event_id
        where e.project_id = $1
        order by p.created_at desc`,
      [projectId],
    )
    if (props.rows.length === 0) return []

    const acks = await tx.query<AckRow & { proposal_id: string }>(
      `select a.id, a.proposal_id, a.acknowledged, v.name as vendor_name,
              br.status::text as booking_status
         from change_acknowledgements a
         join schedule_change_proposals p on p.id = a.proposal_id
         join events e on e.id = p.event_id
         join booking_requests br on br.id = a.booking_id
         join vendor_profiles v on v.id = br.vendor_id
        where e.project_id = $1
        order by v.name asc`,
      [projectId],
    )
    const byProp = new Map<string, AckRow[]>()
    for (const a of acks.rows) {
      const arr = byProp.get(a.proposal_id) ?? []
      arr.push({ id: a.id, vendor_name: a.vendor_name, booking_status: a.booking_status, acknowledged: a.acknowledged })
      byProp.set(a.proposal_id, arr)
    }
    return props.rows.map((p) => ({ ...p, acks: byProp.get(p.id) ?? [] }))
  })
}

export async function acknowledgeChange(userId: string, ackId: string): Promise<void> {
  await withUser(userId, async (tx) => {
    await tx.query(
      `update change_acknowledgements
          set acknowledged = true, acknowledged_at = now(),
              acknowledgement_source = 'PLANNER_RECORDED'
        where id = $1`,
      [ackId],
    )
  })
}

export async function finalizeProposal(userId: string, proposalId: string): Promise<void> {
  await withUser(userId, async (tx) => {
    await tx.query('select app.finalize_proposal($1)', [proposalId])
  })
}

export async function cancelProposal(userId: string, proposalId: string): Promise<void> {
  await withUser(userId, async (tx) => {
    await tx.query(
      `update schedule_change_proposals set status = 'CANCELLED' where id = $1 and status = 'PROPOSED'`,
      [proposalId],
    )
  })
}
