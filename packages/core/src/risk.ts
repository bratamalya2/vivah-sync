// FR-801 risk scoring. PURE — no I/O. The DB layer gathers facts under RLS;
// this ranks them, so a planner action-view and the worker share one rule set.
// Risk is COMPUTED on read, never stored (Project-Overview §5).

export type RiskSeverity = 'HIGH' | 'MEDIUM' | 'LOW'

export type RiskType =
  | 'UNFULFILLED_REQUIREMENT' // a booked vendor fell through — needs replacement
  | 'UNBOOKED_REQUIREMENT' // no accepted vendor for an approaching ceremony
  | 'NO_SPACE' // approaching ceremony not booked into a space
  | 'PENDING_SCHEDULE_CHANGE' // proposed time change awaiting vendor acknowledgement

export interface Risk {
  type: RiskType
  severity: RiskSeverity
  title: string
  detail: string
  eventName: string
  eventDate: string
  daysUntil: number
  score: number
}

export interface RiskFacts {
  requirements: {
    event_name: string
    event_date: string
    days_until: number
    category: string
    fulfillment_status: string
  }[]
  eventsWithoutSpace: { event_name: string; event_date: string; days_until: number }[]
  pendingChanges: { event_name: string; event_date: string; days_until: number; unacked: number }[]
}

export interface RiskOptions {
  /** ceremonies within this many days count as "approaching" (RISK_PROXIMITY_DAYS) */
  proximityDays: number
  categoryLabel?: (category: string) => string
}

const WEIGHT: Record<RiskSeverity, number> = { HIGH: 3, MEDIUM: 2, LOW: 1 }

export function computeRisks(facts: RiskFacts, opts: RiskOptions): Risk[] {
  const proximity = opts.proximityDays
  const label = opts.categoryLabel ?? ((c) => c)
  const risks: Risk[] = []

  for (const r of facts.requirements) {
    if (r.days_until < 0 || r.fulfillment_status === 'FULFILLED') continue

    if (r.fulfillment_status === 'UNFULFILLED') {
      // a vendor fell through — serious even weeks out
      risks.push({
        type: 'UNFULFILLED_REQUIREMENT',
        severity: r.days_until <= 7 ? 'HIGH' : 'MEDIUM',
        title: `${label(r.category)} vendor needs replacement`,
        detail: `A booking fell through for “${r.event_name}” — no active vendor.`,
        eventName: r.event_name,
        eventDate: r.event_date,
        daysUntil: r.days_until,
        score: 0,
      })
    } else if (r.fulfillment_status === 'OPEN' && r.days_until <= proximity) {
      risks.push({
        type: 'UNBOOKED_REQUIREMENT',
        severity: r.days_until <= 3 ? 'HIGH' : r.days_until <= 7 ? 'MEDIUM' : 'LOW',
        title: `${label(r.category)} vendor not yet secured`,
        detail: `“${r.event_name}” is ${r.days_until} day(s) away with no accepted ${label(r.category)} vendor.`,
        eventName: r.event_name,
        eventDate: r.event_date,
        daysUntil: r.days_until,
        score: 0,
      })
    }
  }

  for (const e of facts.eventsWithoutSpace) {
    if (e.days_until < 0 || e.days_until > proximity) continue
    risks.push({
      type: 'NO_SPACE',
      severity: e.days_until <= 3 ? 'HIGH' : e.days_until <= 7 ? 'MEDIUM' : 'LOW',
      title: 'Ceremony has no space assigned',
      detail: `“${e.event_name}” is ${e.days_until} day(s) away and isn’t booked into a venue space.`,
      eventName: e.event_name,
      eventDate: e.event_date,
      daysUntil: e.days_until,
      score: 0,
    })
  }

  for (const c of facts.pendingChanges) {
    if (c.days_until < 0) continue
    risks.push({
      type: 'PENDING_SCHEDULE_CHANGE',
      severity: c.days_until <= 7 ? 'HIGH' : 'MEDIUM',
      title: 'Schedule change awaiting acknowledgement',
      detail: `A proposed time change for “${c.event_name}” needs ${c.unacked} vendor acknowledgement(s).`,
      eventName: c.event_name,
      eventDate: c.event_date,
      daysUntil: c.days_until,
      score: 0,
    })
  }

  // severity dominates; among equals, sooner is worse
  for (const r of risks) r.score = WEIGHT[r.severity] * 1000 - r.daysUntil
  risks.sort((a, b) => b.score - a.score)
  return risks
}
