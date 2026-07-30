import type { PoolClient } from 'pg'
import { appPool, systemPool } from './pool.js'

/**
 * A thin, RLS-safe query surface handed to callbacks. Deliberately minimal —
 * callers get exactly what they need and nothing that could escape the tenant
 * scope (no raw pool, no ability to change role mid-transaction).
 */
export interface Tx {
  query<T = Record<string, unknown>>(
    text: string,
    params?: readonly unknown[],
  ): Promise<{ rows: T[]; rowCount: number }>
}

function wrap(client: PoolClient): Tx {
  return {
    async query(text, params) {
      const r = await client.query(text, params as unknown[])
      return { rows: r.rows as never, rowCount: r.rowCount ?? 0 }
    },
  }
}

/**
 * Run `fn` inside a single transaction scoped to one authenticated user.
 *
 * The two SET statements below are the whole ballgame:
 *   - `SET LOCAL ROLE authenticated` — the app role owns the tables and has
 *     bypassrls=true, so WITHOUT this, RLS does not apply and every query
 *     fails OPEN. Verified against the live pooler in capability-check.mjs.
 *   - `set_config('request.jwt.claims', …, true)` — transaction-local, so a
 *     pooled connection never carries one user's identity into the next
 *     request. The `true` is load-bearing.
 *
 * Queries outside this wrapper (i.e. as the raw bypassrls role) see everything,
 * so this is the ONLY sanctioned request-scoped query path. Do not export the
 * pool. Keep the body short: never await external I/O (Cashfree, email) while a
 * transaction — and thus a pooled connection — is held open.
 */
export async function withUser<T>(
  userId: string,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  if (!userId || !/^[0-9a-f-]{36}$/i.test(userId)) {
    throw new Error('withUser: a valid user UUID is required')
  }
  const client = await appPool().connect()
  try {
    await client.query('begin')
    await client.query('set local role authenticated')
    await client.query("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({ sub: userId, role: 'authenticated' }),
    ])
    const out = await fn(wrap(client))
    await client.query('commit')
    return out
  } catch (err) {
    await client.query('rollback').catch(() => {})
    throw err
  } finally {
    client.release()
  }
}

/**
 * Privileged, RLS-bypassing transaction for the worker and for verified webhook
 * writes. Runs as the owner role on the system pool — no SET ROLE, so RLS does
 * not apply. Use sparingly and never on request-supplied identity; this is the
 * "system mode" that must stay hard to reach by accident.
 */
export async function withSystem<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  const client = await systemPool().connect()
  try {
    await client.query('begin')
    const out = await fn(wrap(client))
    await client.query('commit')
    return out
  } catch (err) {
    await client.query('rollback').catch(() => {})
    throw err
  } finally {
    client.release()
  }
}
