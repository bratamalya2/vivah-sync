# VivahSync — Feature Reality Check

*Last verified: 26 September 2026 against the application code, 20 Supabase migrations, 21 database test files, and the current demo seed.*

## Status legend

- **Shipped** — implemented through the web UI and data layer, with the important rules enforced in PostgreSQL.
- **Partial** — a useful slice works, but the stated feature is not complete.
- **Not implemented** — no working product flow exists. A schema field or comment alone does not count.
- **Removed** — dropped from scope; listed only for traceability.

## Accurate picture

VivahSync is currently a working **wedding-operations MVP**, not yet a complete agency ERP or payments platform. Its strongest, end-to-end areas are schedule integrity, vendor commitments, operational playbooks, guest hospitality, and a guarded financial ledger.

The application supports planner signup and onboarding, wedding creation from templates, multi-day scheduling, venue and space allocation, vendor requirements and bookings, vendor/family portals, schedule-change acknowledgements, live risks, immutable playbooks with generated PDFs, contracts and milestones, guest RSVP, travel dispatch, hotel rooms, itineraries, evidence uploads, and segmented message logging.

The largest product gaps are **configurable tax and currency, actual outbound messaging, CRM/lead management, and richer agency/team ownership**. Some older project documents describe these as present or planned without clearly distinguishing the two; this file records the implementation that exists now.

### Verification note

The live database suite passed **91 of 104 tests** on 26 September 2026. The remaining 13 were not product-assertion failures: their setup hooks could not create additional Supabase Auth users after the project returned `Request rate limit reached`. That affected all nine vendor-portal tests and all four venue-rule tests. Those features are also exercised by the successfully refreshed demo seed, but the full suite should be rerun after the Auth rate-limit window resets before claiming 104/104.

## Original feature register

| ID | Feature | Status | What actually works today | Remaining gap | Trace |
|---|---|---|---|---|---|
| FT-00 | Required wedding project fields | **Partial** | Wedding creation requires client/project name, city, start date, and end date. Guest count is supported, and a standard wedding template can be applied. | Guest count is optional. Venues are managed in the agency roster and assigned to ceremonies, not captured as required project fields. | BR-001 |
| FT-01 | Multi-day event structuring | **Shipped** | Project dates automatically generate consecutive project days. The run-of-show groups multiple ceremonies under each day. | — | BR-021 |
| FT-02 | Event creation required fields | **Partial** | Ceremony name, date, start/end time are required. Setup/teardown time and guest count are supported; the current user is stored as primary owner. | A venue space is optional, and there is no UI for choosing another planner/team member as owner. | BR-041 |
| FT-03 | Venue default details and overrides | **Partial** | Venues store address and contact details. Events support audited overrides for access-open, access-close, noise-curfew, and other rules, with mandatory rationale. | Venue access times and notes exist in the schema but are not exposed in venue create/edit UI. There is no general venue-rule editor. | BR-061 |
| FT-04 | Multi-space venue mapping | **Partial** | A ceremony can occupy multiple spaces. Comfortable/legal capacities are stored, aggregate capacity is checked, and legal over-capacity assignments are blocked. | There is no free-form capacity note per space and no venue/space edit or delete UI. | BR-081 |
| FT-05 | Venue scheduling conflict handling | **Partial** | PostgreSQL physically blocks overlapping use of the same space, including setup and teardown windows. The UI shows a planner-readable prevention message. | The message does not list the specific overlapping ceremonies or provide an availability finder. | BR-101 |
| FT-06 | Capture vendor requirement details | **Shipped** | Requirements capture ceremony, category, scope, arrival time, and completion time, with time-order validation. | — | BR-121 |
| FT-09 | Vendor booking request statuses | **Shipped** | The database and planner UI support Draft, Sent, Accepted, Rejected, Cancelled, and Confirmed, with enforced transitions. | — | BR-181 |
| FT-010 | Vendor booking acceptance locking | **Shipped** | Acceptance records timestamp/source, freezes a scope snapshot, fulfills the requirement, and protects the commitment from direct schedule or scope edits. | — | BR-201 |
| FT-011 | Vendor rejection workflow | **Partial** | Rejection requires a reason and marks the requirement unfulfilled. The planner can create another booking against the requirement. | There is no guided “choose replacement or leave unassigned” prompt. | BR-221 |
| FT-013 | Confirmation for impacted vendors | **Shipped** | Rescheduling a ceremony with accepted/confirmed vendors creates a proposal and one acknowledgement per impacted booking. Vendors can acknowledge in their portal; planners can record offline acknowledgements. The change cannot apply until all acknowledge. | Delivery of the change notice itself is not integrated with email/WhatsApp. | BR-261 |
| FT-027 | Run-sheet generation details | **Partial** | Versioned playbooks snapshot days, ceremony timings, spaces, setup/teardown, guest counts, venue overrides, vendor scopes, arrival/completion times, and vendor contact details. PDFs are rendered and downloadable. | There is no explicit dependency model or dependency editor. Generation is wedding-level rather than a standalone event run-sheet workflow. | BR-541 |
| FT-040 | Wedding dashboard action summary | **Shipped** | The agency dashboard shows upcoming ceremonies, live ranked risks, weddings affected, and vendor payments due/overdue. Project risk pages link back to the corrective workflow. | Risk types are currently limited to vendor fulfillment, missing spaces, and pending schedule changes. | BR-801 |
| FT-045 | Family read-only portal | **Shipped** | Invited family accounts receive a redacted schedule/playbook view and shared evidence. RLS blocks commercial, ledger, vendor-operational, and audit data. | Invitations are claimed after signup/sign-in; invitation email delivery is not implemented. | BR-561 |
| FT-050 | Vendor photo/video evidence upload | **Shipped** | Planners and assigned vendors can upload evidence to Supabase Storage. Access is checked against the ceremony/project, files are listed in the relevant portal, and signed URLs protect reads. Maximum upload size is 30 MB. | Uploads attach to ceremonies; there is no separately modelled milestone-evidence workflow or media processing/transcoding. | BR-581 |
| FT-051 | Six-month media auto-deletion | **Partial** | The worker runs a daily, idempotent purge for media older than 180 days and preserves legal holds. Storage objects are deleted before their database rows. | Retention is 180 days, not exactly six calendar months, and there is no retention/legal-hold management UI. The worker must be deployed continuously for automation to run. | BR-581 |
| FT-141 | Wedding currency and tax defaults | **Not implemented** | Projects and ledger rows default to INR. | Currency is not configurable in the UI; tax treatment, GST defaults, and per-entry overrides do not exist. | BR-2821 |
| FT-142 | Capture vendor commercial terms | **Partial** | Vendor contracts capture vendor, title, total agreed amount, notes, source, and payment milestones. Optional AI extraction can prefill a contract from a text-based PDF when OpenAI is configured. | Payment-method preferences, GST/tax applicability, and structured commercial clauses are not captured. | BR-2841 |
| FT-143 | Milestone-based vendor payment schedules | **Shipped** | Contracts support ordered milestone labels, amounts, and optional due dates. Plans cannot exceed the contract value and must total exactly 100% before activation. Paid milestones and upcoming/overdue amounts are tracked. | — | BR-2861 |
| FT-144 | Milestone creation requirements | **Partial** | Each saved milestone requires a label and positive amount; due date is supported and the plan is editable while drafting. | Due date is optional. Percentage entry and date-based/event-based trigger conditions are not modelled. | BR-2881 |
| FT-150 | Virtual accounts and split payments | **Removed** | Payment-gateway integration was dropped from scope on 2026-11-02. Payments are recorded in the ledger, never processed. | — | BR-2901 |
| FT-151 | In-app UPI QR generation | **Removed** | Dropped with payment-gateway integration (2026-11-02). The ledger can still record a UPI payment after the fact. | — | BR-2901 |
| FT-148 | Payment recording details | **Shipped** | Ledger entries capture direction, amount, paid timestamp, mode (cash/bank/UPI/card), payer (client/planner/vendor/venue), optional vendor, and notes. Entries lock after 15 minutes; later corrections require a reversing entry. | This records payments; it does not execute or reconcile them with a bank/provider. | BR-2961 |
| FT-159 | Daily inflows vs outflows | **Partial** | The ledger shows total money in, total money out, net position, and a chronological entry list. | There is no per-day cash-flow table/chart across the preparation and wedding period. | BR-3181 |
| FT-3107 | Lead capture fields | **Not implemented** | No lead tables, data-access functions, routes, or screens exist. | Full CRM lead capture remains unbuilt. | BR-62141 |
| FT-3114 | Lead interaction logging | **Not implemented** | No lead interaction model or UI exists. | Full feature remains unbuilt. | BR-62281 |
| FT-3128 | Won lead to project conversion | **Not implemented** | Weddings can be created directly or from an operational template. | There is no lead record to convert and no conversation-history carry-over. | BR-62561 |
| FT-3136 | Drag-and-drop lead stages | **Not implemented** | No lead pipeline exists. | Stages, criteria, drag-and-drop UI, and transition enforcement remain unbuilt. | BR-62721 |

## Implemented capabilities missing from the old register

| Area | Current capability | Important limitation |
|---|---|---|
| Authentication and tenancy | Supabase signup/login/logout, agency onboarding, planner/vendor/family organizations, project grants, and transaction-scoped RLS identities. | No staff invitation/role-management UI, password-reset flow, or session administration. |
| Wedding templates | One-, two-, and three-day templates create ceremonies and default vendor requirements inside the normal validated transaction path. | Templates are code-defined and cannot be edited in the UI. |
| Vendor portal | Vendors see only their assignments, accept/reject bookings, acknowledge schedule changes, and upload ceremony evidence. | Portal invitations are database records; no invitation email is sent. |
| Playbook snapshots and PDFs | Playbooks are immutable, versioned snapshots; pending changes mark them draft. A worker renders and stores downloadable PDFs. | No approval/sign-off workflow or external sharing link. |
| Audit trail | Venue exceptions, ledger edits/reversals, and other guarded changes are recorded and visible on a project audit page. | It is not yet a complete audit stream for every entity mutation. |
| Guest parties and RSVP | Planner manages households, guests, plus-one allowance, ceremony invitations, dietary needs, assistance needs, and per-event RSVP through token links. | No invitation dispatch, seating plan, or check-in scanning. |
| Travel and dispatch | Arrival/departure legs, delays, pickup windows, driver, phone, and vehicle dispatch are managed per guest party. | No live flight/train status or driver app integration. |
| Hotels and rooms | Hotels, room blocks, availability, room allocations, stay state, key handover, and welcome-kit tracking are supported. | No hotel-system integration, billing, or roommate optimisation. |
| Guest itinerary | Tokenized, no-login itinerary combines invited ceremonies, travel, room, and guest pass details. | Tokens are bearer links; there is no explicit expiry/revocation UI. |
| Guest broadcasts | Planner can resolve audience segments, compose WhatsApp/SMS/email messages, snapshot recipients, and retain a log. | Dispatch is intentionally stubbed: rows are marked sent, but no external message leaves the system. |
| Contract PDF extraction | A text-based PDF can be parsed and sent to OpenAI for strict contract/milestone JSON, then reviewed in the normal form. | Requires `OPENAI_API_KEY`; scanned-image OCR is not supported. |

## Enforcement and operational reality

- PostgreSQL is the source of truth for tenant isolation, date bounds, space overlap, capacity, booking transitions, accepted-scope locking, schedule-change acknowledgements, contract balance, and ledger correction rules.
- Access is divided into `FULL`, `ASSIGNED_ONLY`, and `READ_ONLY` scopes. Planner/production users, vendors, and family members see deliberately different slices of the same project.
- The web app is a Next.js application using server actions and shared database functions; there is no separate API service.
- The worker currently runs three real responsibilities: database heartbeat, playbook PDF rendering, and the 180-day media sweep. Comments referring to milestone-state sweeps, notification retries, or cached risk recomputation are aspirational/stale; those jobs are not wired into the worker.
- Risks and payment-due state are computed from live records rather than maintained as background status rows.
- The current seed creates two weddings across two isolated agencies: the rich Mehra–Kapoor demo for Shubh Muhurat and a smaller Rao–Iyer project for Bandhan Events. Older documentation claiming five seeded weddings is stale.

## Recommended next product increments

1. Finish the partial core flows: editable venue defaults, space/venue maintenance, richer conflict detail, team ownership, and explicit playbook dependencies.
2. Connect a real messaging provider so invitations, schedule changes, and guest broadcasts leave the system with retryable delivery states.
3. Add configurable currency/GST and a true daily cash-flow view before expanding the financial surface.
4. Build CRM only after deciding whether it is a first-class product surface; currently there is no hidden or partial lead implementation to preserve.
