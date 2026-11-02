// VivahSync worker — the always-on, single-instance background process.
// No HTTP surface. Runs on Render as a background worker.
//
// Scheduled responsibilities (added milestone by milestone):
//   - date-triggered milestone activation (PENDING -> DUE)          [M5]
//   - daily cash-flow / risk recompute cache                        [M5/M6]
//   - email notification retries                                    [M6]
//   - (phase 2) evidence media 6-month TTL sweep
//
// node-cron uses in-process wall-clock scheduling with no backfill, so every
// job MUST be written to catch up by scanning on timestamps (idempotent),
// never to assume it fired exactly once. A restart or missed window must not
// drop a liability or over-retain data.

import cron from 'node-cron'
import { ping, closePools } from '@vivahsync/db'
import { renderPendingPlaybooks, sweepExpiredMedia } from '@vivahsync/db/jobs'
import { ensureEvidenceBucket } from '@vivahsync/db/storage'

const TZ = process.env.TZ || 'Asia/Kolkata'

function log(msg: string, extra?: Record<string, unknown>) {
  console.log(JSON.stringify({ t: new Date().toISOString(), svc: 'worker', msg, ...extra }))
}

async function heartbeat() {
  try {
    const db = await ping()
    log('heartbeat', { db: db.version.split(' ').slice(0, 2).join(' ') })
  } catch (err) {
    log('heartbeat.db_unreachable', { error: err instanceof Error ? err.message : 'unknown' })
  }
}

// re-entrancy guard: never let two render passes overlap on one instance
let renderRunning = false
async function playbookRenderPass() {
  if (renderRunning) return
  renderRunning = true
  try {
    const r = await renderPendingPlaybooks(5)
    if (r.rendered || r.failed) log('playbook.render', r)
  } catch (err) {
    log('playbook.render.error', { error: err instanceof Error ? err.message : 'unknown' })
  } finally {
    renderRunning = false
  }
}

// FR-581.2: purge evidence media past its 180-day retention (except legal holds)
async function mediaSweepPass() {
  try {
    const r = await sweepExpiredMedia()
    if (r.deleted) log('media.sweep', r)
  } catch (err) {
    log('media.sweep.error', { error: err instanceof Error ? err.message : 'unknown' })
  }
}

async function main() {
  log('worker.starting', { tz: TZ })
  await heartbeat()
  await ensureEvidenceBucket().catch((err) =>
    log('evidence.bucket.error', { error: err instanceof Error ? err.message : 'unknown' }),
  )

  // Heartbeat every 5 minutes — proves the process + DB path are alive.
  cron.schedule('*/5 * * * *', heartbeat, { timezone: TZ })

  // Playbook PDF rendering — claim PENDING renders and store the bytes.
  cron.schedule('*/20 * * * * *', playbookRenderPass, { timezone: TZ })
  await playbookRenderPass() // catch up immediately on boot

  // Evidence 180-day TTL sweep — daily at 03:00 IST.
  cron.schedule('0 3 * * *', mediaSweepPass, { timezone: TZ })

  log('worker.ready', { jobs: ['heartbeat', 'playbookRender', 'mediaSweep'] })
}

async function shutdown(signal: string) {
  log('worker.stopping', { signal })
  await closePools().catch(() => {})
  process.exit(0)
}
process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))

main().catch((err) => {
  log('worker.fatal', { error: err instanceof Error ? err.stack : String(err) })
  process.exit(1)
})
