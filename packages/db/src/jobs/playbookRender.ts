// Playbook PDF rendering: turn a playbook's render row into stored PDF bytes.
//
// Two entry points share one renderer:
//   - renderPlaybookNow(id) — on demand, from the web app's PDF route the first
//     time someone downloads a version (the Vercel deployment has no worker).
//   - renderPendingPlaybooks() — the batch sweep, for the optional worker.
// Both pull in the pdfkit engine from '@vivahsync/core/pdf'; on the web side
// only the PDF route handler imports this module, and next.config keeps pdfkit
// as an external server package. Runs on the owner connection (withSystem)
// since the render queue is not writable by the app role.
//
// Claiming marks a row RENDERING (skip-locked in the batch), so concurrent
// requests never double-render. Stale RENDERING rows (a crashed run) are
// reclaimed after a grace period, so no request is lost.

import { withSystem } from '../withUser.js'
import { renderPlaybookPdf, type PlaybookSnapshotLike } from '@vivahsync/core/pdf'

const STALE_MINUTES = 5

/** Render one already-claimed playbook and store the result (READY or FAILED). */
async function renderClaimed(playbookId: string): Promise<boolean> {
  try {
    const pb = await withSystem((tx) =>
      tx.query<{ version: number; snapshot: PlaybookSnapshotLike }>(
        `select version, snapshot from playbooks where id = $1`,
        [playbookId],
      ),
    )
    const row = pb.rows[0]
    const buf = await renderPlaybookPdf(row.snapshot, { version: row.version })
    await withSystem((tx) =>
      tx.query(
        `update playbook_renders
            set status = 'READY', pdf = $2, rendered_at = now(), error = null
          where playbook_id = $1`,
        [playbookId, buf],
      ),
    )
    return true
  } catch (e) {
    await withSystem((tx) =>
      tx.query(`update playbook_renders set status = 'FAILED', error = $2 where playbook_id = $1`, [
        playbookId,
        e instanceof Error ? e.message : String(e),
      ]),
    )
    return false
  }
}

/**
 * Render a single playbook right now unless it's already READY or another
 * request is mid-render. FAILED renders are retried. Callers must check access
 * first (this runs RLS-bypassing). Returns whether this call did the render.
 */
export async function renderPlaybookNow(playbookId: string): Promise<boolean> {
  const claimed = await withSystem((tx) =>
    tx.query(
      `update playbook_renders
          set status = 'RENDERING', claimed_at = now()
        where playbook_id = $1
          and (status in ('PENDING', 'FAILED')
               or (status = 'RENDERING' and claimed_at < now() - ($2 || ' minutes')::interval))
        returning playbook_id`,
      [playbookId, String(STALE_MINUTES)],
    ),
  )
  if (!claimed.rowCount) return false
  return renderClaimed(playbookId)
}

export async function renderPendingPlaybooks(limit = 5): Promise<{
  rendered: number
  failed: number
}> {
  // reclaim anything stuck mid-render by a previous crashed run
  await withSystem((tx) =>
    tx.query(
      `update playbook_renders set status = 'PENDING', claimed_at = null
        where status = 'RENDERING' and claimed_at < now() - ($1 || ' minutes')::interval`,
      [String(STALE_MINUTES)],
    ),
  )

  // claim a batch
  const claimed = await withSystem((tx) =>
    tx.query<{ playbook_id: string }>(
      `update playbook_renders r
          set status = 'RENDERING', claimed_at = now()
        where r.playbook_id in (
          select playbook_id from playbook_renders
           where status = 'PENDING'
           order by requested_at asc
           limit $1
           for update skip locked
        )
        returning r.playbook_id`,
      [limit],
    ),
  )

  let rendered = 0
  let failed = 0
  for (const { playbook_id } of claimed.rows) {
    if (await renderClaimed(playbook_id)) rendered++
    else failed++
  }
  return { rendered, failed }
}
