// FR-541 data access: generate and read versioned, immutable playbooks.
// Generation delegates to the SECURITY DEFINER synthesis function so the whole
// snapshot is compiled and stamped in one consistent transaction.

import { withUser } from '../withUser.js'

export interface PlaybookVendor {
  category: string
  scope: string
  arrival: string
  completion: string
  fulfillment: string
  vendor: { name: string; phone: string | null; status: string } | null
}

export interface PlaybookOverride {
  rule_key: string
  value: string
  rationale: string
}

export interface PlaybookEvent {
  name: string
  starts_at: string
  ends_at: string
  setup_minutes: number
  teardown_minutes: number
  expected_guest_count: number | null
  spaces: { venue: string; space: string }[]
  overrides: PlaybookOverride[]
  vendors: PlaybookVendor[]
}

export interface PlaybookDay {
  date: string
  day_index: number
  events: PlaybookEvent[]
}

export interface PlaybookSnapshot {
  project: {
    name: string
    city: string
    start_date: string
    end_date: string
    expected_guest_count: number | null
    status: string
  }
  generated_at: string
  is_draft: boolean
  pending_changes: number
  days: PlaybookDay[]
}

export interface PlaybookMeta {
  id: string
  version: number
  is_draft: boolean
  generated_at: string
}

export interface PlaybookFull {
  version: number
  is_draft: boolean
  generated_at: string
  snapshot: PlaybookSnapshot
}

export async function generatePlaybook(
  userId: string,
  projectId: string,
): Promise<{ id: string; version: number; is_draft: boolean }> {
  return withUser(userId, async (tx) => {
    const r = await tx.query<{ result: { id: string; version: number; is_draft: boolean } }>(
      'select app.generate_playbook($1) as result',
      [projectId],
    )
    return r.rows[0].result
  })
}

export async function listPlaybooks(userId: string, projectId: string): Promise<PlaybookMeta[]> {
  return withUser(userId, async (tx) => {
    const r = await tx.query<PlaybookMeta>(
      `select id, version, is_draft,
              to_char(generated_at at time zone 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI') as generated_at
         from playbooks where project_id = $1 order by version desc`,
      [projectId],
    )
    return r.rows
  })
}

export async function getPlaybook(userId: string, playbookId: string): Promise<PlaybookFull | null> {
  return withUser(userId, async (tx) => {
    const r = await tx.query<PlaybookFull>(
      `select version, is_draft,
              to_char(generated_at at time zone 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI') as generated_at,
              snapshot
         from playbooks where id = $1`,
      [playbookId],
    )
    return r.rows[0] ?? null
  })
}
