// Centralised, validated DB environment. Loaded once.
//
// DATABASE_URL        — Supavisor TRANSACTION pooler (6543). Request-scoped, RLS-subject.
// WORKER_DATABASE_URL — session pooler (5432). Privileged, RLS-bypassing. Worker/token routes only.
// DIRECT_URL          — session pooler (5432). Schema tooling only.

import { config } from 'dotenv'
import { fileURLToPath } from 'node:url'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'

// Load the repo-root .env for standalone processes (worker, tests, scripts).
// When the DB vars are already in the environment — Vercel/Render inject them,
// and `next dev` loads the root .env in next.config.mjs — we skip this.
//
// The path is joined at runtime on purpose: webpack treats the literal form
// `new URL('…/.env', import.meta.url)` as an asset and would copy the secrets
// file into the server bundle (or fail the build where no .env exists).
if (!process.env.DATABASE_URL) {
  try {
    const rootEnv = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '.env')
    if (existsSync(rootEnv)) config({ path: rootEnv })
  } catch {
    // Bundled context without a readable .env — rely on process.env.
  }
}

function required(name: string): string {
  const v = process.env[name]
  if (!v || v.trim() === '' || /^<.*>$/.test(v)) {
    throw new Error(`Missing required env var ${name}`)
  }
  return v
}

export const dbEnv = {
  /** Request-scoped app connection — RLS applies once SET LOCAL ROLE authenticated. */
  appUrl: required('DATABASE_URL'),
  /** Privileged, RLS-bypassing connection for the worker and token-gated public routes. */
  workerUrl: process.env.WORKER_DATABASE_URL ?? process.env.DIRECT_URL ?? required('DATABASE_URL'),
}

// Supabase's managed certs terminate at the pooler; rejectUnauthorized:false is
// the pragmatic setting for the pooler host. Revisit with a pinned CA for prod.
export const dbSsl = { rejectUnauthorized: false } as const
