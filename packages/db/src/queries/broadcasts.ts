// Broadcast messaging — compose to an audience segment, snapshot recipients,
// record the message. Actual dispatch is STUBBED: rows are written as SENT but
// no WhatsApp/SMS/email leaves the system. A provider worker can later pick up
// QUEUED rows and flip their state without any schema change.

import { withUser } from '../withUser.js'

export type BroadcastChannel = 'WHATSAPP' | 'SMS' | 'EMAIL'
export type Audience = 'ALL' | 'PENDING_RSVP' | 'ATTENDING' | 'ARRIVING'

export interface BroadcastRow {
  id: string
  channel: string
  audience: string
  subject: string | null
  body: string
  state: string
  recipients: number
  sent: string
  names: string[]
}

const AUDIENCE_SQL: Record<Audience, string> = {
  ALL: `select id, name, coalesce(contact_phone, contact_email) as addr from guest_parties where project_id = $1`,
  PENDING_RSVP: `select id, name, coalesce(contact_phone, contact_email) as addr from guest_parties
                   where project_id = $1 and rsvp_submitted_at is null`,
  ATTENDING: `select distinct gp.id, gp.name, coalesce(gp.contact_phone, gp.contact_email) as addr
                from guest_parties gp
                join guests g on g.party_id = gp.id
                join guest_rsvps r on r.guest_id = g.id
               where gp.project_id = $1 and r.status = 'YES'`,
  ARRIVING: `select distinct gp.id, gp.name, coalesce(gp.contact_phone, gp.contact_email) as addr
               from guest_parties gp
               join guest_travel t on t.party_id = gp.id
              where gp.project_id = $1 and t.direction = 'ARRIVAL' and t.status <> 'CANCELLED'`,
}

/** Resolve the audience, record the broadcast + recipient snapshot. Stub send. */
export async function sendBroadcast(
  userId: string,
  input: { projectId: string; channel: BroadcastChannel; audience: Audience; subject: string | null; body: string },
): Promise<{ recipients: number }> {
  return withUser(userId, async (tx) => {
    const aud = await tx.query<{ id: string; name: string; addr: string | null }>(
      AUDIENCE_SQL[input.audience],
      [input.projectId],
    )
    const b = await tx.query<{ id: string }>(
      `insert into broadcasts (project_id, channel, audience, subject, body, state, recipients)
       values ($1, $2::broadcast_channel, $3, $4, $5, 'SENT', $6) returning id`,
      [input.projectId, input.channel, input.audience, input.subject, input.body, aud.rows.length],
    )
    const broadcastId = b.rows[0].id
    for (const r of aud.rows) {
      await tx.query(
        `insert into broadcast_recipients (broadcast_id, party_id, party_name, channel_addr)
         values ($1, $2, $3, $4)`,
        [broadcastId, r.id, r.name, r.addr],
      )
    }
    return { recipients: aud.rows.length }
  })
}

export async function listBroadcasts(userId: string, projectId: string): Promise<BroadcastRow[]> {
  return withUser(userId, async (tx) => {
    const r = await tx.query<BroadcastRow & { names: string[] }>(
      `select b.id, b.channel::text as channel, b.audience, b.subject, b.body, b.state::text as state, b.recipients,
              to_char(b.created_at at time zone 'Asia/Kolkata', 'DD Mon · HH24:MI') as sent,
              coalesce(
                (select array_agg(br.party_name order by br.party_name)
                   from broadcast_recipients br where br.broadcast_id = b.id),
                array[]::text[]
              ) as names
         from broadcasts b
        where b.project_id = $1
        order by b.created_at desc`,
      [projectId],
    )
    return r.rows
  })
}

/** Audience counts for the composer preview. */
export async function audienceCounts(
  userId: string,
  projectId: string,
): Promise<Record<Audience, number>> {
  return withUser(userId, async (tx) => {
    const counts = {} as Record<Audience, number>
    for (const key of Object.keys(AUDIENCE_SQL) as Audience[]) {
      const r = await tx.query<{ id: string }>(AUDIENCE_SQL[key], [projectId])
      counts[key] = r.rowCount ?? r.rows.length
    }
    return counts
  })
}
