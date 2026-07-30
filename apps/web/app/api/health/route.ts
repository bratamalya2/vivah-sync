import { NextResponse } from 'next/server'
import { ping } from '@vivahsync/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const db = await ping()
    return NextResponse.json({
      ok: true,
      service: 'vivahsync-web',
      db: { ok: db.ok, version: db.version.split(' ').slice(0, 2).join(' ') },
      ts: new Date().toISOString(),
    })
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'unknown' },
      { status: 503 },
    )
  }
}
