export { withUser, withSystem, type Tx } from './withUser.js'
export { appPool, systemPool, closePools } from './pool.js'
export { dbEnv } from './env.js'
export {
  getMyContext,
  onboardPlanner,
  listProjects,
  createProject,
  type OrgContext,
  type OrgSummary,
  type ProjectRow,
  type NewProject,
} from './queries/tenancy.js'
export {
  listVenues,
  createVenue,
  listSpaces,
  createSpace,
  getProject,
  listDays,
  listEvents,
  scheduleEvent,
  editEvent,
  deleteEvent,
  setEventSpaces,
  type VenueRow,
  type SpaceRow,
  type ProjectDetail,
  type DayRow,
  type EventRow,
  type EventSpace,
  type ScheduleInput,
} from './queries/operations.js'
export {
  listVendors,
  createVendor,
  listProjectRequirements,
  addRequirement,
  listProjectBookings,
  createBooking,
  transitionBooking,
  type VendorProfile,
  type VendorCategory,
  type BookingStatus,
  type RequirementRow,
  type BookingRow,
} from './queries/vendors.js'
export {
  rescheduleEvent,
  listProposals,
  acknowledgeChange,
  finalizeProposal,
  cancelProposal,
  type RescheduleResult,
  type ProposalRow,
  type AckRow,
} from './queries/scheduleChanges.js'
export {
  generatePlaybook,
  listPlaybooks,
  getPlaybook,
  type PlaybookMeta,
  type PlaybookFull,
  type PlaybookSnapshot,
  type PlaybookDay,
  type PlaybookEvent,
  type PlaybookVendor,
  type PlaybookOverride,
} from './queries/playbook.js'
export { getRiskFacts, getDashboardFacts, type RiskFacts, type DashboardFacts } from './queries/risk.js'
export {
  getRenderStatus,
  getRenderedPdf,
  listRenderStatuses,
  type RenderStatus,
} from './queries/renders.js'
export {
  addVenueOverride,
  listProjectOverrides,
  listAuditLog,
  type VenueRuleKey,
  type OverrideRow,
  type AuditRow,
} from './queries/venueRules.js'
export {
  inviteFamily,
  listProjectInvitations,
  claimFamilyInvitations,
  familyRunsheet,
  type InvitationRow,
  type FamilyRunsheet,
} from './queries/family.js'
export {
  getEventForUpload,
  recordEvidence,
  listProjectEvidence,
  getEvidenceStoragePath,
  deleteEvidence,
  type EvidenceRow,
} from './queries/evidence.js'
export {
  recordLedgerEntry,
  editLedgerEntry,
  deleteLedgerEntry,
  reverseLedgerEntry,
  listProjectLedger,
  type LedgerRow,
  type LedgerInput,
  type LedgerDirection,
  type PaymentMode,
  type PayerEntity,
} from './queries/ledger.js'

import { appPool } from './pool.js'

/** Lightweight connectivity probe via the app pool (no RLS tables touched). */
export async function ping(): Promise<{ ok: boolean; version: string }> {
  const r = await appPool().query('select version() as version')
  return { ok: true, version: r.rows[0].version as string }
}
