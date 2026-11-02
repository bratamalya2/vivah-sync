'use client'

import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import type { PrepareInput, PrepareResult, FinalizeInput, FinalizeResult } from '@/lib/evidenceUpload'

/**
 * Photo/video evidence upload that sends the file straight from the browser to
 * Supabase Storage (Vercel won't accept request bodies over 4.5 MB). The two
 * server actions do the access checks on either side of the upload; the result
 * is reported through the page's existing ?msg= / ?err= banners.
 */
export default function EvidenceUpload({
  eventId,
  basePath,
  maxBytes,
  prepare,
  finalize,
  label = 'Upload',
}: {
  eventId: string
  /** The page to report back to, e.g. /dashboard/projects/{id} or /vendor. */
  basePath: string
  maxBytes: number
  prepare: (input: PrepareInput) => Promise<PrepareResult>
  finalize: (input: FinalizeInput) => Promise<FinalizeResult>
  label?: string
}) {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  // The form only works once hydrated (the upload runs in JS); until then a
  // press would fall through to a plain GET submit, so keep it disabled.
  const [ready, setReady] = useState(false)
  useEffect(() => setReady(true), [])

  const report = (kind: 'msg' | 'err', text: string) => {
    router.replace(`${basePath}?${kind}=${encodeURIComponent(text)}`, { scroll: false })
    router.refresh()
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const file = fileRef.current?.files?.[0]
    if (!file) return report('err', 'Choose a photo or video to upload.')
    if (file.size > maxBytes) {
      return report('err', `File is too large (max ${Math.round(maxBytes / 1024 / 1024)} MB).`)
    }

    setBusy(true)
    try {
      const p = await prepare({ eventId, fileName: file.name, size: file.size })
      if (!p.ok) return report('err', p.error)

      const { error } = await createSupabaseBrowserClient()
        .storage.from(p.bucket)
        .uploadToSignedUrl(p.path, p.token, file, {
          contentType: file.type || 'application/octet-stream',
        })
      if (error) return report('err', `Upload failed: ${error.message}`)

      const f = await finalize({ eventId, mediaId: p.mediaId, fileName: file.name })
      if (!f.ok) return report('err', f.error)
      if (fileRef.current) fileRef.current.value = ''
      report('msg', 'Evidence uploaded.')
    } catch {
      report('err', 'Upload failed. Please retry.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="reschedform" aria-busy={busy}>
      <input ref={fileRef} type="file" name="file" accept="image/*,video/*" required disabled={busy} />
      <button className="mini" type="submit" disabled={busy || !ready}>
        {busy ? 'Uploading…' : label}
      </button>
    </form>
  )
}
