import { getUser } from '@/lib/auth'
import { getSharedEvidencePath } from '@vivahsync/db'
import { signedEvidenceUrl } from '@vivahsync/db/storage'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Shared evidence route used by the family + vendor portals (and planners).
// Resolves the storage path by ANY access route — project_access (planner/family)
// or a vendor booked on the ceremony — then redirects to a short-lived signed
// URL. The bucket itself stays private; getSharedEvidencePath returns null unless
// the caller genuinely has access.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ mediaId: string }> },
) {
  const { mediaId } = await params
  const user = await getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const path = await getSharedEvidencePath(user.id, mediaId)
  if (!path) return new Response('Not found', { status: 404 })

  const url = await signedEvidenceUrl(path, 120)
  if (!url) return new Response('Not found', { status: 404 })

  return Response.redirect(url, 307)
}
