// Quick post-seed sanity check via the real (RLS-scoped) data-access functions.
// Run:  node --import tsx packages/db/scripts/verify-seed.ts

import {
  withSystem, closePools,
  listProjects, listEvents, getRiskFacts, listPlaybooks, listRenderStatuses,
  listProjectRequirements, familyRunsheet,
} from '@vivahsync/db'
import { computeRisks } from '@vivahsync/core'

async function idFor(email: string): Promise<string> {
  const r = await withSystem((tx) => tx.query<{ id: string }>('select id from auth.users where lower(email)=lower($1)', [email]))
  return r.rows[0]?.id
}

const priya = await idFor('priya@vivahsync.dev')
const aunt = await idFor('aunt@vivahsync.dev')

const projects = await listProjects(priya)
const p = projects.find((x) => x.name.includes('Mehra'))!
const [events, reqs, pbs, renders] = await Promise.all([
  listEvents(priya, p.id),
  listProjectRequirements(priya, p.id),
  listPlaybooks(priya, p.id),
  listRenderStatuses(priya, p.id),
])
const risks = computeRisks(await getRiskFacts(priya, p.id), { proximityDays: 14 })
const rs = familyRunsheet(aunt, p.id).catch(() => null)

console.log(`\nPlanner (priya) sees ${projects.length} wedding(s).`)
console.log(`  ${p.name}: ${events.length} ceremonies, ${reqs.length} vendor requirements`)
console.log('  requirement fulfillment:', reqs.reduce((m, r) => { m[r.fulfillment_status] = (m[r.fulfillment_status] ?? 0) + 1; return m }, {} as Record<string, number>))
console.log(`  playbook v${pbs[0]?.version}  ·  PDF ${renders[0]?.status}`)
console.log(`  risk dashboard: ${risks.length} item(s) — ` + risks.map((r) => `${r.severity}/${r.type}`).join(', '))

const fam = await rs
console.log(`\nFamily (aunt) redacted run-sheet: ${fam ? fam.days.flatMap((d) => d.events).length + ' ceremonies visible' : 'NO ACCESS'}`)
console.log('')

await closePools()
process.exit(0)
