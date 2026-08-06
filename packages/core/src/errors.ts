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
  /** Safe to show to a planner verbatim — the actionable detail. */
  message: string
  /** True for lock/serialization contention — the caller may retry. */
  retryable: boolean
  /**
   * True when a deliberate guardrail caught a costly mistake (a double-booking,
   * an over-capacity room, an unbalanced payment plan…). The UI reframes these
   * as positive system interventions rather than scary failures.
   */
  intervention: boolean
  /** For interventions, a positive one-line headline (e.g. "VivahSync prevented a double-booking"). */
  headline?: string
}

const RETRYABLE = new Set(['40P01', '40001', '55P03']) // deadlock, serialization, lock_not_available

const FRIENDLY: Record<string, string> = {
  '23P01': 'That space is already booked for an overlapping time. Pick a different space or time.',
  '23505': 'That record already exists.',
  '23503': 'A referenced record was not found.',
  '42501': 'You do not have access to do that.',
}

// Guardrail interventions — a rule the database enforces on purpose. Matched on
// the message so the UI can celebrate the catch ("VivahSync just prevented …")
// instead of scolding the planner. Order matters; first match wins.
const INTERVENTIONS: { re: RegExp; headline: string }[] = [
  { re: /already booked|overlapping|double-book/i, headline: 'VivahSync prevented a double-booking' },
  { re: /capacity|exceeds|beyond assigned|over the legal/i, headline: 'VivahSync prevented an over-capacity booking' },
  { re: /100%|payment plan|must total|does not add up|unbalanced/i, headline: 'VivahSync kept the payment plan balanced' },
  { re: /locked vendor commitment|reschedule it through|locked by an accepted|formal exception/i, headline: 'VivahSync protected a locked vendor commitment' },
  { re: /ledger|reversing entry|cannot be deleted|locked \(over 15|append-only/i, headline: 'VivahSync kept the ledger tamper-evident' },
  { re: /out of sequence|must start as|rejection reason is required/i, headline: 'VivahSync kept the booking lifecycle valid' },
  { re: /rationale|audit/i, headline: 'VivahSync recorded an accountable change' },
]

function classifyIntervention(code: string, source: string): { intervention: boolean; headline?: string } {
  const hit = INTERVENTIONS.find((i) => i.re.test(source))
  if (hit) return { intervention: true, headline: hit.headline }
  if (code === '23P01') return { intervention: true, headline: 'VivahSync prevented a double-booking' }
  return { intervention: false }
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
  const { intervention, headline } = classifyIntervention(code, dbMessage || message)
  return { kind: 'RULE_VIOLATION', code, message, retryable: RETRYABLE.has(code), intervention, headline }
}

/**
 * For a caught server-action error, split it into a positive "intervention"
 * line (a guardrail catch, shown as a win) or a plain error line. Lets an action
 * redirect with `?prevented=` vs `?err=` so the UI can style them differently.
 */
export function describeActionError(err: unknown, fallback: string): { prevented?: string; err?: string } {
  const v = translateDbError(err)
  if (v?.intervention && v.headline) return { prevented: `${v.headline} — ${v.message}` }
  return { err: v?.message ?? fallback }
}
