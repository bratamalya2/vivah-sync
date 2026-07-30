# VivahSync — Project Overview

*Last updated: 20 July 2026. Reflects verified state, not intent.*

---

## 1. What this is

**An operational system of record for Indian wedding planning agencies.**

An Indian wedding is a 3–7 day, multi-venue, 20–40 vendor operation currently
coordinated over WhatsApp, Excel and cash. There is no system of record. The cost
of that isn't vague "inefficiency" — it's a small set of specific, expensive
failure modes that the business requirements name repeatedly:

| What goes wrong | Requirement |
|---|---|
| Two events booked into the same lawn at overlapping times | BR-101 |
| A vendor confirmed verbally, then the sangeet moves 90 minutes and nobody tells the decorator | BR-201, BR-261 |
| Milestone payments that total 93% of the contract, discovered post-event | BR-2861 |
| ₹4L in cash disbursed on-site with no ledger entry | BR-2961 |
| No idea on Day 3 whether there's cash on hand to pay local vendors | BR-3181 |
| Sales promises lost in the handover to the operations team | BR-62561 |

### The product thesis

Most wedding tools are a shared spreadsheet with a calendar view. They *store*
your plan. The differentiator here is that VivahSync **refuses to store an
invalid one.**

A double-booking isn't flagged after the fact — it is physically impossible to
save. A payment plan that doesn't total the contract cannot be activated. A
ledger entry cannot be edited. That enforcement is the product, and it is the
reason the architecture looks the way it does.

**Who pays:** wedding planning agencies. Production companies co-own projects as
collaborators. Vendors get scoped accounts. Venue chains are modelled but not a
primary customer yet.

---

## 2. Why PostgreSQL, and why the rules live in the database

Almost every functional requirement is a **constraint**, not a document. Read
them as database primitives and the choice makes itself:

| Requirement | Postgres primitive |
|---|---|
| FR-101.1 no overlapping space bookings | `EXCLUDE USING gist (space_id =, period &&)` |
| FR-2861.1 milestones total exactly 100% | deferrable constraint trigger |
| FR-2961.1 append-only ledger | `REVOKE UPDATE, DELETE` + trigger |
| FR-2821.1 lock currency after first transaction | trigger on ledger insert |
| FR-181.1 rigidly sequential procurement status | transition-guard trigger |
| FR-201.1 immutable locked scope | `jsonb` snapshot + timestamp |
| Multi-org access control | Row-Level Security |

**FR-101.1 alone settles it.** Overlap detection in application code is a race
condition waiting to double-book a venue on a Saturday in December. In Postgres
it is one line of DDL, and the engine cannot store the conflict.

The corollary matters as much: **do not re-implement these checks in Node.** An
application-level overlap check would be both redundant and wrong. The API layer's
job is to catch the database error and translate it into something a planner can
read — that's [`packages/core/src/errors.ts`](packages/core/src/errors.ts).

**Elasticsearch is not needed and would be actively harmful.** The corpus is tiny
(a busy agency runs ~40 weddings a year), the queries are structured filters
rather than relevance-ranked search, and an eventually-consistent index of
financial data sitting outside the RLS policies would reopen exactly the leak path
the access model closes. `pg_trgm` covers fuzzy vendor/venue name lookup. Revisit
only if a cross-tenant vendor marketplace is built.

---

## 3. Access model

Not a single `tenant_id` column. That breaks the moment a project is co-owned by a planner *and* a production company, with vendor orgs from outside both needing scoped visibility into the same project.

```
organizations(type)              PLANNER | PRODUCTION | VENDOR | VENUE_CHAIN | FAMILY
users                            global identity — one user can belong to several orgs
memberships(user_id, org_id)

projects(owner_org_id)
project_grants(project_id, org_id, role, scope)
project_access(user_id, project_id, ...)    flattened; maintained by triggers
```

`project_access` is the flattened join of *membership* and *grant*, kept current
by triggers and read by every RLS policy — one indexed lookup instead of a two-hop
join per query. **Application code must never write it.**

Three scopes:

**FULL** — planner (OWNER) and production companies (COLLABORATOR). Sees everything on the project.

**ASSIGNED_ONLY** — vendor orgs. Sees only their own bookings, events, and their own contract.

**READ_ONLY** — family portal clients. Narrowly scoped to view project_days, events, and playbooks, while entirely blind to the ledger and vendor commercial tables.

That second scope is load-bearing. If it isn't enforced in the RLS policy, one bad API handler leaks a competitor's quote.

### The one thing that must not be got wrong

Every request-scoped query goes through `withUser()`:

```ts
await withUser(user.id, async (tx) => { ... })
// internally: SELECT set_config('app.user_id', $1, true)
//                                                 ^^^^ transaction-local
```

The `true` makes the setting transaction-local. Without it, a pooled connection
carries one user's identity into the next request — a cross-tenant leak. Queries
issued outside the wrapper see **zero rows** (the policies fail closed), so a
forgotten wrapper surfaces as an empty list in development rather than a leak in
production.

If PgBouncer is used, it must be in **transaction** pooling mode.

### Vendors: claimed vs unclaimed

A planner adding "Ramesh Dhol Party — ₹18,000 — arrives 4pm" will not wait for
Ramesh to sign up. So `vendor_profiles.org_id` is nullable:

- `org_id IS NULL` — an unclaimed stub, owned and edited by the creating planner.
- A later claim flow sets `org_id`; all historical bookings, contracts and ledger
  entries stay attached.

Acceptances on stubs are stamped `acceptance_source = 'PLANNER_RECORDED'` vs
`'VENDOR_SELF'`. This is what allows the planner product to ship first and the
vendor portal to switch on later **with no migration**.

---

## 4. Architecture

```
apps/web        Next.js 15 — marketing site, planner UI, vendor UI, family UI, route handlers
                  app/(marketing)   static landing page
                  app/(planner)     dashboard — scope FULL
                  app/(vendor)      booking inbox — scope ASSIGNED_ONLY
                  app/(family)      schedule portal — scope READ_ONLY

apps/worker     headless Node + node-cron. No HTTP surface.

packages/db     Prisma client, withUser(), schema, SQL files, tests
packages/core   SQLSTATE→error translation, risk computation, brand tokens
```

**There is no separate API service.** Both UIs are browser clients of the same
Next.js app reached by route group; splitting them would buy a serialization
boundary, duplicate auth plumbing and hand-maintained wire types for nothing. More
to the point, most business rules aren't in the backend at all — they're in
Postgres. A separate API service would be a thin layer translating SQLSTATE
`23P01` into "this lawn is already booked". That's a function, not a service.

**The worker is genuinely necessary**, because five things don't fit a request cycle: date-triggered milestone activation, risk recomputation, WhatsApp/email notification retries, playbook PDF rendering, and the 6-month TTL sweep for evidence_media.

**Payments & Webhooks**: The architecture interfaces heavily with Cashfree. For RTGS/IMPS/NEFT, virtual accounts are generated. For UPI, the architecture enforces a strict native rendering rule: the API returns a Virtual UPI payload, and the Next.js client renders the QR code locally. Redirection flows are structurally unsupported to prevent context-switching failures.

**`packages/core` is why both exist safely.** Milestone activation and risk scoring
must behave identically whether triggered by a planner clicking a button or the
worker at 6am. Shared package, one implementation.

*If a native mobile app for on-ground event-day use is planned, a versioned API
becomes a real deliverable — but `packages/core` makes that extraction mechanical
later, so it isn't worth pre-building now.*

---

## 5. Data model

27 Prisma models, 44 RLS policies, 15 triggers.

```
TENANCY   organizations · users · memberships · project_grants · project_access

CRM       leads · lead_interactions · lead_stage_transitions

CORE      projects · project_days · events

VENUE     venues · venue_spaces · event_spaces · venue_rule_overrides · space_bookings

VENDOR    vendor_profiles · vendor_requirements · booking_requests
          schedule_change_proposals · change_acknowledgements

MONEY     vendor_contracts · payment_milestones · ledger_entries
          project_cash_flow

OPS       playbooks · audit_logs · evidence_media
```

Three deliberate choices worth knowing:

1. **`booking_requests.locked_scope` and `playbooks.snapshot` are denormalised
   JSON.** Both must show what was true at a moment in time. A live join would let
   a later edit silently rewrite what a vendor agreed to.

2. **Cash flow and the risk dashboard are computed, never stored.** A maintained
   risk table drifts from the data it summarises, and a stale risk dashboard is
   worse than none.

3. **`space_bookings.period` is a STORED GENERATED column** covering setup through
   teardown — see the trap in §7.

---

## 6. Current status — verified

Everything below was run, not assumed.

### Working

| | Evidence |
|---|---|
| Postgres 16.14 via docker compose | container up, host port **5433** |
| Prisma schema | `prisma validate` passes; migration applied |
| All three SQL files | applied clean against a fresh database |
| Seed data | **5 weddings, 4 structural shapes, 2 competing agencies**, one vendor working for both |
| Venue overlap prevention | 7 tests, including a real attempted double-booking |
| **Concurrency** | 5 tests on real parallel connections — 10 simultaneous bookings of one slot yield exactly one |
| **Row Level Security** | **23 tests** across planner, production, vendor, cross-agency and shared-vendor sessions |
| **Auth** | scrypt passwords, signed session cookies, login/logout, role-based landing |
| **Planner CRUD** | wedding list, creation with validation, day-by-day detail, ceremony scheduling with live conflict detection |
| **Vendor portal (read)** | booking inbox showing own bookings, locked scope and milestones |
| Risk dashboard | renders live risks for the seeded wedding |
| Worker milestone sweep | moved 4 milestones `PENDING → DUE` against real data |

```bash
npm run db:up && npm run db:setup && npm run db:seed
npm test                           # 48/48  (db, RLS, concurrency, auth, scheduling)
npm run dev                        # localhost:3000
npm run test:e2e                   # 35/35  against the running app
```

The db tests run with `--test-concurrency=1`. Node parallelises across test files
by default, and these share one database — `scheduling.test.ts` writes to the
seeded wedding that `rls.test.ts` asserts exact row counts on.

### Test data shape

| Agency | Wedding | Shape | Events |
|---|---|---|---|
| Shubh Muhurat | Mehra–Kapoor | 5-day full | 6 |
| Shubh Muhurat | Sharma–Iyer | 2-day compact | 3 |
| Shubh Muhurat | Khanna–Bose | reception only | 1 |
| Bandhan Events | Rao–Iyer | multi-city, multi-space | 3 |
| Bandhan Events | Nair–Menon | 2-day compact | 3 |

16 events, 12 spaces, 15 contracts, 45 milestones. **LensCraft Studios is engaged
by both agencies** — the case most likely to leak, and the reason cross-agency
isolation is now tested from both sides rather than against an empty shell.

### Demo accounts

Password for all: **`vivah2026`**

| Email | Role | Sees |
|---|---|---|
| `priya@shubhmuhurat.in` | Planner admin | Everything on Mehra–Kapoor |
| `arjun@shubhmuhurat.in` | Planner member | Everything on Mehra–Kapoor |
| `dev@blacklight.in` | Production company | Everything (FULL collaborator) |
| `raj@lenscraft.in` | Vendor — photography | Its own Sangeet booking only |
| `anita@saffron.in` | Vendor — catering | Its own wedding booking only |
| `sunil@bandhan.in` | Rival agency | Only its own Rao–Iyer project |

Sign in as Priya and then as Raj to see the access model working: Priya gets the
risk dashboard for all six events; Raj gets one booking, his own ₹3,20,000
contract, and no ledger at all.

**The seed is anchored to today** — the wedding starts in 10 days. Fixed calendar
dates put the wedding outside `RISK_PROXIMITY_DAYS`, so the flagship
unfulfilled-vendor risk never fired and the demo silently under-sold the product.
Re-run `npm run db:seed` to re-anchor.

The RLS suite connects as `vivahsync_app`, not the owner — running it as owner
would pass while proving nothing. It asserts on row counts from real queries
rather than on the presence of policies in `pg_policies`, and the planner/vendor
contrast is what makes it meaningful: the same tables return 6 events and a full
ledger for a planner, 1 event and zero ledger rows for a vendor.

### Enforced in the database

FR-021.1 · FR-041.1 · FR-061.1 · FR-101.1 · FR-121.1 · FR-181.1 · FR-201.1 ·
FR-221.1 · FR-261.1 · FR-541.1 · FR-2821.1 · FR-2841.1 · FR-2861.1 · FR-2881.1 ·
FR-2961.1 · FR-3181.1

These are constraints and triggers — they hold regardless of what the application
does. FR-101.1 and FR-2961.1 have direct test coverage; the rest are exercised
indirectly by the seed, which deliberately drives each one (a rejection with
rationale, an under-allocated draft contract, a locked booking, a ledger reversal).

### Application logic written

- FR-801.1 risk computation — `packages/core/src/risk.ts`
- FR-2881.1 milestone sweep — `apps/worker/src/jobs/milestoneSweep.ts`

### Not built

| Gap | Note |
|---|---|
| Signup / password reset | login works; there is no way to create an account outside the seed |
| Session revocation | tokens are stateless, so a session cannot be killed before expiry. Move to a sessions table when that matters |
| Vendor **write** actions | the booking inbox is read-only — accept/reject and change acknowledgement are not wired |
| FR-62561 prospect→project conversion | tables exist, no conversion logic |
| FR-62721 pipeline stage criteria | tables exist, no enforcement trigger |
| Vendor portal UI | schema and policies support it; no screens |
| Planner CRUD screens | only the risk dashboard skeleton exists |
| Playbook generation | schema and immutability done; no synthesis code |
| Audit log writes | table exists, nothing writes to it |

---

## 7. Traps already hit

Recorded because both would recur.

### The generated-column trap — the headline feature was silently broken

Prisma cannot express generated columns, so `prisma migrate` created
`space_bookings.period` as a plain nullable `tstzrange`. The original
`ADD COLUMN IF NOT EXISTS ... GENERATED` therefore did nothing, leaving `period`
permanently NULL.

**An `EXCLUDE` constraint over a NULL range never conflicts.** The constraint was
present in `pg_constraint` and appeared correct in every schema dump, while
enforcing nothing:

```
INSERT ... '2026-12-05 08:00' → '23:00'    INSERT 0 1
INSERT ... '2026-12-05 10:00' → '20:00'    INSERT 0 1   ← same lawn, 10h overlap
overlapping_bookings_stored: 2
```

Fixed by dropping and re-adding the column as generated. The lesson generalises:
**a test asserting "the constraint exists" would have passed against the broken
schema.** Tests must attempt the violation.

### Port 5432 was already taken

A native PostgreSQL install on the host already owned 5432 and won the race for
localhost connections, producing `P1000 authentication failed` rather than
`connection refused`. The container now maps to **5433**; the existing install was
left untouched.

Also worth knowing: **the SQL files are not re-runnable** (`CREATE TRIGGER` has no
`IF NOT EXISTS`). Reapplying means `npm run db:reset && npm run db:setup`.

### RLS policy recursion — several policies never worked at all

The first run of the RLS suite failed with `42P17 infinite recursion detected in
policy for relation "events"`. The `events` policy queried `vendor_requirements`,
whose policy queried `events`.

**Referencing a table from inside another table's policy re-applies that table's
own policy.** Any cycle takes the query down entirely. The fix is the standard
Postgres pattern, now a hard rule at the top of `002`: every cross-table lookup in
a policy goes through a `SECURITY DEFINER` helper in `001`, which runs as the
function owner and bypasses RLS. Those helpers are `STABLE`, so they evaluate once
per statement rather than once per row.

This is the second time a security control was present in the catalogue and
enforcing nothing. It is the reason the suite asserts on **row counts from real
queries**, never on `pg_policies`.

### Three identity tables had no RLS at all

`users`, `organizations` and `memberships` were never added to the `ENABLE ROW
LEVEL SECURITY` list, so any authenticated app user could read every competing
agency's org names and staff emails. Now policed: an org is visible if you're a
member or share a project grant; a user is visible to themselves and to colleagues
in their own orgs — deliberately **not** to counterparties, so a vendor cannot
enumerate a planner agency's staff.

### `withSystem()` never bypassed RLS — it only looked like it did

The original `withSystem()` reused the app-role Prisma client and documented
itself as applying "no tenant scoping". **The app role is subject to RLS**, so it
bypassed nothing. Two consequences, both silent:

- login could never find a user (`users` is unreadable without an identity), so
  every sign-in failed with "Incorrect email or password"
- the worker's milestone sweep updated **zero rows** while reporting success —
  meaning date-triggered liabilities would never become due and the cash-flow
  view would quietly under-report

Now `withSystem()` opens a **separate owner-role connection** via
`WORKER_DATABASE_URL`, and login goes through `app.auth_lookup()` — a
`SECURITY DEFINER` function returning exactly two columns for one email. That is
deliberately narrower than handing the web app a bypassing connection: a general
"system mode" is far too easy to reach for by accident.

After the fix the sweep moved 4 milestones `PENDING → DUE`, which is how the bug
was confirmed dead rather than assumed dead.

### The error translator never worked on the application path

`translateDbError` read the SQLSTATE from `err.meta.code`, which is where
`PrismaClientKnownRequestError` keeps it. But Prisma does not model constraint or
trigger failures it doesn't recognise — it raises
**`PrismaClientUnknownRequestError`** and buries the code inside the message as a
stringified Rust struct:

```
ConnectorError(... QueryError(PostgresError { code: "23514",
  message: "Ceremony \"X\" is scheduled outside the project timeline ...", ... }))
```

So `asRuleViolation` returned null for every trigger message and for the venue
exclusion constraint. **A double-booking in the UI would have shown a raw Prisma
stack trace**, not "this lawn is already booked" — the headline guarantee had no
user-facing error at all.

Invisible until now because every earlier test used raw `pg`, which reports
`err.code` directly. It only surfaced when the actual application code path was
exercised. `pgError()` now parses the struct out of the message.

Lesson worth keeping: testing a rule through a different driver than the
application uses proves the rule, not the product.

### The milestone ceiling lost a race — a financial-integrity bug

FR-2841.1 calls the contract gross an "unalterable ceiling". It was alterable.

The balance trigger validates by reading `SUM(amount)`. Under READ COMMITTED two
concurrent transactions cannot see each other's uncommitted milestones, so each
independently concluded it fit. The concurrency test drove a ₹45,000 contract to
**₹54,000, with both transactions committing successfully.**

Fixed by taking `FOR UPDATE` on the contract row inside the trigger, which
serialises milestone writes per contract and forces the second transaction to see
the first's committed rows. Sequential tests could never have found this — it
needs real parallel connections.

### Losing a booking race does not always raise `23P01`

With ten simultaneous bookings of one slot, exactly one commits — the guarantee
holds. But the losers report a *mix* of `23P01` and `40P01` (deadlock detected),
because a conflicting insert against an `EXCLUDE` constraint **waits** for the
holding transaction rather than failing immediately.

`translateDbError` only handled `23P01`, so whichever planner lost that particular
race would have seen an unhandled error instead of "this lawn is already booked".
Now `40P01`, `40001` and `55P03` map to a retryable `CONTENDED` result.

### `FOR ALL` policies double-charged every read

`FOR ALL` applies to SELECT too, so every read re-evaluated the write predicate —
visible in the plan as `has_full_access(project_id) OR has_full_access(project_id)`.
Worse, taking `project_id` as an argument made it a per-row function call, so a
scan ran one subquery per row.

Reading 16 events took **490ms**. Rewriting the policies to compare against
zero-argument `STABLE` array functions (evaluated once per statement) and scoping
write policies to INSERT/UPDATE/DELETE brought it to **5ms** — roughly 100×.

That split then removed SELECT access from `leads` entirely, because `FOR ALL`
had been covering reads implicitly and nothing failed loudly — the table just went
blank. Two guard tests now assert that every RLS table has a SELECT-capable
policy and that no `FOR ALL` policies remain.

### An engaged vendor could not see who hired it

`my_visible_org_ids()` filtered on the *viewer* holding FULL scope, so a vendor saw
exactly one organization: its own. It could not read the name of the agency that
engaged it — needed for invoicing and contact. The filter belongs on the *other*
org's scope, which also keeps co-vendors invisible to each other since they hold
ASSIGNED_ONLY.

### The test suite deadlocked itself, then wedged the database

The first `race()` helper awaited all N inserts before committing any. Nine
transactions waited on a first that could never commit. Worse, killing the node
process left the Postgres backends alive holding locks, so every subsequent run
blocked in cleanup with no visible cause.

Each connection now runs BEGIN → write → COMMIT as one chain, and both the test
and admin connections set `lock_timeout`/`statement_timeout` so a repeat fails
fast instead of hanging. If a run ever does hang, clear it with:

```sql
SELECT pg_terminate_backend(pid) FROM pg_stat_activity
 WHERE datname='vivahsync' AND pid <> pg_backend_pid();
```

### A password literal drifted between two files

`001` hardcoded the app role's password while `.env` expected a different one,
producing `28P01 password authentication failed` — which reads like a connection
problem, not a config one. `apply-sql.mjs` now parses the password out of
`DATABASE_URL` and issues an `ALTER ROLE`, so the credential has one source of
truth.

---

## 8. What to do next, in order

1. **Venue and space management** — the one gap blocking the CRUD flow from being
   usable on a *new* wedding. A project created through the UI has no venues, so
   ceremonies cannot be scheduled on it; the flow only works against seeded data.
   Then vendor requirements (FR-121.1) and the booking lifecycle (FR-181.1).

2. **Vendor write actions** — accept/reject with mandatory rationale, and
   schedule-change acknowledgement. The policies and triggers already enforce
   both; only the UI and server actions are missing.

3. **Extend constraint test coverage** to the milestone balance, booking status
   machine and commitment lock, matching the FR-101.1 pattern of attempting the
   violation.

4. **Playbook synthesis** (FR-541.1) — the only remaining piece with real domain
   logic in it.

5. **CRM conversion** (FR-62561) and pipeline stage criteria (FR-62721). The
   stage-transition guard should copy the `booking_requests` trigger in `003`.

Add an RLS test alongside every new table or policy. The suite is cheap to extend
and it has already caught four real defects, two of which were invisible to
inspection.

### Coverage this does *not* have

Honest limits, so "42/42 passing" is not read as more than it is:

- **Scale.** 5 weddings and 16 events. A busy agency runs ~40 weddings a year
  (~1,000 events). The policy rewrite makes the plans scan-friendly, but nothing
  has been measured at that volume and no index work has been done for it.
- **Concurrency breadth.** Only space bookings and the milestone ceiling are
  tested under parallelism. The booking status machine, the commitment lock and
  the financial baseline lock are all sequential-only.
- **Write paths.** Ceremony scheduling is now exercised through the real
  application code path (`scheduleEvent`), including the conflict branch. Project
  creation, and all vendor write actions, are not.

---

## 9. Risks worth tracking

**Cross-org projects invite a permissions bug that leaks financial data.** The
mitigation is item 1 above, and it is not optional.

**Full vendor accounts are a two-sided marketplace in disguise.** Planners will
adopt for the enforcement; vendors have no reason to log in unless the planners
they work with already do. The unclaimed-stub model is what prevents being blocked
on that — the planner product must stand alone on day one.

**Enforcement is the moat, but it is also the adoption risk.** A system that
refuses invalid states is only tolerable if the valid path is fast. Every block
must name what's wrong and what to do — which is why trigger messages are written
to be shown to a planner verbatim and must not be wrapped in a generic error.

---

## 10. Reference

| | |
|---|---|
| Business requirements | [Business.md](Business.md) — 24 BRs |
| Functional requirements | [Functional.md](Functional.md) — 23 MVP FRs |
| Feature list | [Feature.md](Feature.md) |
| Database notes | [packages/db/prisma/README.md](packages/db/prisma/README.md) |
| Brand | gold `#C8952C`, maroon `#7A0C1F`, paper `#F7F5F2` — from `public/Logo.jpg` |

*`public/Logo.jpg` is 2.2 MB. `next/image` optimizes it, but export an SVG or a
~100 KB PNG before launch.*
