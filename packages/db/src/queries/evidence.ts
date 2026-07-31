// FR-581 evidence records (the Storage bytes are handled in ../storage.ts).
// All RLS-scoped: only operational members read/upload; family is blind.

import { withUser } from '../withUser.js'

export interface EvidenceRow {
  id: string
  entity_id: string
  file_name: string | null
  content_type: string | null
  byte_size: number | null
  legal_hold: boolean
  uploader_name: string | null
  created_at: string
}

/** Returns the project id if the caller may upload evidence to this event, else null. */
export async function getEventForUpload(userId: string, eventId: string): Promise<string | null> {
  return withUser(userId, async (tx) => {
    const r = await tx.query<{ project_id: string }>(
      `select e.project_id from events e
        where e.id = $1 and e.project_id in (select app.operational_project_ids())`,
      [eventId],
    )
    return r.rows[0]?.project_id ?? null
  })
}

export async function recordEvidence(
  userId: string,
  input: {
    id: string
    projectId: string
    entityType: string
    entityId: string
    storagePath: string
    contentType: string | null
    fileName: string | null
    byteSize: number | null
  },
): Promise<void> {
  await withUser(userId, async (tx) => {
    await tx.query(
      `insert into evidence_media
         (id, project_id, entity_type, entity_id, storage_path, content_type, file_name, byte_size)
       values ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        input.id,
        input.projectId,
        input.entityType,
        input.entityId,
        input.storagePath,
        input.contentType,
        input.fileName,
        input.byteSize,
      ],
    )
  })
}

/** All evidence for a project's ceremonies, newest first. */
export async function listProjectEvidence(userId: string, projectId: string): Promise<EvidenceRow[]> {
  return withUser(userId, async (tx) => {
    const r = await tx.query<EvidenceRow>(
      `select em.id, em.entity_id, em.file_name, em.content_type, em.byte_size, em.legal_hold,
              coalesce(u.full_name, u.email) as uploader_name,
              to_char(em.created_at at time zone 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI') as created_at
         from evidence_media em
         left join app_users u on u.id = em.uploader_user_id
         join events e on e.id = em.entity_id and em.entity_type = 'event'
        where e.project_id = $1
        order by em.created_at desc`,
      [projectId],
    )
    return r.rows
  })
}

/** Storage path for a media the caller can access, or null (RLS-scoped). */
export async function getEvidenceStoragePath(userId: string, mediaId: string): Promise<string | null> {
  return withUser(userId, async (tx) => {
    const r = await tx.query<{ storage_path: string }>(
      `select storage_path from evidence_media where id = $1`,
      [mediaId],
    )
    return r.rows[0]?.storage_path ?? null
  })
}

/**
 * Storage path resolved by ANY access route — project_access (planner/family) or
 * a vendor booked on the media's ceremony. Backs the shared /media/[id] route so
 * family and vendors can view evidence, not just operational planner members.
 */
export async function getSharedEvidencePath(userId: string, mediaId: string): Promise<string | null> {
  return withUser(userId, async (tx) => {
    const r = await tx.query<{ p: string | null }>('select app.my_evidence_path($1) as p', [mediaId])
    return r.rows[0]?.p ?? null
  })
}

/** Delete a media record (FULL scope). Returns the storage path so the caller removes the object. */
export async function deleteEvidence(userId: string, mediaId: string): Promise<string | null> {
  return withUser(userId, async (tx) => {
    const r = await tx.query<{ storage_path: string }>(
      `delete from evidence_media where id = $1 returning storage_path`,
      [mediaId],
    )
    return r.rows[0]?.storage_path ?? null
  })
}
