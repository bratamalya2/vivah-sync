# VivahSync — Product Specification

*The complete feature catalogue: what is built, what is planned, and the business
logic behind each. Companion to [Project-Overview.md](Project-Overview.md), which
covers engineering state and verified test results.*

*Last updated: 21 July 2026.*

---

## 1. What the product is

**An operational system of record for Indian wedding planning agencies.**

A multi-day Indian wedding is a 3–7 day, multi-venue, 20–40 vendor operation run
today over WhatsApp, spreadsheets and cash. VivahSync replaces that with a single
system — but its defining property is not storage, it is **enforcement**:

> Most tools store your plan. VivahSync refuses to store an invalid one.

A venue cannot be double-booked. A payment plan that doesn't total the contract
cannot be activated. A ledger entry cannot be edited. These are not warnings the
software shows after the fact — they are states the database physically cannot
hold. That guarantee is the product, and every feature below either creates one of
those guarantees or makes it visible.

### Status legend

| | Meaning |
|---|---|
| ✅ **Live** | Full write path and UI, verified by tests |
| 🟡 **Read-only** | Data and display exist; no write interface yet |
| 🔒 **Enforced, no UI** | Database rules active; no screen drives them |
| ⭕ **Planned** | Not yet built |

---

## 2. Who uses it — tenants and what each sees

Access is **organization + per-project grant** based, not a single tenant column,
because a wedding can be co-owned by several businesses. Every tenant's view is
bounded by Row-Level Security, so each dashboard is structurally a different
product — a vendor's screen *cannot* leak a competitor's pricing.

| Tenant | Type | Scope | What they see |
|---|---|---|---|
| **Wedding planning agency** | `PLANNER` | FULL | Everything on the weddings they own. The paying customer. |
| **Production company** | `PRODUCTION` | FULL | Only the weddings they're invited onto, as a collaborator. |
| **Vendor** | `VENDOR` | ASSIGNED_ONLY | Only their own bookings, the events those touch, and their own money. |
| **Venue chain** | `VENUE_CHAIN` | — | Modelled, not yet activated. |
| **Client (wedding family)** | — | — | Not a user yet. Planned read-only portal. |

**Vendors are a network, not tenants.** A vendor can be engaged by several
competing agencies from one account and stays isolated between them. A vendor
record can also exist as an **unclaimed stub** — created by a planner before the
vendor has signed up — and be claimed later without losing any history. This is
what lets the planner product ship without waiting for vendor adoption.

---

## 3. Feature catalogue

### 3.1 Sales & CRM

The funnel that feeds operations. A qualified lead becomes a wedding project
without re-entering anything.

| Feature | Trace | Status |
|---|---|---|
| Lead capture | FR-62141.1 / BR-62141 | 🟡 Read-only |
| Interaction logging | FR-62281.1 / BR-62281 | 🟡 Read-only |
| Pipeline board | FR-62721.1 / BR-62721 | 🟡 Read-only |
| Prospect → project conversion | FR-62561.1 / BR-62561 | ⭕ Planned |

**Lead capture** records source (call / website / referral / partner), contact,
city, wedding date window, and estimated budget — the fields needed to qualify a
lead before pursuing it.
*Business logic:* mandatory qualification fields prevent non-viable leads (wrong
city, no budget) entering the funnel.

**Interaction logging** keeps an append-only audit trail of every touch —
call / WhatsApp / email / meeting — with timestamp and outcome.
*Business logic:* interactions and stage transitions are **immutable** (the app
role has no UPDATE/DELETE grant). Sales history cannot be quietly rewritten, which
preserves institutional memory if a salesperson leaves.

**Pipeline board** shows leads by stage (New → Contacted → Qualified → Proposal →
Negotiation → Won / Lost) with lead value and last interaction.
*Business logic (planned):* stage progression will be gated by entry criteria — a
lead cannot move to "Proposal" without an attached proposal — to stop pipeline
inflation. The guard reuses the same trigger pattern as vendor booking status.

**Prospect → project conversion (planned)** will turn a won lead into a live
wedding project, carrying over contact, dates, budget and the full conversation
history, with zero re-entry. If the lead is missing a field the project requires,
conversion pauses and asks for it.

---

### 3.2 Project setup

| Feature | Trace | Status |
|---|---|---|
| Wedding profile creation | FR-001.1 / BR-001 | ✅ Live |
| Day-by-day structure | FR-021.1 / BR-021 | ✅ Live |
| Financial baseline | FR-2821.1 / BR-2821 | ✅ Live (auto) |

**Wedding profile** captures client identity, dates, city, guest count and owning
agency at creation.
*Business logic:* all core fields are mandatory — a wedding cannot exist half-
defined. The database enforces `end_date >= start_date`.

**Day-by-day structure** is generated automatically from the date range: one
container per calendar day, each holding that day's ceremonies.
*Business logic:* generated by a database trigger, not application code, so it
**cannot be skipped** by any path (UI, import, API) — a project can never exist
without its days. Extending the dates adds days; shrinking them is refused while a
stranded day still holds a ceremony, because deleting the day would silently
cascade to its events.

**Financial baseline** sets the project currency (default INR) and tax treatment
(default GST 18%).
*Business logic:* these **lock permanently the moment the first financial
transaction is recorded** — you cannot change currency after money has moved, or
the ledger would be internally inconsistent. Enforced by a trigger on the first
ledger insert.

---

### 3.3 Venues & spaces

| Feature | Trace | Status |
|---|---|---|
| Venue & space management | FR-061.1 / BR-061 | ✅ Live |
| Sub-space capacity tracking | FR-081.1 / BR-081 | ✅ Live |
| Space conflict prevention | FR-101.1 / BR-101 | ✅ Live |
| Per-event rule overrides | FR-061.1 / BR-061 | 🔒 Enforced, no UI |

**Venue & space management** captures a venue with its functional spaces
(ballroom, lawn, terrace), each with a capacity, plus baseline rules (noise
curfew, vendor access time) and a contact.
*Business logic:* a venue must have at least one space — a venue that can't host a
ceremony is not a usable record. Baseline rules apply to every ceremony there
unless explicitly overridden.

**Capacity tracking** compares a ceremony's expected guests against the aggregate
capacity of its assigned space(s).
*Business logic:* over-capacity is a **flag, not a hard block** — it warns and
prevents the run-sheet from being issued until acknowledged, but doesn't stop the
save, because a planner sometimes knowingly runs tight. A ceremony may span
adjoining spaces, and capacity sums across them.

**Space conflict prevention** — the headline guarantee. Two ceremonies cannot
occupy the same space at overlapping times.
*Business logic:* enforced by a Postgres exclusion constraint over the full
setup-to-teardown window (setup and teardown are exclusive-use time, per BR-101).
The database **physically cannot store the collision** — this is not an
application check that could lose a race when two planners save at once. When a
booking is refused, the UI names the conflicting ceremony and its window, not just
"conflict".

**Per-event rule overrides (enforced, no UI)** let a specific ceremony deviate
from a venue's baseline rule — e.g. music past the curfew — with a mandatory
documented rationale.
*Business logic:* the override is refused without a written reason, and every
override is logged (who, when). The schema and its constraints exist; the screen
does not yet.

---

### 3.4 Vendor procurement

The negotiation lifecycle, from defining a requirement to a locked commitment.

| Feature | Trace | Status |
|---|---|---|
| Requirement definition | FR-121.1 / BR-121 | ✅ Live |
| Booking status lifecycle | FR-181.1 / BR-181 | ✅ Live |
| Commitment locking | FR-201.1 / BR-201 | ✅ Live |
| Rejection handling | FR-221.1 / BR-221 | ✅ Live |
| Vendor self-service accept/decline | FR-181.1 / FR-221.1 | ✅ Live |
| Schedule-change acknowledgement | FR-261.1 / BR-261 | 🔒 Enforced, no UI |

**Requirement definition** captures what's expected of a vendor: category, scope
of work, required arrival and completion times.
*Business logic:* arrival must precede completion (a chronologically impossible
requirement is refused).

**Booking status lifecycle** moves a request through Draft → Sent → Accepted →
Confirmed, with Rejected and Cancelled as terminal states.
*Business logic:* transitions are **rigidly sequential** — a request cannot jump
from Sent to Confirmed, skipping acceptance. Enforced by a trigger; the UI only
offers the moves the database will accept.

**Commitment locking** — on acceptance, the vendor's scope and timings are frozen
with an immutable timestamp.
*Business logic:* acceptance captures a **JSON snapshot** of what was agreed. Later
edits to the requirement do not rewrite that snapshot — the vendor is held to what
they actually accepted, not to a subsequently-changed version. Modifying a locked
commitment requires a formal exception (a schedule-change proposal).

**Rejection handling** — a declined booking demands a reason and immediately
flags the requirement as needing a replacement.
*Business logic:* a rejection is refused without a rationale, and the underlying
requirement automatically transitions to REPLACEMENT_NEEDED so a gap can never sit
dormant and invisible.

**Vendor self-service** — vendors accept or decline from their own inbox. Copy
states plainly that accepting locks the scope. An unclaimed vendor's acceptance is
recorded by the planner and stamped `PLANNER_RECORDED`; a self-service one is
stamped `VENDOR_SELF`, preserving the audit distinction.

**Schedule-change acknowledgement (enforced, no UI)** — when a locked event's
schedule changes, every impacted vendor must acknowledge before it takes effect.
*Business logic:* the proposed change is held in a provisional state; the original
schedule stays live until all impacted vendors acknowledge. A trigger refuses to
apply the change while any acknowledgement is outstanding. The rule is enforced
and the dashboard flags stalled proposals — the proposal-creation screen is the
gap.

---

### 3.5 Money

| Feature | Trace | Status |
|---|---|---|
| Commercial terms | FR-2841.1 / BR-2841 | ✅ Live |
| Milestone builder | FR-2861.1 / BR-2861 | ✅ Live |
| Milestone triggers | FR-2881.1 / BR-2881 | ✅ Live |
| Payment ledger | FR-2961.1 / BR-2961 | ✅ Live |
| Daily cash flow | FR-3181.1 / BR-3181 | ✅ Live |

**Commercial terms** record a vendor's gross amount, tax treatment and allowed
payment methods on a confirmed booking.
*Business logic:* the gross becomes the **unalterable ceiling** — no set of
milestones may exceed it.

**Milestone builder** splits payment into progressive stages (advance, pre-event,
on-day, post-event), shown with a **live running variance** — the total, the
target, and the difference update as you type.
*Business logic:* the milestones must total the contract **exactly** before it can
be activated. A draft may be under-allocated (mid-negotiation), but "activate"
only unlocks at 100%. Enforced by a deferred constraint that checks the sum at
commit — and it holds even under two planners editing the same contract
concurrently.

**Milestone triggers** bind each milestone to a release condition: a fixed date or
a specific operational event.
*Business logic:* a milestone with no trigger is refused — every payment must have
an objective, verifiable reason to become due.

**Payment ledger** records every transaction: amount, time, method
(cash / bank / UPI / card / cheque), and payer.
*Business logic:* the ledger is **append-only**. Committed entries cannot be
edited or deleted — a correction is a *reversing entry* (the exact negative,
built by the system so the sign can't be wrong), never an edit. A reversal cannot
itself be reversed. This is what makes on-site cash handling auditable months
later.

**Daily cash flow** shows inflows against actual and projected outflows, day by
day across the wedding.
*Business logic:* a **computed view, never a stored table**, so it can never drift
from the ledger it summarises. It cleanly separates actual movements from
projected liabilities and highlights any day that goes negative — the liquidity
crisis BR-3181 exists to prevent.

---

### 3.6 Operations

| Feature | Trace | Status |
|---|---|---|
| Risk dashboard | FR-801.1 / BR-801 | ✅ Live |
| Run-sheet (live) | FR-541.1 / BR-541 | 🟡 Read-only |
| Versioned playbook | FR-541.1 / BR-541 | ⭕ Planned |

**Risk dashboard** surfaces prioritised operational risks: unfulfilled vendors on
approaching events, capacity overages, and stalled schedule changes.
*Business logic:* computed live from current data (never a maintained table, which
would go stale). Severity escalates as the event approaches — an unsourced vendor
3 days out is CRITICAL, 14 days out is MEDIUM. The proximity threshold is
configurable.

**Run-sheet** assembles the day's chronological flow — setup → vendor arrivals →
ceremony → teardown — with venue and vendor contacts inline.
*Business logic:* currently a **live view**, explicitly labelled as such, and it
flags any unfinalised schedule change that would make it provisional.

**Versioned playbook (planned)** will turn that live view into a **generated,
immutable, versioned document** stamped with a version number and timestamp — the
actual FR-541.1 deliverable. A playbook must reflect an exact approved moment, so
generation freezes a snapshot rather than following later edits.

---

## 4. Platform & business expansion (planned)

Beyond the operational core, three assets the current design has quietly created —
the vendor graph, the milestone/ledger engine, and the cross-org access model —
unlock a platform. These are strategic, sequenced deliberately.

### 4.1 Escrow & payments — ⭕ Planned (the priority bet)

Client funds a milestone; money is released on the trigger the system already
tracks. This directly solves the trust problem the ledger models, and — critically
— gives vendors their first real reason to claim an account (get paid on delivery,
guaranteed), which bootstraps the network.

*Business logic / structure:* VivahSync does **not** custody funds. A regulated
partner (payment aggregator or bank escrow) holds the money in an RBI-compliant
escrow; VivahSync owns the *orchestration* — the milestone triggers decide when to
release, and the append-only ledger mirrors what the partner reports back via
webhook. Custody, KYC and licensing stay with the partner; the plan, the triggers
and the record stay with VivahSync. This maps exactly onto the existing
`payment_milestones` and `ledger_entries` boundary. *(A current account is
insufficient and legally risky — third-party pooled funds must be ring-fenced.)*

### 4.2 Tenant dashboards — ⭕ Planned

Rich, RLS-bounded dashboards per tenant. In priority order:

- **Agency cash cockpit** — aggregate receivables, payables and the daily net
  liquidity curve **across all of an agency's weddings**, not one at a time. The
  highest-value view a paying planner currently lacks. Rolls up the existing
  `project_cash_flow` view.
- **Vendor commitment & payment dashboard** — a vendor's unified calendar of
  on-site commitments across every agency, availability/double-commit guard, and
  own payment status (with escrow: held / released). Novel because only VivahSync
  can aggregate a vendor across agencies.
- **Portfolio operations** — every active wedding triaged by risk and days-out.
- **Owner / exec view** — revenue, margin (contracted vendor cost vs client
  budget), pipeline forecast, win rate, vendor spend.
- **Venue-chain occupancy** — space utilisation, upcoming load, revenue per space.
  The reason to activate the `VENUE_CHAIN` tenant.
- **Client portal** — read-only schedule, run-sheet and payment status; with
  escrow, "your funds are held safely and released on delivery".

*Business logic:* all dashboards are **computed views, never maintained tables** —
same discipline as the cash-flow and risk engines — so no number can drift from
its source of truth.

### 4.3 Vendor marketplace — ⭕ Planned (after escrow)

Once vendors have accounts, the cross-agency vendor graph becomes a searchable,
relevance-ranked marketplace: discovery by real cost / reliability / availability,
plus inbound lead-gen to vendors. *Business logic:* this is the one genuine
full-text-search case (relevance ranking over a cross-tenant corpus). It must
follow escrow — a marketplace with no vendor liquidity is a dead directory.

### 4.4 Intelligence & benchmarking — ⭕ Planned

The accumulating operational + financial data is a moat no competitor has:
benchmarking ("your caterer is 22% above the Delhi 500-pax median"), a
data-grounded planning copilot that drafts day structures and suggests vendors,
and demand/pricing forecasts by city and season.

### 4.5 Communication & field ops — ⭕ Planned

- **WhatsApp automation** — this industry runs on WhatsApp. Automated vendor
  requests and change-acknowledgements via a BSP (the integration is stubbed).
- **Mobile PWA for event-day** — the run-sheet with live vendor check-ins, where
  daily on-ground usage lives.

---

## 5. Cross-cutting business rules

The invariants that hold across every feature — the "refuses to store an invalid
state" guarantees, in one place.

| Invariant | Where |
|---|---|
| A venue space cannot be double-booked (setup→teardown) | Exclusion constraint |
| A ceremony must fall within the project timeline | Trigger |
| A project always has its full day structure | Trigger, un-skippable |
| Financial baseline (currency/tax) locks on first transaction | Trigger |
| Vendor booking status is strictly sequential | Trigger |
| An accepted scope is frozen as an immutable snapshot | Trigger + JSON |
| A rejection requires a rationale and reopens the requirement | Constraint + trigger |
| A schedule change needs all impacted vendors to acknowledge | Trigger |
| Milestones cannot exceed the contract, and must total it to activate | Deferred constraints |
| Every milestone has an objective release trigger | Constraint |
| The ledger is append-only; corrections are reversing entries | Revoke + trigger |
| Cash flow and risk are computed, never stored | Views / functions |
| Sales interactions are immutable | Revoke |
| Every tenant sees only what its scope permits | Row-Level Security |

**The through-line:** business rules live in the database, not the application, so
they hold regardless of which client, API or import touches the data. The
application's job is to make those rules *visible and pleasant* — to show a
conflict by name, a variance as you type, a risk before it bites — never to be the
thing that enforces them.

---

## 6. Implementation status at a glance

**Live end-to-end (15 FRs):** wedding creation, day structure, ceremonies,
capacity, conflict prevention, vendor requirements, booking lifecycle, commitment
lock, rejection, vendor self-service, commercial terms, milestone builder,
milestone triggers, payment ledger, cash flow, risk dashboard.

**Enforced in the database, UI pending (3):** per-event venue overrides (FR-061.1),
schedule-change acknowledgement (FR-261.1), versioned playbook synthesis
(FR-541.1).

**Data model + read-only view (3):** lead capture, interaction logging, pipeline
board (FR-62141/62281/62721).

**Not yet built (1 core + platform):** prospect→project conversion (FR-62561), plus
the platform layer — escrow, dashboards, marketplace, intelligence, field ops.

*Verified by 74 database/integration tests and 74 end-to-end checks against the
running application. See [Project-Overview.md](Project-Overview.md) for the
engineering detail and the defects found along the way.*
