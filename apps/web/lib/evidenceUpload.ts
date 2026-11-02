// Direct-to-Storage evidence uploads (server half). Vercel caps a function's
// request body at 4.5 MB, so the file never passes through our server:
//   1. prepare  — after the caller's access check, mint a one-time signed
//                 upload token for a path we choose ({project}/{mediaId}{ext})
//   2. (browser) — uploads the bytes straight to Supabase Storage
//   3. finalize — re-check access, read what actually landed (size/type come
//                 from Storage, never from the client), then record the row
// The path is always rebuilt from the server-verified project id, so a client
// can neither pick where bytes go nor point a record at someone else's file.

import { translateDbError } from '@vivahsync/core'
import {
  EVIDENCE_BUCKET,
  EVIDENCE_MAX_BYTES,
  ensureEvidenceBucket,
  createEvidenceUploadToken,
  evidenceObjectInfo,
  deleteEvidenceObject,
} from '@vivahsync/db/storage'

export type PrepareInput = { eventId: string; fileName: string; size: number }
export type PrepareResult =
  | { ok: true; bucket: string; mediaId: string; path: string; token: string }
  | { ok: false; error: string }
export type FinalizeInput = { eventId: string; mediaId: string; fileName: string }
export type FinalizeResult = { ok: true } | { ok: false; error: string }
export type StoredEvidence = { mediaId: string; path: string; size: number; contentType: string | null }

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const NOT_ALLOWED = 'You are not allowed to add evidence here.'
const TOO_BIG = `File is too large (max ${EVIDENCE_MAX_BYTES / 1024 / 1024} MB).`

function evidencePath(projectId: string, mediaId: string, fileName: string): string {
  const dot = fileName.lastIndexOf('.')
  const ext = dot >= 0 ? fileName.slice(dot).toLowerCase().replace(/[^.a-z0-9]/g, '') : ''
  return `${projectId}/${mediaId}${ext}`
}

/** Step 1. `projectId` is the caller's access check result (null = not allowed). */
export async function prepareEvidenceUpload(
  projectId: string | null,
  input: PrepareInput,
): Promise<PrepareResult> {
  if (!projectId) return { ok: false, error: NOT_ALLOWED }
  if (!input.size) return { ok: false, error: 'Choose a photo or video to upload.' }
  if (input.size > EVIDENCE_MAX_BYTES) return { ok: false, error: TOO_BIG }
  try {
    const mediaId = crypto.randomUUID()
    const path = evidencePath(projectId, mediaId, input.fileName)
    await ensureEvidenceBucket()
    const token = await createEvidenceUploadToken(path)
    return { ok: true, bucket: EVIDENCE_BUCKET, mediaId, path, token }
  } catch {
    return { ok: false, error: 'Could not start the upload. Please retry.' }
  }
}

/** Step 3. `record` inserts the evidence row with the caller's own permissions. */
export async function finalizeEvidenceUpload(
  projectId: string | null,
  input: FinalizeInput,
  record: (stored: StoredEvidence) => Promise<void>,
): Promise<FinalizeResult> {
  if (!projectId) return { ok: false, error: NOT_ALLOWED }
  if (!UUID_RE.test(input.mediaId)) return { ok: false, error: 'Upload not recognised. Please retry.' }

  const path = evidencePath(projectId, input.mediaId, input.fileName)
  const info = await evidenceObjectInfo(path)
  if (!info) return { ok: false, error: 'The upload did not arrive. Please retry.' }
  if (info.size > EVIDENCE_MAX_BYTES) {
    await deleteEvidenceObject(path)
    return { ok: false, error: TOO_BIG }
  }

  try {
    await record({ mediaId: input.mediaId, path, size: info.size, contentType: info.contentType })
  } catch (e) {
    // a repeated finalize for the same upload is a no-op, not a reason to delete the file
    if ((e as { code?: string })?.code === '23505') return { ok: true }
    await deleteEvidenceObject(path) // don't leave orphaned bytes if the row insert fails
    return { ok: false, error: translateDbError(e)?.message ?? 'Upload failed.' }
  }
  return { ok: true }
}
