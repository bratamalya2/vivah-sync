// FR-581.2 worker job: permanently purge evidence media past its retention
// window (180 days), except items on legal hold. Two-phase and idempotent —
// delete the Storage object first, then the row; a crash between the two just
// means the next run re-picks the (still-expired) row and re-deletes (removing a
// missing object is a no-op). Runs on the owner connection (RLS-bypassing).

import { withSystem } from '../withUser.js'
import { deleteEvidenceObject } from '../storage.js'

export async function sweepExpiredMedia(
  retentionDays = 180,
  limit = 200,
): Promise<{ deleted: number }> {
  const expired = await withSystem((tx) =>
    tx.query<{ id: string; storage_path: string }>(
      `select id, storage_path from evidence_media
        where legal_hold = false
          and created_at < now() - ($1 || ' days')::interval
        order by created_at asc
        limit $2`,
      [String(retentionDays), limit],
    ),
  )

  let deleted = 0
  for (const row of expired.rows) {
    await deleteEvidenceObject(row.storage_path) // idempotent
    await withSystem((tx) => tx.query('delete from evidence_media where id = $1', [row.id]))
    deleted++
  }
  return { deleted }
}
