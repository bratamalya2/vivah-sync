// M1 data access: onboarding + the authenticated agency's projects.
// Every function runs through withUser() so RLS scopes it to the caller. The web
// server actions and the integration tests both call these — one code path.

import { withUser } from '../withUser.js'

export interface OrgSummary {
  id: string
  name: string
  type: string
}

export interface OrgContext {
  onboarded: boolean
  org: OrgSummary | null
}

/** The caller's primary org (first joined). onboarded=false means "no org yet". */
export async function getMyContext(userId: string): Promise<OrgContext> {
  return withUser(userId, async (tx) => {
    const r = await tx.query<OrgSummary>(
      `select o.id, o.name, o.type::text as type
         from organizations o
         join memberships m on m.org_id = o.id
        where m.user_id = auth.uid()
        order by o.created_at asc
        limit 1`,
    )
    const org = r.rows[0] ?? null
    return { onboarded: org !== null, org }
  })
}

/** Bootstrap a new PLANNER org + membership for the caller. Returns the org id. */
export async function onboardPlanner(
  userId: string,
  input: { orgName: string; fullName?: string | null; email?: string | null },
): Promise<string> {
  return withUser(userId, async (tx) => {
    const r = await tx.query<{ org: string }>('select app.onboard_planner($1, $2, $3) as org', [
      input.orgName,
      input.fullName ?? null,
      input.email ?? null,
    ])
    return r.rows[0].org
  })
}

export interface ProjectRow {
  id: string
  name: string
  city: string
  start_date: string
  end_date: string
  expected_guest_count: number | null
  status: string
}

/** Projects visible to the caller (RLS-scoped). */
export async function listProjects(userId: string): Promise<ProjectRow[]> {
  return withUser(userId, async (tx) => {
    const r = await tx.query<ProjectRow>(
      `select id, name, city,
              to_char(start_date, 'YYYY-MM-DD') as start_date,
              to_char(end_date, 'YYYY-MM-DD') as end_date,
              expected_guest_count, status::text as status
         from projects
        order by start_date asc, created_at asc`,
    )
    return r.rows
  })
}

export interface NewProject {
  ownerOrgId: string
  name: string
  city: string
  startDate: string
  endDate: string
  guestCount?: number | null
}

/** Create a wedding project. RLS enforces owner_org_id ∈ caller's orgs. */
export async function createProject(userId: string, input: NewProject): Promise<{ id: string }> {
  return withUser(userId, async (tx) => {
    const r = await tx.query<{ id: string }>(
      `insert into projects (owner_org_id, name, city, start_date, end_date, expected_guest_count)
       values ($1, $2, $3, $4, $5, $6)
       returning id`,
      [
        input.ownerOrgId,
        input.name,
        input.city,
        input.startDate,
        input.endDate,
        input.guestCount ?? null,
      ],
    )
    return { id: r.rows[0].id }
  })
}
