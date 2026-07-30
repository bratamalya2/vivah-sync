# VivahSync — Build Plan (v1)

*Authored 2026-07-23. This is the actionable build plan derived from the four spec docs
([Business.md](Business.md), [Feature.md](Feature.md), [Functional.md](Functional.md),
[Project-Overview.md](Project-Overview.md)) plus the scope/stack decisions taken with the
founder. Unlike Project-Overview.md — which is written in past tense but describes software
that **does not exist on disk** — this document reflects **intent and sequencing for a
greenfield build starting from zero.***

---

## 0. Executive summary

**What v1 is:** a **public, multi-tenant SaaS** that is the operational + financial system of
record for Indian wedding-planning agencies. The product's differentiator is *enforcement* —
it refuses to store an invalid plan (no double-booked venue space, no payment plan that
doesn't total 100%, no editable ledger). That enforcement lives in PostgreSQL, which is why
the database is the core of the architecture.

**Who pays:** the planner agency (₹799/wedding, ₹5,999/month, or ₹24,999/6-months). Vendors and
(later) families use it free.

**The v1 boundary in one line:** a planner agency can **sign up, pay, and run a wedding
end-to-end** — from creating the project through scheduling ceremonies, booking vendors
(planner-recorded), tracking milestone payments in an immutable ledger, generating GST
invoices, and producing a run-sheet — **without any vendor, family member, or escrow rail
ever logging in.**

**What v1 deliberately is NOT:** it does not move money (records only), has no vendor/family
portals, no evidence media, no CRM, and no WhatsApp. Those are phase 2+.

---

## 1. Confirmed decisions (the ledger)

### Stack / infrastructure
| Area | Decision |
|---|---|
| Database + RLS | **Supabase** (cloud-hosted Postgres, **Mumbai / ap-south-1**) |
| Auth | **Supabase Auth** (gives signup, password reset, session revocation) |
| Dev environment | Cloud-hosted Supabase project — **no local DB, no Docker** |
| App + worker hosting | **Render** (Next.js web service **+** always-on node-cron background worker), Singapore |
| Data-access | **Hybrid** — `supabase-js` for auth/storage/simple reads; **Prisma / raw `pg`** for the constraint-heavy transactional core |
| RLS identity bridge | `withUser()` sets `request.jwt.claims` **transaction-locally** (`set_config(..., true)`) per request |
| Migrations | **Supabase SQL migrations are canonical DDL**; Prisma introspects (`db pull`) for typed client only |
| Worker jobs | Single always-on Render worker; pure DB sweeps may move to Supabase `pg_cron` later |

### Product / scope / money / GTM
| Area | Decision |
|---|---|
| Launch shape | **Public multi-tenant** (many independent agencies, self-serve) |
| Feature surface v1 | **Planner-facing only** |
| Pricing | ₹799/wedding · ₹5,999/month · ₹24,999/6-months **+ 18% GST on top** — planner pays, vendors free |
| SaaS fee collection | **Cashfree merchant checkout**, one-time per period + email renewal reminders (auto-debit mandates deferred) |
| DPDP posture | **Agency = Data Fiduciary; VivahSync = Data Processor** (Data Processing Agreement required); VivahSync is Fiduciary for its own users' account/billing data |
| Fund custody | **Never** — VivahSync is pure software; PG charges captured in every payment |
| Money movement v1 | **Record-only** immutable ledger (no escrow/split) |
| Obligation vs disbursement | Two distinct quantities (TDS/GST-aware) |
| Currency | INR-only v1; currency carried on the money entity (not locked per-project) |
| GST | **Principal** model; **generate GST-compliant invoices** (place-of-supply, RCM, SAC, sequential numbering) |
| Vendors v1 | Planner-recorded (`acceptance_source = PLANNER_RECORDED`) |
| Within-org RBAC | None in v1 (flat FULL scope per project) |
| Notifications | **Email only** |
| CRM | Deferred |
| Cross-org co-ownership | **IN v1** — planner + production company co-own projects from launch |

### Resolved clarifications (2026-07-23)
1. **Pricing is GST-exclusive** — ₹5,999 + 18% = ₹7,078.82 payable. Registered agencies reclaim
   the GST as input credit; VivahSync nets the full headline price.
2. **Cashfree, one-time per period** + email renewal reminders. Auto-debit mandates deferred.
3. **Cross-org co-ownership is IN v1** *(founder decision, overriding the recommendation to
   defer)*. See §10 risk 1 — this is the highest-risk RLS surface and carries the heaviest test
   burden in the plan.
4. **DPDP:** the planner agency is the Data Fiduciary; VivahSync is a Data Processor acting on
   its instruction under a DPA. VivahSync remains Fiduciary for its own users' account/billing data.

5. **Co-owned project billing: owner pays, collaborators ride free.** The owning planner's
   subscription (or ₹799 per-wedding fee) covers the project for every collaborator; a
   production company granted FULL scope needs no plan of its own. Entitlement checks therefore
   hang off `projects.owner_org_id` alone — no reconciling two orgs' billing states on a read.
   *(A paid collaborator tier is a future pricing experiment, not a v1 architecture change.)*

### Still open
- *(nothing blocking — all v1 scope decisions are locked)*

---

## 2. In-scope vs deferred (mapped to requirements)

### v1 — IN
| Capability | FR / BR |
|---|---|
| Self-serve signup + agency (org) onboarding | *(new — "not built" in overview)* |
| Platform billing: 3 plans, entitlement gating, Cashfree collection, renewal, VivahSync→planner GST invoice | *(new)* |
| Multi-tenant isolation (RLS) across many agencies | BR access model |
| **Cross-org co-ownership** — `project_grants`, `PRODUCTION` org type, FULL collaborators | BR access model |
| Project profile (mandatory fields) | FR-001.1 / BR-001 |
| Multi-day chronological structure | FR-021.1 / BR-021 |
| Ceremony/event definition (**+ per-event guest count, setup/teardown**) | FR-041.1 / BR-041 |
| Venue baseline rules + per-event overrides (audited) | FR-061.1 / BR-061 |
| Venue sub-spaces + capacity + **legal-max ceiling** | FR-081.1 / BR-081 |
| Space overlap prevention (EXCLUDE gist, setup→teardown) | FR-101.1 / BR-101 |
| Vendor requirement definition (category, scope, arrival/completion) | FR-121.1 / BR-121 |
| Booking-request status machine (transition-guarded) | FR-181.1 / BR-181 |
| Commitment lock + timestamp (locked-scope snapshot) | FR-201.1 / BR-201 |
| Rejection rationale → requirement "Unfulfilled" | FR-221.1 / BR-221 |
| Schedule-change impact + **planner-recorded** acknowledgement | FR-261.1 / BR-261 |
| Financial baseline setup + lock | FR-2821.1 / BR-2821 |
| Vendor commercial terms + gross ceiling | FR-2841.1 / BR-2841 |
| Milestone plan, exact-100% balance enforcement | FR-2861.1 / BR-2861 |
| Milestone triggers (date / event-based) | FR-2881.1 / BR-2881 |
| Immutable append-only ledger + reversals | FR-2961.1 / BR-2961 |
| Daily cash-flow (computed) | FR-3181.1 / BR-3181 |
| **GST invoicing** (principal; planner→client + vendor-invoice capture for ITC) | BR-2821/2841 extended |
| Risk dashboard (computed) | FR-801.1 / BR-801 |
| Playbook synthesis + versioning (in-app; family projection prepared) | FR-541.1 / BR-541 |
| Audit log writes (trigger-based) | FR-061.1 AC, BR-201 |
| Email notifications (milestone due, risk, booking) | *(BR-561/221/261 email-only subset)* |

### v1 — OUT (phase 2+)
Cashfree escrow/split/UPI (BR-2901 / FR-2901.1/.2) · family portal (BR-561 / FR-561.1) ·
evidence media + 6-month TTL (BR-581 / FR-581.1/.2) · vendor self-service portal & write
actions · CRM leads/pipeline/conversion (BR-621xx / FR-627xx) · WhatsApp/SMS (Meta + BSP +
TRAI DLT) · within-org admin/member/finance RBAC · VENUE_CHAIN org semantics · native mobile /
PWA offline capture · subscription auto-debit mandates.

---

## 3. Contradictions in the specs, and how v1 resolves them

These are the material tensions the requirement docs never reconcile. Each is a decision baked
into this plan.

1. **"Escrow" is not escrow.** Cashfree Easy Split is an RBI Payment-Aggregator rail; it cannot
   *hold* a milestone for months, and it can only pay KYC'd, claimed vendors — but v1 vendors
   are unclaimed stubs. → **v1 records payments only; escrow is phase 2 and, when built, is
   "collect-per-milestone," not "hold."**
2. **The double-booking guarantee is intra-agency only.** Venues are per-agency rows, so two
   agencies' copies of "Taj Lawn" are different `venue_spaces` and the EXCLUDE constraint can't
   see across them. → **v1 markets the guarantee honestly as "within your own projects."**
   Cross-agency prevention needs the VENUE_CHAIN model (phase 2).
3. **Capacity was a soft override past the fire limit.** → **v1 adds a hard `legal_max` ceiling
   that can never be acknowledged past; a soft warning band sits below it.**
4. **Per-event guest count didn't exist** (only project-level scale), making capacity checks
   wrong for every wedding with differently-sized ceremonies. → **v1 adds
   `events.expected_guest_count`.**
5. **Setup/teardown buffers had no home**, so the EXCLUDE window was silently only
   event-start→end (the same class of silent under-protection as the overview's NULL-range
   trap). → **v1 adds explicit `setup_minutes` / `teardown_minutes`; `period` is generated from
   them; intra-day space reuse (morning Haldi → evening Sangeet) is supported.**
6. **Obligation ≠ disbursement.** TDS/GST make actual payouts differ from the 100% contract
   gross. → **modelled as two quantities; milestones total 100% of *obligation*; disbursement
   reconciles separately.**
7. **Risk "computed never stored" vs a worker that "recomputes + notifies."** → **compute-on-read
   for display; a minimal notification-ledger persists "last notified" so emails don't
   re-fire.**
8. **Immutable-forever vs DPDP erasure.** → **"immutable" = immutable *financial* rows (statutory
   retention) + *shreddable* PII (tombstone / crypto-shred) for erasure requests.** Consent
   captured at data entry.
9. **FR-581.2 "exactly 180 days" vs "6 calendar months," and auto-purge during live disputes.**
   → moot in v1 (evidence deferred); when built, retention stated as "180 days from upload,
   excluding legal-hold and backup windows."

---

## 4. Architecture (with v1 decisions applied)

```
DEV
  Cloud Supabase project (Mumbai)  ← no local DB, no Docker
  Next.js dev server → Supabase (transaction pooler)

PROD (Render, Singapore)
  ┌─ Web service:  Next.js 15  (planner UI + route handlers + Cashfree/webhook endpoints)
  └─ Worker:       node-cron    (milestone sweep, cash-flow/risk recompute cache,
                                 email notification retries, renewal reminders)
        │  app path → Supavisor transaction pooler (6543), RLS-scoped
        │  worker/webhook privileged path → service_role via narrow SECURITY DEFINER RPCs
        ▼
  Supabase (Mumbai)
    ├─ Postgres 16 — RLS · EXCLUDE gist overlap · triggers · generated columns · SECURITY DEFINER helpers
    ├─ Supabase Auth — auth.uid() bridged into RLS via request.jwt.claims (txn-local)
    └─ Supabase Storage — (reserved for phase-2 evidence media)

  External: Cashfree (SaaS-fee merchant collection) · transactional email (e.g. Resend/SES)
```

### Monorepo layout
```
apps/web        Next.js 15 — marketing + planner app + route handlers (incl. Cashfree webhook)
apps/worker     node-cron — no HTTP surface
packages/db     Prisma client, withUser(), SQL migrations, RLS + constraint tests
packages/core   SQLSTATE→error translation, risk computation, GST/tax engine, brand tokens
```

### The RLS model on Supabase (the load-bearing part)
- **Identity:** Supabase Auth issues the JWT. The app opens a Prisma/`pg` transaction, sets
  `request.jwt.claims` (containing `sub` = user id) transaction-locally, runs queries, commits.
  Queries outside `withUser()` see **zero rows** (fail closed).
- **Two roles:** the app connects as an RLS-subject role; the **worker + webhook** use
  `service_role` (RLS-bypass) **only through narrow SECURITY DEFINER RPCs** — the RLS-bypass
  credential never reaches the public web tier broadly.
- **`project_access`** is the flattened membership⋈grant table, maintained by triggers, read by
  every policy. **Application code never writes it.**
- **Cross-table policy lookups go through `STABLE SECURITY DEFINER` helpers** to avoid the
  policy-recursion trap and the per-row performance trap (evaluate once per statement).
- **Every RLS table has a SELECT-capable policy; no `FOR ALL` policies** (the overview proved
  both failure modes). Tests assert on **row counts from real queries** as `authenticated`, not
  on `pg_policies`.

---

## 5. Data model — deltas from the overview's 27 models

**Removed / changed**
- Custom scrypt auth tables & session cookies → **Supabase Auth** (`users` becomes a profile
  table keyed to `auth.users.id`).
- `withUser()` GUC `app.user_id` → `request.jwt.claims`.
- `withSystem()` owner connection → Supabase `service_role` + SECURITY DEFINER RPCs.

**New clusters for v1**
```
BILLING     plans · subscriptions · subscription_invoices · entitlements
            (how VivahSync earns — absent from all 27 original models)

TAX/INVOICE org_tax_profiles(GSTIN, state, invoice series) · invoices ·
            invoice_line_items · tax_lines   (principal-model GST invoicing)
```
**New / changed fields**
- `events.expected_guest_count` (new) · `events.setup_minutes` / `teardown_minutes` (new)
- `venue_spaces.legal_max_capacity` (new, hard ceiling) + `comfort_capacity`
- `vendor_requirements.fulfillment_status` (Unfulfilled / Fulfilled / Replacement-Needed)
- `ledger_entries`: add `currency`, `pg_charge_amount`, `entry_kind` (settled vs asserted),
  `reversal_of`
- `payment_milestones`: obligation-% vs disbursement fields; canonical rounding rule (last
  milestone absorbs residue)
- PII tables: `consent_basis`, `consent_at`; erasure via tombstone/shred key
- `audit_logs`: actually written by triggers (actor = `request.jwt.claims.sub`, or a system
  actor for worker actions)

---

## 6. GST & invoicing (principal model — "as extensive as possible")

Two invoice contexts, both GST-compliant:

**A. VivahSync → Planner (SaaS fee).** VivahSync's own GSTIN; 18% GST on the subscription/
per-wedding fee; SAC for online information/SaaS services; place-of-supply = planner's state
(intra-state → CGST+SGST, inter-state → IGST); sequential invoice series; planner's GSTIN
captured so they can claim ITC.

**B. Planner → Client (wedding package).** Principal model: the planner invoices the client for
the **whole package**; GST charged on the package; the planner claims **input tax credit** on
GST-registered vendors' invoices. Requires per-agency: GSTIN, invoice number series, letterhead.

**Engine requirements**
- Place-of-supply logic (CGST/SGST vs IGST) — multi-city weddings are multi-state.
- Registered vs **unregistered vendor → reverse charge (RCM)** handling.
- SAC codes, HSN where relevant, sequential per-org numbering, no gaps.
- Rounding + tax-inclusive/exclusive handling consistent with the obligation/disbursement split.
- `FR-2821.1` tax lock: currency + GST treatment freeze on the project's first financial
  transaction.

> **Phasing note:** invoice *generation* with correct place-of-supply, GSTIN, SAC and numbering
> is v1. Deep **ITC reconciliation** and automated GSTR filing exports are a fast-follow within
> the GST milestone if time-boxed pressure appears — flagged, not silently cut.

---

## 7. The enforcement core (constraints/triggers that ARE the product)

Each must be tested by **attempting the violation** (not by asserting the object exists — the
overview was burned three times by controls that were present but enforcing nothing):

- `EXCLUDE USING gist (space_id WITH =, period WITH &&)` on `space_bookings` — `period` is a
  **STORED GENERATED** column spanning setup→teardown. *(Verify it is generated, not nullable.)*
- Deferrable constraint trigger: milestones sum **exactly 100%** of contract obligation, with
  `FOR UPDATE` on the contract row (serialize per-contract writes — the overview's ₹45k→₹54k race).
- Append-only ledger: `REVOKE UPDATE, DELETE` + trigger; corrections are compensating reversals.
- Financial-baseline lock trigger on first ledger insert (currency + GST treatment).
- Booking-status transition-guard trigger (rigidly sequential; Accepted→Confirmed).
- Commitment lock: `jsonb` locked-scope snapshot + immutable timestamp on Accepted.
- RLS policies (fail-closed) + `project_access` maintenance triggers.
- Error translation: SQLSTATE `23P01` / `40P01` / `40001` / `55P03` → readable planner messages
  (parse Prisma's `PrismaClientUnknownRequestError` struct — the overview's translator bug).

---

## 8. Non-functionals for a public launch

- **Tenant isolation** hardened across strangers; RLS test suite runs as `authenticated` against
  a Supabase branch in CI (no Docker needed).
- **DPDP Act 2023:** consent capture at data entry; data-principal access/erasure via
  tombstone/shred; breach-notification + grievance-officer posture; decide fiduciary (open #4).
- **GST compliance** on both invoice contexts (§6).
- **Backups/DR:** Supabase PITR enabled; financial ledger effectively needs near-zero RPO.
- **Availability:** weddings are live event-day systems — target no planned downtime on active
  event dates; Indian wedding load is **muhurat-clustered/bursty**, so size for same-date peaks,
  not the annual average.
- **INR formatting** everywhere (`Intl.NumberFormat('en-IN')` → ₹3,20,000, not 320,000).
- **Observability** on worker jobs (they are the silent-failure surface — the overview's
  `withSystem` sweep reported success while updating zero rows).
- **Accessibility:** define a text-safe token — brand gold `#C8952C` on paper `#F7F5F2` is ~2.5:1
  and fails WCAG AA for text.
- **Email deliverability:** transactional provider + SPF/DKIM/DMARC.

---

## 9. Phased roadmap

### Phase 0 — Foundations
Monorepo scaffold · Supabase project (Mumbai) + roles + `btree_gist`/`pg_trgm` + Supavisor
transaction pooler · Supabase Auth wired · `withUser()` JWT-claims bridge · Supabase-SQL
migration pipeline + Prisma `db pull` · Render web + worker + secrets · CI against a Supabase
branch · the RLS/constraint **test harness** (attempt-the-violation pattern) with a first real
write path.

### Phase 1 — v1 (public multi-tenant launch)
- **M1 Tenancy · Auth · Onboarding** — orgs (incl. `PRODUCTION`), memberships, **`project_grants`
  + cross-org co-ownership**, `project_access` triggers, RLS core, self-serve signup + agency
  creation + teammate invite, audited platform-admin seam. **Ships with the full cross-org RLS
  test matrix** (competing agencies · shared vendor engaged by both · production company with
  FULL scope on another org's project) — attempt-the-violation, asserted on row counts.
- **M2 Platform billing** — plans, subscriptions/entitlements, Cashfree merchant collection
  (+18% GST), entitlement gating on wedding creation, **co-owned-project billing rule (owner
  pays, collaborators ride free)**, email renewal reminders, VivahSync→planner GST invoice.
- **M3 Core operations** — projects, days (generated), events (guest count + buffers), venues,
  spaces (capacity + legal_max), event_spaces, space_bookings (generated `period` + EXCLUDE),
  rule overrides (audited); **live conflict detection through the real UI write path** (closes
  the overview's "only works on seeded data" gap).
- **M4 Vendors** — vendor_profiles (unclaimed stubs), requirements (+ fulfillment state),
  booking_requests (transition-guard trigger), commitment lock, rejection→Unfulfilled,
  schedule-change proposals + planner-recorded acknowledgement.
- **M5 Money & GST** — contracts (gross ceiling), milestones (100% balance, obligation vs
  disbursement, date/event triggers), ledger (append-only + reversal), cash-flow (computed),
  GST engine + planner→client invoicing + vendor-invoice capture for ITC.
- **M6 Ops & polish** — risk dashboard (computed), playbook synthesis + versioning (in-app,
  family projection prepared), audit_logs writes, email notifications, en-IN formatting,
  observability, DPDP consent/erasure, PITR/backup verification, accessibility pass.

### Phase 2+ (deferred)
Cashfree escrow/split/UPI · family portal · evidence media + TTL · vendor self-service portal +
write actions · CRM (leads/pipeline/conversion) · WhatsApp/SMS (Meta + BSP + DLT) · within-org
RBAC · cross-org co-ownership · VENUE_CHAIN · native/PWA offline capture · subscription mandates.

---

## 10. Top risks to track

1. **Public multi-tenant *plus* cross-org co-ownership from day one** is the single largest risk
   in v1 — it is the overview's own #1 named risk ("cross-org projects invite a permissions bug
   that leaks financial data"), and the founder has chosen to carry it at launch rather than
   defer it. A single over-broad RLS predicate leaks a competitor agency's quotes or ledger.
   Mitigation: `project_access` is the only thing policies read; every cross-table lookup goes
   through `STABLE SECURITY DEFINER` helpers; attempt-the-violation RLS tests on **every** table
   asserted on row counts as `authenticated`; and a standing test fixture of two competing
   agencies sharing one vendor, plus a production-company collaborator, mirroring the hardest
   real case. No new table ships without an accompanying RLS test.
2. **GST "as extensive as possible" is a large subsystem** (two invoice contexts, place-of-supply,
   RCM, sequential numbering). Time-box ITC-reconciliation depth; keep invoice generation core.
3. **Supabase pooler + transaction-local `set_config`** must be validated in transaction mode
   before RLS is trusted (fail-open risk if it session-pins). Verify in Phase 0.
4. **Prisma silently reverting generated columns / EXCLUDE / RLS** on any DDL it owns.
   Mitigation: Supabase SQL migrations own ALL DDL; Prisma is introspect-only.
5. **Seasonal/bursty muhurat load** unmodelled; computed cash-flow/risk are the first to degrade.
   Add indexes + a light recompute cache before launch marketing.
6. **Billing correctness** (entitlement gating, GST on your own fee, renewal) is real money-in
   from day one — treat it with the same rigor as the domain ledger.

---

*Living document — update as decisions change. Related planning context is also kept in the
assistant's project memory (stack, project-nature, v1-scope).*
