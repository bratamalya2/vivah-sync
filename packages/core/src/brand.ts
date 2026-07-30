// VivahSync brand tokens. Single source of truth for colour, mirrored into CSS
// variables in apps/web/app/globals.css.
//
// Accessibility note: brand gold (#C8952C) on paper (#F7F5F2) is ~2.5:1 — it
// FAILS WCAG AA (4.5:1) for body text. Use `goldText` (a darkened gold) for
// text on light backgrounds; reserve raw `gold` for large graphics, borders,
// and fills only.

export const brand = {
  gold: '#C8952C',
  goldText: '#8A6410', // AA-safe on paper for body text
  maroon: '#7A0C1F',
  paper: '#F7F5F2',
  ink: '#241A17',
  inkMuted: '#6B605B',
} as const

export type BrandColor = keyof typeof brand

/** Indian-numbering currency formatter (₹3,20,000 not 320,000). */
export const inr = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
})

export function formatInr(amountRupees: number): string {
  return inr.format(amountRupees)
}
