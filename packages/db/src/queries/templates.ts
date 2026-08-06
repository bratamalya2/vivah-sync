// "Golden Path" wedding templates — reduce cold-start friction by pre-populating
// a new wedding with a standard set of ceremonies + default vendor requirement
// categories. Planners then rapidly delete what they don't need rather than
// building the structure from scratch. Ceremonies that fall beyond the wedding's
// date range are skipped. All inserts go through the RLS-enforced app path and
// the same triggers as manual entry, so a template can never create an invalid
// plan.

import { withUser } from '../withUser.js'
import type { VendorCategory } from './vendors.js'

export interface TemplateCeremony {
  name: string
  dayOffset: number // 0 = the wedding's start date
  startTime: string // 'HH:MM' (IST)
  endTime: string
  setupMinutes: number
  teardownMinutes: number
  categories: VendorCategory[]
}
export interface WeddingTemplate {
  key: string
  label: string
  description: string
  ceremonies: TemplateCeremony[]
}

const CAT = {
  photo: 'PHOTOGRAPHY' as VendorCategory,
  cater: 'CATERING' as VendorCategory,
  decor: 'DECOR' as VendorCategory,
  dj: 'MUSIC_DJ' as VendorCategory,
  makeup: 'MAKEUP' as VendorCategory,
  mehndi: 'MEHNDI' as VendorCategory,
  priest: 'PRIEST_PANDIT' as VendorCategory,
}

export const WEDDING_TEMPLATES: WeddingTemplate[] = [
  {
    key: '3day-destination',
    label: 'Standard 3-Day Destination',
    description: 'Mehndi & welcome, Haldi & Sangeet, the Wedding & Reception across three days.',
    ceremonies: [
      { name: 'Mehndi', dayOffset: 0, startTime: '16:00', endTime: '20:00', setupMinutes: 60, teardownMinutes: 30, categories: [CAT.photo, CAT.mehndi, CAT.decor] },
      { name: 'Welcome Dinner', dayOffset: 0, startTime: '20:30', endTime: '23:00', setupMinutes: 45, teardownMinutes: 30, categories: [CAT.photo, CAT.cater] },
      { name: 'Haldi', dayOffset: 1, startTime: '09:00', endTime: '12:00', setupMinutes: 45, teardownMinutes: 30, categories: [CAT.photo, CAT.makeup] },
      { name: 'Sangeet', dayOffset: 1, startTime: '19:00', endTime: '23:00', setupMinutes: 120, teardownMinutes: 60, categories: [CAT.photo, CAT.dj, CAT.decor, CAT.cater] },
      { name: 'Wedding', dayOffset: 2, startTime: '10:00', endTime: '14:00', setupMinutes: 120, teardownMinutes: 60, categories: [CAT.photo, CAT.priest, CAT.decor, CAT.cater, CAT.makeup] },
      { name: 'Reception', dayOffset: 2, startTime: '19:00', endTime: '23:00', setupMinutes: 90, teardownMinutes: 60, categories: [CAT.photo, CAT.cater, CAT.decor, CAT.dj] },
    ],
  },
  {
    key: '2day-traditional',
    label: 'Traditional 2-Day',
    description: 'Haldi, Mehndi & Sangeet on day one; the Wedding & Reception on day two.',
    ceremonies: [
      { name: 'Haldi', dayOffset: 0, startTime: '09:00', endTime: '12:00', setupMinutes: 45, teardownMinutes: 30, categories: [CAT.photo, CAT.makeup] },
      { name: 'Mehndi', dayOffset: 0, startTime: '14:00', endTime: '17:00', setupMinutes: 45, teardownMinutes: 30, categories: [CAT.photo, CAT.mehndi] },
      { name: 'Sangeet', dayOffset: 0, startTime: '19:00', endTime: '23:00', setupMinutes: 120, teardownMinutes: 60, categories: [CAT.photo, CAT.dj, CAT.decor, CAT.cater] },
      { name: 'Wedding', dayOffset: 1, startTime: '10:00', endTime: '14:00', setupMinutes: 120, teardownMinutes: 60, categories: [CAT.photo, CAT.priest, CAT.decor, CAT.cater, CAT.makeup] },
      { name: 'Reception', dayOffset: 1, startTime: '19:00', endTime: '23:00', setupMinutes: 90, teardownMinutes: 60, categories: [CAT.photo, CAT.cater, CAT.decor, CAT.dj] },
    ],
  },
  {
    key: '1day-local',
    label: '1-Day Local',
    description: 'A single day: Haldi, the Wedding, and an evening Reception.',
    ceremonies: [
      { name: 'Haldi', dayOffset: 0, startTime: '09:00', endTime: '11:00', setupMinutes: 30, teardownMinutes: 30, categories: [CAT.photo, CAT.makeup] },
      { name: 'Wedding', dayOffset: 0, startTime: '11:30', endTime: '14:30', setupMinutes: 90, teardownMinutes: 45, categories: [CAT.photo, CAT.priest, CAT.decor, CAT.cater] },
      { name: 'Reception', dayOffset: 0, startTime: '19:00', endTime: '23:00', setupMinutes: 90, teardownMinutes: 60, categories: [CAT.photo, CAT.cater, CAT.decor, CAT.dj] },
    ],
  },
]

/** Lightweight list for the picker (no ceremony detail). */
export const WEDDING_TEMPLATE_OPTIONS = WEDDING_TEMPLATES.map((t) => ({
  key: t.key,
  label: t.label,
  description: t.description,
  ceremonies: t.ceremonies.length,
}))

function isoAddDays(iso: string, days: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10)
}

/**
 * Deep-copy a template into a freshly-created project: its ceremonies + default
 * vendor requirement categories. Ceremonies past the wedding's last day are
 * skipped. Runs in one transaction; every insert still fires the timeline/vendor
 * triggers, so nothing invalid is written.
 */
export async function applyWeddingTemplate(
  userId: string,
  input: { projectId: string; templateKey: string },
): Promise<{ ceremonies: number; requirements: number }> {
  const tmpl = WEDDING_TEMPLATES.find((t) => t.key === input.templateKey)
  if (!tmpl) return { ceremonies: 0, requirements: 0 }

  return withUser(userId, async (tx) => {
    const proj = await tx.query<{ start_date: string; end_date: string }>(
      `select to_char(start_date, 'YYYY-MM-DD') as start_date,
              to_char(end_date, 'YYYY-MM-DD') as end_date
         from projects where id = $1`,
      [input.projectId],
    )
    if (proj.rows.length === 0) return { ceremonies: 0, requirements: 0 }
    const { start_date, end_date } = proj.rows[0]
    const dayCount =
      Math.round((Date.parse(`${end_date}T00:00:00Z`) - Date.parse(`${start_date}T00:00:00Z`)) / 86_400_000) + 1

    let ceremonies = 0
    let requirements = 0
    for (const c of tmpl.ceremonies) {
      if (c.dayOffset >= dayCount) continue // beyond this wedding's dates
      const date = isoAddDays(start_date, c.dayOffset)
      const startsAt = `${date}T${c.startTime}:00+05:30`
      const endsAt = `${date}T${c.endTime}:00+05:30`
      const ev = await tx.query<{ id: string }>(
        `insert into events
           (project_id, name, starts_at, ends_at, setup_minutes, teardown_minutes,
            expected_guest_count, primary_owner_id)
         values ($1, $2, $3::timestamptz, $4::timestamptz, $5, $6, null, auth.uid())
         returning id`,
        [input.projectId, c.name, startsAt, endsAt, c.setupMinutes, c.teardownMinutes],
      )
      ceremonies += 1
      for (const cat of c.categories) {
        await tx.query(
          `insert into vendor_requirements (event_id, category, scope_notes, arrival_at, completion_at)
           values ($1, $2::vendor_category, $3, $4::timestamptz, $5::timestamptz)`,
          [ev.rows[0].id, cat, 'To be finalised', startsAt, endsAt],
        )
        requirements += 1
      }
    }
    return { ceremonies, requirements }
  })
}
