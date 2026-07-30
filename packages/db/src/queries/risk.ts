// FR-801 fact gathering (RLS-scoped). Returns the raw operational facts; the
// pure computeRisks() in @vivahsync/core ranks them. days_until is computed in
// IST against now(), so "approaching" is relative to the real clock.

import { withUser } from '../withUser.js'

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

const DAYS_UNTIL =
  `((e.starts_at at time zone 'Asia/Kolkata')::date - (now() at time zone 'Asia/Kolkata')::date)`
const EVENT_DATE = `to_char(e.starts_at at time zone 'Asia/Kolkata', 'YYYY-MM-DD')`

export async function getRiskFacts(userId: string, projectId: string): Promise<RiskFacts> {
  return withUser(userId, async (tx) => {
    const requirements = (
      await tx.query<RiskFacts['requirements'][number]>(
        `select e.name as event_name, ${EVENT_DATE} as event_date, ${DAYS_UNTIL} as days_until,
                r.category::text as category, r.fulfillment_status::text as fulfillment_status
           from vendor_requirements r
           join events e on e.id = r.event_id
          where e.project_id = $1`,
        [projectId],
      )
    ).rows

    const eventsWithoutSpace = (
      await tx.query<RiskFacts['eventsWithoutSpace'][number]>(
        `select e.name as event_name, ${EVENT_DATE} as event_date, ${DAYS_UNTIL} as days_until
           from events e
          where e.project_id = $1
            and not exists (select 1 from space_bookings sb where sb.event_id = e.id)`,
        [projectId],
      )
    ).rows

    const pendingChanges = (
      await tx.query<RiskFacts['pendingChanges'][number]>(
        `select e.name as event_name, ${EVENT_DATE} as event_date, ${DAYS_UNTIL} as days_until,
                (select count(*) from change_acknowledgements a
                  where a.proposal_id = p.id and a.acknowledged = false)::int as unacked
           from schedule_change_proposals p
           join events e on e.id = p.event_id
          where e.project_id = $1 and p.status = 'PROPOSED'`,
        [projectId],
      )
    ).rows

    return { requirements, eventsWithoutSpace, pendingChanges }
  })
}

// ---- FT-040: cross-project action summary for the main dashboard -----------

export interface DashboardFacts {
  requirements: (RiskFacts['requirements'][number] & { project_id: string; project_name: string })[]
  eventsWithoutSpace: (RiskFacts['eventsWithoutSpace'][number] & {
    project_id: string
    project_name: string
  })[]
  pendingChanges: (RiskFacts['pendingChanges'][number] & {
    project_id: string
    project_name: string
  })[]
  upcomingEvents: {
    project_id: string
    project_name: string
    event_name: string
    event_date: string
    days_until: number
  }[]
}

const PROJ = `p.id as project_id, p.name as project_name`

/** All risk facts across every wedding the planner can access, in a few queries. */
export async function getDashboardFacts(userId: string, upcomingWindow = 14): Promise<DashboardFacts> {
  return withUser(userId, async (tx) => {
    const requirements = (
      await tx.query<DashboardFacts['requirements'][number]>(
        `select ${PROJ}, e.name as event_name, ${EVENT_DATE} as event_date, ${DAYS_UNTIL} as days_until,
                r.category::text as category, r.fulfillment_status::text as fulfillment_status
           from vendor_requirements r
           join events e on e.id = r.event_id
           join projects p on p.id = e.project_id`,
      )
    ).rows

    const eventsWithoutSpace = (
      await tx.query<DashboardFacts['eventsWithoutSpace'][number]>(
        `select ${PROJ}, e.name as event_name, ${EVENT_DATE} as event_date, ${DAYS_UNTIL} as days_until
           from events e
           join projects p on p.id = e.project_id
          where not exists (select 1 from space_bookings sb where sb.event_id = e.id)`,
      )
    ).rows

    const pendingChanges = (
      await tx.query<DashboardFacts['pendingChanges'][number]>(
        `select ${PROJ}, e.name as event_name, ${EVENT_DATE} as event_date, ${DAYS_UNTIL} as days_until,
                (select count(*) from change_acknowledgements a
                  where a.proposal_id = scp.id and a.acknowledged = false)::int as unacked
           from schedule_change_proposals scp
           join events e on e.id = scp.event_id
           join projects p on p.id = e.project_id
          where scp.status = 'PROPOSED'`,
      )
    ).rows

    const upcomingEvents = (
      await tx.query<DashboardFacts['upcomingEvents'][number]>(
        `select ${PROJ}, e.name as event_name, ${EVENT_DATE} as event_date, ${DAYS_UNTIL} as days_until
           from events e
           join projects p on p.id = e.project_id
          where ${DAYS_UNTIL} between 0 and $1
          order by e.starts_at asc
          limit 25`,
        [upcomingWindow],
      )
    ).rows

    return { requirements, eventsWithoutSpace, pendingChanges, upcomingEvents }
  })
}
