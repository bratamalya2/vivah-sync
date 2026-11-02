import { getUser } from '@/lib/auth'
import { getRenderStatus, getRenderedPdf } from '@vivahsync/db'
import { renderPlaybookNow } from '@vivahsync/db/jobs'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; pbId: string }> },
) {
  const { pbId } = await params
  const user = await getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  // RLS-scoped access check: null if the user can't see this playbook. It must
  // come first — renderPlaybookNow runs on the RLS-bypassing system connection.
  const status = await getRenderStatus(user.id, pbId)
  if (!status) return new Response('Playbook not found.', { status: 404 })

  // No background worker on Vercel: render on first download (pdfkit, ~1s).
  if (status.status !== 'READY') await renderPlaybookNow(pbId)

  const pdf = await getRenderedPdf(user.id, pbId)
  if (!pdf) {
    const now = await getRenderStatus(user.id, pbId)
    return now?.status === 'RENDERING'
      ? new Response('The PDF is being generated — try again in a moment.', {
          status: 503,
          headers: { 'retry-after': '3' },
        })
      : new Response('The PDF could not be generated. Please try again.', { status: 500 })
  }

  return new Response(new Uint8Array(pdf), {
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': 'inline; filename="vivahsync-playbook.pdf"',
      'cache-control': 'private, no-store',
    },
  })
}
