import pg from 'pg'
import { dbEnv, dbSsl } from './env.js'

// Two pools, two trust levels.
//
//  appPool    — every request-scoped query. Connects as a bypassrls role, so it
//               is ONLY safe through withUser(), which SET LOCAL ROLE authenticated.
//  systemPool — privileged, RLS-bypassing. Worker jobs + token-gated public routes (RSVP, itinerary).
//
// Both are module singletons so the process holds a bounded connection count.

let _appPool: pg.Pool | undefined
let _systemPool: pg.Pool | undefined

// A Pool re-emits errors from IDLE clients as an 'error' event. If nothing is
// listening, node-postgres rethrows it as an uncaught exception and CRASHES the
// process — which is exactly what happens when the Supabase pooler drops an idle
// connection (ECONNRESET → "Connection terminated unexpectedly"). Swallow it:
// the pool discards the dead client and opens a fresh one on the next checkout.
function guard(pool: pg.Pool, name: string): pg.Pool {
  pool.on('error', (err) => {
    console.error(
      JSON.stringify({ svc: 'db', pool: name, msg: 'idle client error (recovered)', error: err.message }),
    )
  })
  return pool
}

export function appPool(): pg.Pool {
  if (!_appPool) {
    _appPool = guard(
      new pg.Pool({
        connectionString: dbEnv.appUrl,
        ssl: dbSsl,
        max: 10,
        keepAlive: true,
        // Never hold a pooled connection hostage across external I/O.
        statement_timeout: 15_000,
        idleTimeoutMillis: 30_000,
      }),
      'app',
    )
  }
  return _appPool
}

export function systemPool(): pg.Pool {
  if (!_systemPool) {
    _systemPool = guard(
      new pg.Pool({
        connectionString: dbEnv.workerUrl,
        ssl: dbSsl,
        max: 5,
        keepAlive: true,
        statement_timeout: 60_000,
        idleTimeoutMillis: 30_000,
      }),
      'system',
    )
  }
  return _systemPool
}

export async function closePools(): Promise<void> {
  await Promise.all([_appPool?.end(), _systemPool?.end()])
  _appPool = undefined
  _systemPool = undefined
}

export type { pg }
