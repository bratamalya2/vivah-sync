// Web-facing reads of the playbook render queue. RLS-scoped, no PDF engine —
// safe to import from the Next.js app (only the worker imports the renderer).

import { withUser } from '../withUser.js'

export interface RenderStatus {
  status: string // PENDING | RENDERING | READY | FAILED
  rendered_at: string | null
}

export async function getRenderStatus(
  userId: string,
  playbookId: string,
): Promise<RenderStatus | null> {
  return withUser(userId, async (tx) => {
    const r = await tx.query<RenderStatus>(
      `select status,
              to_char(rendered_at at time zone 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI') as rendered_at
         from playbook_renders where playbook_id = $1`,
      [playbookId],
    )
    return r.rows[0] ?? null
  })
}

/** Render status for every playbook version of a project (for list views). */
export async function listRenderStatuses(
  userId: string,
  projectId: string,
): Promise<{ playbook_id: string; status: string }[]> {
  return withUser(userId, async (tx) => {
    const r = await tx.query<{ playbook_id: string; status: string }>(
      `select r.playbook_id, r.status
         from playbook_renders r
         join playbooks p on p.id = r.playbook_id
        where p.project_id = $1`,
      [projectId],
    )
    return r.rows
  })
}

/** The rendered PDF bytes for a playbook the caller can access, or null if not ready. */
export async function getRenderedPdf(userId: string, playbookId: string): Promise<Buffer | null> {
  return withUser(userId, async (tx) => {
    const r = await tx.query<{ pdf: Buffer | null; status: string }>(
      `select pdf, status from playbook_renders where playbook_id = $1`,
      [playbookId],
    )
    const row = r.rows[0]
    if (!row || row.status !== 'READY' || !row.pdf) return null
    return row.pdf
  })
}
