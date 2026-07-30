/**
 * "T−N days" until the first wedding day. `startDate` is a 'YYYY-MM-DD' string
 * anchored to the wedding's local (IST) calendar day, so we compare it against
 * today's IST calendar day — no time-of-day, no drift across the day boundary.
 */
export function daysOut(startDate?: string | null): number | null {
  if (!startDate) return null
  const todayIso = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }) // YYYY-MM-DD
  const a = Date.parse(`${todayIso}T00:00:00Z`)
  const b = Date.parse(`${startDate}T00:00:00Z`)
  if (Number.isNaN(a) || Number.isNaN(b)) return null
  return Math.round((b - a) / 86400000)
}

export function daysOutLabel(startDate?: string | null): string | null {
  const d = daysOut(startDate)
  if (d === null) return null
  if (d > 0) return `T−${d} days`
  if (d === 0) return 'Today'
  return 'In progress'
}
