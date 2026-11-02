/** The VivahSync wordmark as letters: "Vivah" on paper, "Sync" in gold. */
export const WORDMARK = [...'Vivah']
  .map((ch) => ({ ch, gold: false }))
  .concat([...'Sync'].map((ch) => ({ ch, gold: true })))
