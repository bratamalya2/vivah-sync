// Centralised, validated DB environment. Loaded once.
//
// DATABASE_URL        — Supavisor TRANSACTION pooler (6543). Request-scoped, RLS-subject.
// WORKER_DATABASE_URL — session pooler (5432). Privileged, RLS-bypassing. Worker/webhook only.
// DIRECT_URL          — session pooler (5432). Schema tooling only.

import { config } from 'dotenv'
import { fileURLToPath } from 'node:url'
import { existsSync } from 'node:fs'

// Load the repo-root .env for standalone processes (worker, tests). When the DB
// vars are already in the environment — Render injects them, and the Next app
// loads the root .env in next.config.mjs — we skip file loading entirely, which
// also avoids import.meta.url path resolution under webpack bundling.
if (!process.env.DATABASE_URL) {
  try {
    const rootEnv = fileURLToPath(new URL('../../../.env', import.meta.url))
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
  /** Privileged, RLS-bypassing connection for the worker and webhook RPCs. */
  workerUrl: process.env.WORKER_DATABASE_URL ?? process.env.DIRECT_URL ?? required('DATABASE_URL'),
}

// Supabase's managed certs terminate at the pooler; rejectUnauthorized:false is
// the pragmatic setting for the pooler host. Revisit with a pinned CA for prod.
export const dbSsl = { rejectUnauthorized: false } as const
