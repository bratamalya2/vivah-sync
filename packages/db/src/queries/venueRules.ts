// FR-061 data access: per-ceremony venue rule overrides + the project audit log.
// The rationale requirement and the audit write are enforced by triggers; this
// layer just orchestrates and reads.

import { withUser } from '../withUser.js'

export type VenueRuleKey = 'ACCESS_OPEN' | 'ACCESS_CLOSE' | 'NOISE_CURFEW' | 'OTHER'

export interface OverrideRow {
  id: string
  event_id: string
  event_name: string
  rule_key: string
  override_value: string
  rationale: string
  created_at: string
}

export async function addVenueOverride(
  userId: string,
  input: { eventId: string; ruleKey: VenueRuleKey; overrideValue: string; rationale: string },
): Promise<{ id: string }> {
  return withUser(userId, async (tx) => {
    const r = await tx.query<{ id: string }>(
      `insert into venue_rule_overrides (event_id, rule_key, override_value, rationale)
       values ($1, $2::venue_rule_key, $3, $4) returning id`,
      [input.eventId, input.ruleKey, input.overrideValue, input.rationale],
    )
    return { id: r.rows[0].id }
  })
}

export async function listProjectOverrides(
  userId: string,
  projectId: string,
): Promise<OverrideRow[]> {
  return withUser(userId, async (tx) => {
    const r = await tx.query<OverrideRow>(
      `select o.id, o.event_id, e.name as event_name, o.rule_key::text as rule_key,
              o.override_value, o.rationale,
              to_char(o.created_at at time zone 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI') as created_at
         from venue_rule_overrides o
         join events e on e.id = o.event_id
        where e.project_id = $1
        order by e.starts_at asc, o.created_at asc`,
      [projectId],
    )
    return r.rows
  })
}

export interface AuditRow {
  id: string
  action: string
  entity_type: string
  detail: Record<string, unknown> | null
  actor_name: string | null
  created_at: string
}

export async function listAuditLog(userId: string, projectId: string): Promise<AuditRow[]> {
  return withUser(userId, async (tx) => {
    const r = await tx.query<AuditRow>(
      `select a.id, a.action, a.entity_type, a.detail,
              coalesce(u.full_name, u.email) as actor_name,
              to_char(a.created_at at time zone 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI') as created_at
         from audit_logs a
         left join app_users u on u.id = a.actor_user_id
        where a.project_id = $1
        order by a.created_at desc`,
      [projectId],
    )
    return r.rows
  })
}
