// Supabase Storage helpers for evidence media. Uses the SERVICE ROLE key, so
// this is server-only (worker, server actions, route handlers) — never import
// it into a client component. The bucket is PRIVATE; access is granted only via
// short-lived signed URLs minted after an RLS check in the app layer.

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export const EVIDENCE_BUCKET = 'evidence'

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

/** Idempotently ensure the private evidence bucket exists. */
export async function ensureEvidenceBucket(): Promise<void> {
  const s = svc()
  const { data } = await s.storage.getBucket(EVIDENCE_BUCKET)
  if (!data) {
    const { error } = await s.storage.createBucket(EVIDENCE_BUCKET, { public: false })
    // ignore "already exists" races
    if (error && !/exist/i.test(error.message)) throw new Error(`createBucket: ${error.message}`)
  }
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
