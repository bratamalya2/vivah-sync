// Supabase Storage helpers for evidence media. Uses the SERVICE ROLE key, so
// this is server-only (worker, server actions, route handlers) — never import
// it into a client component. The bucket is PRIVATE; access is granted only via
// short-lived signed URLs minted after an RLS check in the app layer.

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export const EVIDENCE_BUCKET = 'evidence'
/** Per-file cap, enforced by the bucket itself (signed uploads bypass our server). */
export const EVIDENCE_MAX_BYTES = 30 * 1024 * 1024

let _client: SupabaseClient | undefined
function svc(): SupabaseClient {
  if (!_client) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) throw new Error('Storage: missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
    _client = createClient(url, key, { auth: { persistSession: false } })
  }
  return _client
}

/**
 * Idempotently ensure the private evidence bucket exists with its size cap.
 * Browsers upload straight to Storage via signed URLs, so the bucket's own
 * fileSizeLimit is what actually rejects oversized files.
 */
export async function ensureEvidenceBucket(): Promise<void> {
  const s = svc()
  const opts = { public: false, fileSizeLimit: EVIDENCE_MAX_BYTES }
  const { data } = await s.storage.getBucket(EVIDENCE_BUCKET)
  if (!data) {
    const { error } = await s.storage.createBucket(EVIDENCE_BUCKET, opts)
    // ignore "already exists" races
    if (error && !/exist/i.test(error.message)) throw new Error(`createBucket: ${error.message}`)
  } else if (data.file_size_limit !== EVIDENCE_MAX_BYTES) {
    const { error } = await s.storage.updateBucket(EVIDENCE_BUCKET, opts)
    if (error) throw new Error(`updateBucket: ${error.message}`)
  }
}

/** A one-time token the browser uses to upload this exact path itself. */
export async function createEvidenceUploadToken(path: string): Promise<string> {
  const { data, error } = await svc().storage.from(EVIDENCE_BUCKET).createSignedUploadUrl(path)
  if (error || !data) throw new Error(`signed upload: ${error?.message ?? 'no token'}`)
  return data.token
}

/** What actually landed in Storage at `path` (size + type), or null if nothing did. */
export async function evidenceObjectInfo(
  path: string,
): Promise<{ size: number; contentType: string | null } | null> {
  const slash = path.lastIndexOf('/')
  const dir = path.slice(0, slash)
  const name = path.slice(slash + 1)
  const { data, error } = await svc()
    .storage.from(EVIDENCE_BUCKET)
    .list(dir, { search: name, limit: 10 })
  if (error) throw new Error(`storage list: ${error.message}`)
  const obj = data?.find((o) => o.name === name)
  if (!obj) return null
  const meta = (obj.metadata ?? {}) as { size?: number; mimetype?: string }
  return { size: Number(meta.size ?? 0), contentType: meta.mimetype ?? null }
}

export async function uploadEvidence(path: string, bytes: Buffer, contentType: string): Promise<void> {
  const { error } = await svc()
    .storage.from(EVIDENCE_BUCKET)
    .upload(path, bytes, { contentType, upsert: false })
  if (error) throw new Error(`storage upload failed: ${error.message}`)
}

/** Idempotent — removing a missing object is not an error. */
export async function deleteEvidenceObject(path: string): Promise<void> {
  await svc().storage.from(EVIDENCE_BUCKET).remove([path])
}

export async function signedEvidenceUrl(path: string, expiresInSeconds = 60): Promise<string | null> {
  const { data, error } = await svc()
    .storage.from(EVIDENCE_BUCKET)
    .createSignedUrl(path, expiresInSeconds)
  if (error || !data) return null
  return data.signedUrl
}
