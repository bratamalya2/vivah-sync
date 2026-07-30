Feature ID |    Feature Name |	Feature Description	| Trace

FT-00 |	Required wedding project fields	| When a planner creates a new wedding project, the system captures client name, wedding dates (start/end), city, venue(s), and expected guest count as required fields. | BR-001

FT-01 |	Multi-day event structuring |	When a wedding spans multiple days, the system creates a day-by-day structure where each day can contain multiple events (e.g., Haldi, Sangeet, Wedding, Reception). | BR-021

FT-02 |	Event creation required fields | When an event is created, the system requires event name, date, start/end time, venue area/space, and primary owner (planner/team member).	| BR-041

FT-03 |	Venue default details & overrides |	When adding a venue, the system stores venue address, contact person, access timings, and venue rules that apply to all events unless overridden per event.	| BR-061

FT-04 |	Multi-space venue mapping | When a venue has multiple spaces (lawn, ballroom, terrace), the system allows mapping each event to one or more spaces with capacity notes per space. | BR-081

FT-05 |	Venue scheduling conflict handling	When two events attempt to use the same venue space at overlapping times, the system blocks confirmation and shows a conflict message with the overlapping items. | BR-101

FT-06 |	Capture vendor requirement details | When a planner adds a vendor requirement to an event, the system captures vendor category, scope notes, required arrival time, and required completion time. | BR-121

FT-09 |	Vendor booking request statuses	When a planner creates a booking request for a vendor, the system supports statuses: Draft, Sent, Accepted, Rejected, Cancelled, and Confirmed.	| BR-181

FT-010 | Vendor booking acceptance locking | When a vendor accepts a booking, the system locks the event time slot for that vendor and records acceptance timestamp and accepted scope summary.	| BR-201

FT-011 | Vendor rejection workflow | When a vendor rejects a booking, the system requires a rejection reason and prompts the planner to select a replacement vendor or mark as unassigned.	|  BR-221

FT-013 | Confirmation for impacted vendors | When a planner edits an event time/date after vendors are assigned, the system lists impacted vendors and requires confirmation before applying changes. | BR-261

FT-027 | Run-sheet generation details | When a planner generates a run-sheet for an event, the system includes event timings, venue space, vendor arrival times, key contacts, and dependencies. | BR-541

FT-040 | Wedding dashboard action summary |	When a planner views the wedding dashboard, the system shows a summary of upcoming events, unconfirmed vendors, and conflicts requiring action.	| BR-801

FT-045 | Family read-only portal | When a family member logs in, the system displays the event schedule, run-sheets, and locations, but strictly hides contracts, pricing, and risk data.  |	BR-561

FT-050	| Vendor photo/video evidence upload |	When a milestone is reached, the system allows the assigned vendor or planner to upload photo/video proof directly to the event timeline. | BR-581

FT-051	| 6-Month media auto-deletion |	When uploaded media reaches exactly 6 months of age, the system permanently purges the file from storage to optimize costs.	| BR-581

FT-141 | Wedding currency and tax defaults | When a wedding project is created, the system allows setting the wedding currency and tax treatment defaults that apply to all financial entries unless overridden. | BR-2821

FT-142 | Capture vendor commercial terms | When a vendor is added to the wedding, the system captures commercial terms: total agreed amount, payment method preferences, and tax/GST applicability.	| BR-2841

FT-143 | Milestone-based vendor payment schedules | When creating a vendor payment plan, the system supports milestone-based schedules (e.g., booking advance, pre-event, on-day, post-event) with due dates. | BR-2861

FT-144 | Milestone creation requirements | When a milestone is created, the system requires milestone name, amount or percentage, due date, and triggering condition (date-based or event-based). | BR-2881

FT-150	| Cashfree Virtual Accounts & Split Payments |	When a planner initiates an escrow payout, the system utilizes Cashfree to generate a Virtual Bank Account, defaulting to RTGS/IMPS/NEFT for primary transactions. |	BR-2901

FT-151 | In-app UPI QR Generation |	When a secondary/smaller payment is initiated via UPI, the system natively renders the Cashfree Virtual UPI QR code directly in the app without external web redirection. |	BR-2901

FT-148 |	Payment recording details	| When a payment is recorded, the system captures paid amount, paid date/time, payment mode (cash/bank/UPI/card), and payer entity (client/planner/venue).	| BR-2961

FT-159 |	Daily inflows vs outflows |	When a planner views the cash flow ledger, the system shows inflows vs outflows by day across the wedding date range and surrounding prep period.	| sBR-3181

FT-3107	| Lead capture fields | When a new lead is created, the system captures source (call, website, referral, partner), contact details, city, wedding date range, and estimated budget.	| BR-62141

FT-3114	| Lead interaction logging details |	When the owner contacts the lead, the system logs the interaction type (call/WhatsApp/email/meeting), timestamp, and outcome.	| BR-62281

FT-3128	| Won lead to project conversion |	When a lead is marked “won,” the system triggers conversion into a wedding project and carries over all captured details and conversation history.	| BR-62561

FT-3136	| Drag-and-drop lead stages	| When viewing the lead pipeline, the system supports stages (New, Contacted, Qualified, Proposal, Negotiation, Won, Lost) with drag-and-drop movement.	| BR-62721
