// Worker job: turn PENDING playbook render requests into stored PDFs.
//
// Imported ONLY by the worker (and tests) via '@vivahsync/db/jobs' — it pulls
// in the pdfkit engine from '@vivahsync/core/pdf', which must never reach the
// Next.js web bundle. Runs on the owner connection (withSystem) since the
// render queue is not writable by the app role.
//
// Claiming is skip-locked and marks rows RENDERING so overlapping ticks (or a
// second instance) never double-render. Stale RENDERING rows (a crashed run)
// are reclaimed after a grace period, so no request is lost.

import { withSystem } from '../withUser.js'
import { renderPlaybookPdf, type PlaybookSnapshotLike } from '@vivahsync/core/pdf'

const STALE_MINUTES = 5

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
    try {
      const pb = await withSystem((tx) =>
        tx.query<{ version: number; snapshot: PlaybookSnapshotLike }>(
          `select version, snapshot from playbooks where id = $1`,
          [playbook_id],
        ),
      )
      const row = pb.rows[0]
      const buf = await renderPlaybookPdf(row.snapshot, { version: row.version })
      await withSystem((tx) =>
        tx.query(
          `update playbook_renders
              set status = 'READY', pdf = $2, rendered_at = now(), error = null
            where playbook_id = $1`,
          [playbook_id, buf],
        ),
      )
      rendered++
    } catch (e) {
      await withSystem((tx) =>
        tx.query(
          `update playbook_renders set status = 'FAILED', error = $2 where playbook_id = $1`,
          [playbook_id, e instanceof Error ? e.message : String(e)],
        ),
      )
      failed++
    }
  }

  return { rendered, failed }
}
