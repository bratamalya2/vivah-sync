// SQLSTATE -> planner-readable error translation.
//
// The database is where the rules live, so most user-facing errors originate as
// Postgres constraint/trigger failures. This turns them into messages a planner
// can act on — the headline guarantee ("this space is already booked") has no
// value if it surfaces as a raw stack trace.
//
// Two driver shapes are handled:
//   - node-postgres (pg): the SQLSTATE is on `err.code` directly.
//   - Prisma: trigger/constraint failures it doesn't model are raised as
//     PrismaClientUnknownRequestError with the code buried in the message as a
//     stringified Rust struct — so we parse it out.

export interface RuleViolation {
  kind: 'RULE_VIOLATION'
  /** SQLSTATE, e.g. '23P01'. */
  code: string
  /** Safe to show to a planner verbatim. */
  message: string
  /** True for lock/serialization contention — the caller may retry. */
  retryable: boolean
}

const RETRYABLE = new Set(['40P01', '40001', '55P03']) // deadlock, serialization, lock_not_available

const FRIENDLY: Record<string, string> = {
  '23P01': 'That space is already booked for an overlapping time. Pick a different space or time.',
  '23505': 'That record already exists.',
  '23503': 'A referenced record was not found.',
  '42501': 'You do not have access to do that.',
}

/** Pull SQLSTATE + message out of a Prisma "unknown request" error string. */
function fromPrismaStruct(message: string): { code: string; dbMessage?: string } | null {
  const code = message.match(/code:\s*"([0-9A-Z]{5})"/)?.[1]
  if (!code) return null
  const dbMessage = message.match(/message:\s*"((?:[^"\\]|\\.)*)"/)?.[1]?.replace(/\\"/g, '"')
  return { code, dbMessage }
}

/**
 * Returns a RuleViolation if `err` is a recognised DB rule failure, else null
 * (let the caller treat it as an unexpected error).
 */
export function translateDbError(err: unknown): RuleViolation | null {
  const e = err as { code?: string; message?: string }
  let code = typeof e?.code === 'string' && /^[0-9A-Z]{5}$/.test(e.code) ? e.code : undefined
  let dbMessage = e?.message

  if (!code && typeof e?.message === 'string') {
    const parsed = fromPrismaStruct(e.message)
    if (parsed) {
      code = parsed.code
      dbMessage = parsed.dbMessage ?? dbMessage
    }
  }
  if (!code) return null

  // Trigger / check / raise failures carry a message written for the planner.
  const carriesUserMessage = code === '23514' || code === 'P0001'
  const message =
    (carriesUserMessage && dbMessage) ||
    FRIENDLY[code] ||
    (RETRYABLE.has(code) ? 'Another change is in progress. Please try again.' : null)

  if (!message) return null
  return { kind: 'RULE_VIOLATION', code, message, retryable: RETRYABLE.has(code) }
}
