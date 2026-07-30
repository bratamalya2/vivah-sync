import { getUser } from '@/lib/auth'
import { getRenderedPdf } from '@vivahsync/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; pbId: string }> },
) {
  const { pbId } = await params
  const user = await getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  // getRenderedPdf is RLS-scoped: returns null if the user can't access this
  // playbook, or if the render isn't READY yet.
  const pdf = await getRenderedPdf(user.id, pbId)
  if (!pdf) return new Response('Playbook PDF is not ready yet.', { status: 404 })

  return new Response(new Uint8Array(pdf), {
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': 'inline; filename="vivahsync-playbook.pdf"',
      'cache-control': 'private, no-store',
    },
  })
}
