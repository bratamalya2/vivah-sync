import { getUser } from '@/lib/auth'
import { getEvidenceStoragePath } from '@vivahsync/db'
import { signedEvidenceUrl } from '@vivahsync/db/storage'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Serves evidence media by redirecting to a short-lived signed URL — but only
// after an RLS check: getEvidenceStoragePath returns null unless the caller has
// operational access to the media's project. The bucket itself stays private.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; mediaId: string }> },
) {
  const { mediaId } = await params
  const user = await getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const path = await getEvidenceStoragePath(user.id, mediaId)
  if (!path) return new Response('Not found', { status: 404 })

  const url = await signedEvidenceUrl(path, 120)
  if (!url) return new Response('Not found', { status: 404 })

  return Response.redirect(url, 307)
}
