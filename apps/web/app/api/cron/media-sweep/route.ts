import { timingSafeEqual } from 'node:crypto'
import { sweepExpiredMedia } from '@vivahsync/db/jobs'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

// FR-581.2 evidence retention: purge media older than 180 days (legal holds
// excepted). Scheduled daily by vercel.json — Vercel Cron calls this with
// `Authorization: Bearer $CRON_SECRET`. The sweep is idempotent, so a missed or
// repeated run is harmless; each call handles up to 200 items.

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false // fail closed: no secret configured, no sweep
  const got = Buffer.from(req.headers.get('authorization') ?? '')
  const want = Buffer.from(`Bearer ${secret}`)
  return got.length === want.length && timingSafeEqual(got, want)
}

export async function GET(req: Request): Promise<Response> {
  if (!authorized(req)) return new Response('Unauthorized', { status: 401 })
  try {
    const result = await sweepExpiredMedia()
    console.log(JSON.stringify({ svc: 'cron', job: 'media.sweep', ...result }))
    return Response.json(result)
  } catch (e) {
    const error = e instanceof Error ? e.message : 'unknown'
    console.error(JSON.stringify({ svc: 'cron', job: 'media.sweep.error', error }))
    return Response.json({ error }, { status: 500 })
  }
}
