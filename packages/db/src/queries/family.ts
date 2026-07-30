// BR-561 family portal data access. Planner-side invite/list, family-side claim,
// and the redacted run-sheet. All enforcement lives in the SECURITY DEFINER
// functions + RLS; this layer only orchestrates.

import { withUser } from '../withUser.js'

export interface InvitationRow {
  email: string
  invitee_name: string | null
  claimed_at: string | null
}

/** Planner (FULL) invites a family member by email. */
export async function inviteFamily(
  userId: string,
  input: { projectId: string; email: string; name?: string | null },
): Promise<void> {
  await withUser(userId, async (tx) => {
    await tx.query('select app.invite_family($1, $2, $3)', [
      input.projectId,
      input.email,
      input.name ?? null,
    ])
  })
}

export async function listProjectInvitations(
  userId: string,
  projectId: string,
): Promise<InvitationRow[]> {
  return withUser(userId, async (tx) => {
    const r = await tx.query<InvitationRow>(
      `select email, invitee_name,
              to_char(claimed_at at time zone 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI') as claimed_at
         from family_invitations where project_id = $1 order by created_at asc`,
      [projectId],
    )
    return r.rows
  })
}

/** Family member claims any invitations matching their email. Returns count. */
export async function claimFamilyInvitations(userId: string): Promise<number> {
  return withUser(userId, async (tx) => {
    const r = await tx.query<{ n: number }>('select app.claim_family_invitations() as n')
    return r.rows[0].n
  })
}

export interface FamilyRunsheet {
  project: { name: string; city: string; start_date: string; end_date: string }
  days: {
    date: string
    day_index: number
    events: {
      name: string
      starts_at: string
      ends_at: string
      spaces: { venue: string; space: string }[]
      vendors: { category: string; name: string; arrival: string; completion: string }[]
    }[]
  }[]
}

/** The redacted schedule for a family member (throws if not authorized). */
export async function familyRunsheet(userId: string, projectId: string): Promise<FamilyRunsheet> {
  return withUser(userId, async (tx) => {
    const r = await tx.query<{ result: FamilyRunsheet }>('select app.family_runsheet($1) as result', [
      projectId,
    ])
    return r.rows[0].result
  })
}
