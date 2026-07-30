## Introduction

The product named VivahSync has the following functional requirements:

MVP (23 Specs)
FR-001.1
Project Profile Mandatory Input Data Capture

FR-021.1
Chronological Day-by-Day Structure Generation

FR-041.1
Ceremony Entity Parameter Definition

FR-061.1
Venue Rule Exception Management

FR-081.1
Venue Sub-Space Capacity Enforcement

FR-101.1
Space Allocation Overlap Detection

FR-121.1
Vendor Scope and Milestone Configuration

FR-181.1
Vendor Procurement Status Progression Execution

FR-201.1
Vendor Commitment Locking and Timestamping

FR-221.1
Vendor Rejection Rationale Capture

FR-261.1
Post-Agreement Schedule Modification Protocol

FR-541.1
Unified Playbook Generation and Versioning

FR-801.1
Critical Operational Risk Dashboarding

FR-2821.1
Project Financial Baseline Setup and Locking

FR-2841.1
Binding Vendor Commercial Terms Capture

FR-2861.1
Payment Milestone Balance Enforcement

FR-2881.1
Milestone Trigger Condition Configuration

FR-2961.1
Immutable Financial Ledger Recording

FR-3181.1
Daily Liquidity Forecasting and Visualization

FR-62141.1
Prospect Data Acquisition and Standardization

FR-62281.1
Sales Engagement Interaction Logging

FR-62561.1
Prospect-to-Project Data Migration and Handoff

FR-62721.1
Sales Pipeline Stage Transition Enforcement

FR-561.1
Family Portal Access & RLS Scoping

FR-581.1
Evidence Media Capture and Association

FR-581.2
Media Lifecycle Management (6-Month TTL)

FR-2901.1
Cashfree Escrow Routing & Virtual Account Generation

FR-2901.2
Native In-App UPI QR Rendering

## FR-001.1: Project Profile Mandatory Input Data Capture

# Description

The system shall capture core project details, specifically client identity, primary dates, location, core venues, and expected scale, at the time of project initiation.

# Trigger Event

User initiates a new wedding project in the system.

# Pre-Conditions

User possesses the appropriate role to create new projects.

# System Behavior

Provides a structured input mechanism to record fundamental project parameters. Identifies and mandates the completion of all baseline data fields before proceeding.

# Exception Scenarios

System detects empty or malformed data in mandatory fields. (Expected Response - Rejects the submission and explicitly indicates which mandatory data parameters are missing or invalid.)

# Post-Conditions

A newly initialized project profile exists in a draft or pending state.

# Acceptance Criteria

System successfully saves a project when all mandatory parameters are provided.

System strictly prevents project creation if client identity, primary dates, location, core venues, or expected scale are missing.

------------------------------------------------------

## FR-021.1: Chronological Day-by-Day Structure Generation

# Description

The system shall automatically generate a chronological, multi-day structure based strictly on the overarching start and end dates established for the project.

# Trigger Event

A project is successfully initialized with established start and end dates.

# Pre-Conditions

The overarching start and end dates of the project are defined.
System Behavior

Computes the duration of the project and generates discrete, consecutive calendar day containers that span from the start date to the end date.

# Exception Scenarios

Start date is updated to be chronologically after the end date. (Expected Response - Blocks the date update and prompts the user to correct the chronological discrepancy.)

# Post-Conditions

A consecutive daily timeline structure is available for event assignment.

# Acceptance Criteria

System creates exact day intervals corresponding to the date range.
System prevents assigning an operational day outside the overarching project start and end dates.

------------------------------------------------------------

## FR-041.1: Ceremony Entity Parameter Definition

# Description
The system shall allow users to define individual ceremonies, enforcing the capture of nomenclature, start/end dates and times, designated physical footprint, and an accountable internal owner.

# Trigger Event
User creates a new sub-event or ceremony within a project.

# Pre-Conditions

A project timeline structure is defined.

# System Behavior

Requires the input of specific mandatory parameters for the sub-event, and validates that the selected temporal boundaries align with the project's overall multi-day structure.

# Exception Scenarios

Ceremony time boundaries are scheduled outside the project's authorized timeline. (Expected Response - System rejects the creation/update and prompts the user to align the dates within project boundaries.)

# Post-Conditions

A discrete ceremony entity is created and mapped to a specific timeline day and accountable owner.
Acceptance Criteria
System enforces completion of name, time boundaries, physical footprint, and owner assignment.
System allows querying of all ceremonies by their designated internal owner.


-----------------------------------------------------

## FR-061.1: Venue Rule Exception Management

# Description

The system shall permit users to apply explicit overrides to standard venue operational baseline rules for specific events, while maintaining a documented audit trail of the exception.

# Trigger Event

User configures an event and selects to bypass or alter a standard venue rule.

# Pre-Conditions

Standard baseline rules are established for the assigned venue.

# System Behavior
Records the deviation from the venue's baseline configuration, requires the user to input an exception rationale, and logs the action for auditing.

# Exception Scenarios

User attempts to override a baseline rule without providing documentation/rationale. (Expected Response - Blocks the override application until explicit documentation is provided.)

# Post-Conditions

The event configuration reflects the exception, and the baseline venue rules remain unchanged for other events.

# Acceptance Criteria

System allows baseline venue rules to be overridden on a per-event basis.
System strictly requires documentation/rationale when an override is applied.
System maintains an audit log of who made the override and when it was made.

--------------------------------------------------

## FR-081.1: Venue Sub-Space Capacity Enforcement

# Description

The system shall assign events to specific functional sub-spaces within a venue and track the expected guest volume against the defined spatial capacity limit.

# Trigger Event

User assigns an expected guest count to an event located in a designated sub-space.

# Pre-Conditions

Venue sub-spaces have predefined maximum capacity attributes.
The event has a defined expected guest count.

# System Behavior

Compares the event's expected guest count against the maximum capacity limit configured for the selected venue sub-space.

# Exception Scenarios

Expected guest count exceeds the maximum capacity of the assigned sub-space. (Expected Response - Triggers a capacity violation warning or flag, restricting finalization until resolved or formally acknowledged.)

# Post-Conditions

The spatial allocation is recorded with an indicator of capacity compliance.

# Acceptance Criteria

System supports the allocation of a single event across one or multiple adjoining sub-spaces.

System accurately computes whether the expected guest count violates the aggregate capacity limit of the assigned space(s).

----------------------------------------------------

## FR-101.1: Space Allocation Overlap Detection

# Description

The system shall prevent concurrent scheduling of events or activities within the same physical venue space during overlapping temporal periods, inclusive of setup and teardown times.

# Trigger Event

User attempts to save an event or vendor activity with a specific space and timeframe.

# Pre-Conditions

All venue spaces have unique identifiers.
Temporal boundaries (including setup/teardown) are defined for all bookings.

# System Behavior

Executes a conflict matrix check against all existing reservations for the requested space. Evaluates the full temporal window (setup start to teardown end).

# Exception Scenarios

System detects an overlapping time block for the same physical space. (Expected Response - Blocks the booking, displaying details of the conflicting event/activity to the user.)

# Post-Conditions

The booking is confirmed only if no temporal overlaps exist in the specified space.

# Acceptance Criteria

System correctly identifies scheduling collisions down to the minute within a specific sub-space.

System strictly prevents saving a booking that overlaps with a confirmed setup, event, or teardown period in the same space.

-----------------------------------------------

## FR-121.1: Vendor Scope and Milestone Configuration

# Description

The system shall facilitate the precise definition of third-party vendor expectations by capturing categorization, scope of work, and strict temporal milestones for arrival and task completion.

# Trigger Event

User defines requirements for a vendor engagement within an event.

# Pre-Conditions

Standard vendor categories exist in the system.
The event timeline is established.

# System Behavior

Provides a structured entity for vendor requirements, enforcing the association of temporal boundaries to the vendor's scope of work.

# Exception Scenarios

User sets a vendor arrival time later than the designated task completion time. (Expected Response - System rejects the milestone configuration due to chronological impossibility.)

# Post-Conditions

A distinct vendor requirement profile is created and linked to the project schedule.

# Acceptance Criteria

System records vendor category, explicit scope text, and timestamp-based arrival/completion milestones.
System validates that arrival milestones logically precede completion milestones

----------------------------------------

## FR-181.1: Vendor Procurement Status Progression Execution

# Description

The system shall track vendor engagements through rigidly sequential progression states from initial formulation through to confirmed or terminated status.

# Trigger Event

User updates the procurement stage of a specific vendor engagement.

# Pre-Conditions

A vendor engagement record exists.

# System Behavior

Transitions the engagement to the newly requested state, ensuring the transition complies with the predefined sequential lifecycle.

# Exception Scenarios

User attempts to transition a vendor status out of sequence (e.g., from 'Formulation' directly to 'Confirmed'). (Expected Response - Rejects the status change and enforces the mandatory intermediate states required by the procurement policy.)

# Post-Conditions

The vendor engagement reflects the new state in all tracking and visibility dashboards.

# Acceptance Criteria

System enforces sequential stage movement for all vendor procurement cycles.

System clearly exposes the current procurement state for any vendor engagement to authorized users.

---------------------------------------------------------

## FR-201.1: Vendor Commitment Locking and Timestamping

# Description

The system shall execute a formal lock on a vendor's time allocation and defined scope upon recording their acceptance, stamping the record with an immutable agreement timestamp.

# Trigger Event

Vendor engagement status transitions to 'Accepted'.

# Pre-Conditions

Vendor scope and time parameters are fully populated.

# System Behavior

Applies an immutable lock to the scope and time parameters of the vendor record, preventing standard user modification, and generates a timestamp of the lock event.

# Exception Scenarios

User attempts to modify a locked vendor scope without initiating a formal exception process. (Expected Response - Disables editing of locked fields and informs the user that an exception workflow must be triggered to make changes.)

# Post-Conditions

The vendor engagement scope and schedule are locked and protected from unilateral editing.

# Acceptance Criteria

System automatically applies a lock on scope and time parameters immediately upon status reaching 'Accepted'.

System stores and displays an immutable timestamp of when the lock was established.

-------------------------------------------------------

## FR-221.1: Vendor Rejection Rationale Capture

# Description

The system shall enforce the mandatory capture of rejection rationales when a vendor declines an engagement and prevent the requirement from remaining in a dormant state.

# Trigger Event

User marks a vendor engagement as 'Rejected' or 'Declined'.

# Pre-Conditions

A pending vendor engagement exists.

# System Behavior

Prompts for a mandatory rejection reason. Once recorded, the system forces the engagement requirement state to transition immediately to 'Unfulfilled' or 'Replacement Needed'.

# Exception Scenarios

User bypasses the rationale input prompt. (Expected Response - Prevents the state transition to 'Rejected' until the rationale field is populated.)

# Post-Conditions

The rejection rationale is saved, and the service requirement status becomes active for reassignment.

# Acceptance Criteria

System refuses to process a vendor rejection without a recorded rationale.
System automatically flags the underlying service requirement as unresolved/unfulfilled upon rejection.

---------------------------------------------------------

## FR-261.1: Post-Agreement Schedule Modification Protocol

# Description

The system shall trigger a mandatory impact analysis and require explicit vendor acknowledgement when established and locked event schedules are altered.

# Trigger Event

User submits a proposed change to a schedule that affects a locked vendor commitment.

# Pre-Conditions

At least one vendor commitment is locked against the original schedule.

# System Behavior

Identifies all locked vendor agreements impacted by the time shift, marks the change as 'Proposed', and initiates a workflow requiring acknowledgement from impacted vendors before finalizing the change.

# Exception Scenarios

User attempts to forcefully apply schedule changes to locked vendors without acknowledgement. (Expected Response - Blocks the save action, enforcing that the proposed schedule remain unfinalized.)

# Post-Conditions

The original schedule remains active while the proposed schedule awaits full vendor acknowledgement.

# Acceptance Criteria

System accurately detects which specific locked vendors are affected by a time boundary change.

System holds the modification in a provisional state until all impacted vendors are marked as acknowledged.

-------------------------------------------------------

## FR-541.1: Unified Playbook Generation and Versioning

# Description

The system shall aggregate established event timings, space allocations, vendor schedules, dependencies, and contacts into a definitive operational playbook document with strict version control.

# Trigger Event

User initiates the generation of the operational playbook for a project.

# Pre-Conditions

Project events, locations, and vendor assignments have been configured.
System Behavior

Compiles all finalized schedule, vendor, and location data into a unified timeline format. Assigns an immutable version number and timestamp to the generated output.

# Exception Scenarios

User attempts to generate a playbook while critical unfinalized changes (e.g., proposed schedules) exist. (Expected Response - Alerts the user of unfinalized changes, allowing them to either abort or generate a playbook explicitly marked as a 'Draft/Unfinalized' version.)

# Post-Conditions

A unified operational playbook is created, stamped with a version number, and stored in the project history.

# Acceptance Criteria

System successfully extracts and collates temporal, spatial, and vendor data into a single consecutive flow.

System stamps each generated playbook with a unique version identifier and exact date/time of synthesis.

-------------------------------------------------------

## FR-801.1: Critical Operational Risk Dashboarding

# Description

The system shall calculate and display centralized, prioritized operational risks based on approaching event dates, unfulfilled vendor dependencies, and outstanding logistical conflicts.

# Trigger Event

User accesses the operational risk management module.

# Pre-Conditions

Project schedules and vendor tracking states are maintained in the system.

# System Behavior

Aggregates project data in real-time to identify immediate impending deadlines (within defined temporal thresholds) and critical anomalies (conflicts, missing vendors) that lack resolution.

# Exception Scenarios

No critical anomalies or approaching deadlines exist across projects. (Expected Response - Displays a neutral state indicating zero high-priority risks detected.)

# Post-Conditions

A prioritized list of actionable risk items is presented to the user.

# Acceptance Criteria

System accurately highlights unfulfilled vendor requirements for events approaching within a configurable proximity threshold.

System automatically escalates unresolved space scheduling conflicts to the risk dashboard.


## FR-2821.1: Project Financial Baseline Setup and Locking

# Description

The system shall capture standardize financial parameters (currency designation, baseline regulatory tax treatments) for a project and lock these parameters immediately upon recording the first financial transaction.

# Trigger Event

The first financial transaction (payment or invoice) is recorded against the project.

# Pre-Conditions

Project currency and baseline tax rules are configured.
A financial transaction is submitted for processing.

# System Behavior

Identifies the execution of the initial transaction and triggers a permanent lock on the project's foundational currency and tax treatment settings.

# Exception Scenarios

User attempts to edit the project currency after a transaction has been logged. (Expected Response - System denies the modification and provides a message stating that financial baselines are locked post-transaction.)

# Post-Conditions

Financial baseline parameters become strictly un-editable.

# Acceptance Criteria

System applies currency and tax configurations to all subsequent modules in the project.

System successfully disables editing of these base fields once any ledger activity is detected.

------------------------------------------------

## FR-2841.1: Binding Vendor Commercial Terms Capture

# Description

The system shall record explicit, binding commercial terms for vendors, defining gross financial obligations, allowable settlement methods, and specific regulatory tax applicability, establishing an unalterable financial ceiling.

# Trigger Event

User finalizes commercial terms for an engaged vendor.

# Pre-Conditions

Vendor engagement exists and is proceeding to a confirmed state.

# System Behavior

Records the gross commercial value and tax data. Establishes the gross value as the maximum limit for any subsequent milestone allocations.

# Exception Scenarios

User attempts to define a payment milestone plan that exceeds the defined gross commercial obligation. (Expected Response - Blocks the creation of the milestone and enforces the defined gross amount as the maximum limit.)

# Post-Conditions

Commercial terms are formally saved against the vendor record.

# Acceptance Criteria

System accurately records gross value, settlement methods, and tax inclusion/exclusion status.

System utilizes the defined gross obligation as a strict validation ceiling for downstream payment structuring.

----------------------------------------------------

## FR-2861.1: Payment Milestone Balance Enforcement

# Description

The system shall process vendor financial settlements by structuring them into progressive milestones, rigidly enforcing that the sum of all milestones perfectly equates to 100% of the agreed total commercial obligation.

# Trigger Event

User attempts to save a milestone payment schedule for a vendor.

# Pre-Conditions

Gross commercial obligation for the vendor is established (BR-2841).
System Behavior

Calculates the total monetary value of all defined milestones and compares it against the established gross financial obligation.

# Exception Scenarios

The sum of the created milestones equals 90% or 110% of the gross obligation. (Expected Response - System rejects the schedule save, highlighting the variance and forcing the user to adjust the milestones to exactly equal 100%.)

# Post-Conditions

The milestone schedule is saved and activated for tracking.

# Acceptance Criteria

System permits dividing the total payment into multiple progressive stages.

System strictly requires the aggregate sum of milestones to match the vendor's total commercial obligation exactly.

---------------------------------------------------

## FR-2881.1: Milestone Trigger Condition Configuration

# Description

The system shall require the explicit configuration of activation triggers for each financial milestone, capturing exact temporal deadlines or specific operational event conditions.

# Trigger Event

User configures the rules for an individual payment milestone.

# Pre-Conditions

A milestone structure is being defined for a vendor.

# System Behavior

Associates the monetary proportion of the milestone with a verifiable, objective trigger, either a fixed calendar date or an explicit operational event dependency.

# Exception Scenarios

User assigns an operational event dependency for an event that has already occurred. (Expected Response - System warns the user that the trigger condition is historically met, meaning the liability is immediately due.)

# Post-Conditions

The milestone is equipped with a distinct criteria condition required to authorize fund release.

# Acceptance Criteria

System successfully binds milestones to explicit operational events derived from the schedule.

System prevents the creation of ambiguous milestones that lack a defined temporal or operational trigger.

------------------------------------------------------

## FR-2961.1: Immutable Financial Ledger Recording

# Description

The system shall capture and maintain an immutable ledger of all executed financial transactions, recording precise disbursed values, exact execution times, settlement methods, and the originating financial entity.

# Trigger Event

User logs a completed payment transaction against a project or vendor.

# Pre-Conditions

User possesses appropriate financial privileges to record payments.

# System Behavior

Records all transaction details into a fraud-proof, append-only ledger structure. No standard user may delete or alter the transaction once committed.

# Exception Scenarios

A recorded transaction requires correction due to clerical error. (Expected Response - System enforces the creation of a compensating/reversing transaction entry rather than allowing direct modification or deletion of the original record.)

# Post-Conditions

The transaction is permanently recorded and instantly reflected in project payment reconciliations.

# Acceptance Criteria

System strictly records the precise disbursed value, time, method, and originating entity.

System successfully blocks the modification or deletion of committed ledger records.

-----------------------------------------------------

## FR-3181.1: Daily Liquidity Forecasting and Visualization

# Description

The system shall provide comparative visibility of financial inflows against both projected and actual outflows chronologically across the project lifecycle.

# Trigger Event

User accesses the financial liquidity/cash flow module.

# Pre-Conditions

Milestone triggers and actual financial ledger transactions exist in the system.

# System Behavior

Aggregates milestone trigger data and recorded ledger transactions to generate a time-series model of daily net cash positions. Strictly segregates actualized cash movements from projected future liabilities.

# Exception Scenarios

Projected daily outflows exceed actualized inflows. (Expected Response - Highlights the specific day/period in negative liquidity to alert the user of an impending cash shortfall.)

# Post-Conditions

A chronologically organized model of cash flow availability is rendered for the user.

# Acceptance Criteria

System accurately computes daily future outflows based strictly on the unfulfilled milestone triggers.

System clearly differentiates between cash physically received (actuals) versus expected to be received (projections).

---------------------------------------------------------------

## FR-62141.1: Prospect Data Acquisition and Standardization

# Description

The system shall capture core prospect details upon entry, specifically acquisition channels, primary contact information, geographical focus, temporal viability parameters, and estimated financial capacity.

# Trigger Event

User creates a new prospective lead in the system.

# Pre-Conditions

User is authorized to manage the sales pipeline.

# System Behavior

Provides a structured form enforcing the collection of standardized qualification criteria required to assess lead viability.

# Exception Scenarios

User attempts to save the prospect profile with missing mandatory qualification data. (Expected Response - Prevents profile creation and flags the specific missing mandatory attributes.)

# Post-Conditions

A standardized prospective lead profile is established in the initial pipeline stage.

# Acceptance Criteria

System requires contact info, acquisition channel, geographic focus, temporal parameters, and estimated budget to be completed upon lead creation.

System maps the captured fields to standardized internal data dictionaries for reporting.

-----------------------------------------------------

## FR-62281.1: Sales Engagement Interaction Logging

# Description

The system shall capture a comprehensive audit trail of all prospect engagements, documenting the communication methodology, exact chronological timing, and business outcomes.

# Trigger Event

User logs a new interaction or activity against a prospect profile.

# Pre-Conditions

A prospective lead profile exists in the system.

# System Behavior

Records the interaction data into the prospect's historical timeline, associating it securely with the user and attaching an automatic timestamp.

# Exception Scenarios

User attempts to log an interaction without selecting a communication methodology. (Expected Response - Blocks the submission until a valid communication methodology is explicitly selected.)

# Post-Conditions

The engagement interaction is appended to the prospect's permanent audit trail.

# Acceptance Criteria

System successfully records methodology, timestamp, and text outcomes for each discrete interaction.

System preserves the engagement history chronologically for contextual sales continuity.

---------------------------------------------------------

## FR-62561.1: Prospect-to-Project Data Migration and Handoff

# Description

The system shall automatically transition successful prospect records into active project structures, preserving all acquired data, historical audit trails, and financial parameters without requiring manual reconstruction.

# Trigger Event

User marks a prospect pipeline stage as 'Won' or 'Converted'.

# Pre-Conditions

Prospect profile contains all required baseline data fields matching project initiation requirements (BR-001).

# System Behavior

Executes a systemic conversion that extracts the qualified lead parameters and audit histories, maps them directly to a new core project profile, and provisions the project for operational execution.

# Exception Scenarios

System detects that the prospect data lacks a mandatory field required for project initiation. (Expected Response - Pauses the conversion process and prompts the user to supply the missing mandatory parameter before finalizing the transition.)

# Post-Conditions

An active project is initialized containing all historical context, and the prospect record is marked as converted.

# Acceptance Criteria

System strictly maps prospect geographic focus, temporal parameters, and budget into the equivalent active project baseline parameters.

System completely eliminates the need to manually re-enter prospect data when initiating the operational project.

-----------------------------------------------

## FR-62721.1: Sales Pipeline Stage Transition Enforcement

# Description

The system shall allow prospects to transition across defined lifecycle stages while strictly enforcing the criteria required to advance to subsequent phases.

# Trigger Event

User attempts to drag or update a prospect record to the next sequential pipeline stage.

# Pre-Conditions

Sequential pipeline stages and their entry criteria are defined.

# System Behavior

Validates the prospect data against the entry criteria defined for the target stage. Approves the transition if met, or blocks it if criteria are missing.

# Exception Scenarios

User attempts to move a prospect to 'Proposal Sent' stage without having generated or attached a formal proposal document. (Expected Response - System rejects the stage transition and lists the unmet criteria blocking the progression.)

# Post-Conditions

The prospect accurately reflects its new position within the sales pipeline hierarchy.

# Acceptance Criteria

System strictly enforces transition criteria before allowing an opportunity to change states.

System visually accurately reflects real-time status and aggregate pipeline staging for accurate forecasting.

-------------------------------------

## FR-561.1: Family Portal Access & RLS Scoping

# Description

The system shall provide a restricted entry point for users designated with the FAMILY role, strictly enforcing Row-Level Security to expose only operational schedules while masking all financial and risk-related tables.

# Trigger Event

A user with the FAMILY tenant scope authenticates and accesses a specific project.

# System Behavior

Applies a read-only database filter that fetches data from project_days, events, and playbooks, while returning zero rows for ledger_entries, vendor_contracts, and vendor_commercial_terms.

# Exception Scenarios

A family member attempts to navigate directly to an authorized URL (e.g., /project/123/ledger). (Expected Response - System returns a 403 Forbidden or empty state, as the RLS policy blocks the underlying data read.)

# Acceptance Criteria

System strictly prevents FAMILY role users from reading, writing, or modifying any financial data, contracts, or vendor communication histories.

------------------------------------------------------------

## FR-581.1: Evidence Media Capture and Association

# Description

The system shall permit users to upload photo and video files, associating them directly with specific vendor requirements, completed milestones, or event entities.

# Trigger Event

User uploads a media file against a specific task or milestone from the UI.

# System Behavior

Processes the upload, generates a secure cloud storage link, and writes a record to the evidence_media table, capturing the uploader's identity, the associated entity ID, and a strict creation timestamp.

# Acceptance Criteria

System successfully links uploaded media to the correct operational entity and displays it inline within the event run-sheet or milestone view.

---------------------------------------------------------------

## FR-581.2: Media Lifecycle Management (6-Month TTL)

# Description

The system shall automatically identify and permanently delete all uploaded media files that reach exactly 6 months of age to enforce data minimization.

# Trigger Event

System time advances past the exact 6-month anniversary of the media record's creation timestamp.

# System Behavior

A scheduled background worker queries the evidence_media table for expired records, issues a delete command to the cloud storage provider (e.g., S3), and removes the corresponding row from the database.

# Acceptance Criteria

System guarantees that no photo or video evidence exists in either the database or cloud storage beyond 180 days from its original upload time.

---------------------------------------------------------------

## FR-2901.1: Cashfree Escrow Routing & Virtual Account Generation

# Description

The system shall interface with the Cashfree API to dynamically generate Virtual Bank Accounts for primary high-value transactions (RTGS, IMPS, NEFT) to facilitate split vendor payouts via escrow.

# Trigger Event

User initiates the activation of a milestone payment via bank transfer.

# System Behavior

System requests a dedicated Virtual Bank Account from Cashfree linked specifically to the transaction. Upon receiving webhook confirmation of client deposit, the system executes the split logic to disburse funds to the planner and assigned vendors.

# Acceptance Criteria

System successfully provisions Virtual Accounts and accurately translates Cashfree webhook payloads into immutable ledger_entries.

------------------------------------------------------------------

## FR-2901.2: Native In-App UPI QR Rendering

# Description

For secondary, smaller transactions executed via UPI, the system must generate a Cashfree Virtual UPI ID and display the corresponding QR code directly within the VivahSync interface, enforcing strict in-app context retention.

# Trigger Event

User selects UPI as the payment method for a milestone or invoice.

# System Behavior

Generates a dynamic Cashfree Virtual UPI ID and strictly renders the corresponding QR code inline within the application interface. The system natively handles the payment flow and explicitly blocks any redirection to external web browsers or third-party payment pages.

# Acceptance Criteria

System successfully renders the QR code natively on both mobile and web views. External URL redirection mechanisms are completely disabled for the payment flow.