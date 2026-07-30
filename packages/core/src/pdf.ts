// Playbook PDF renderer. Pure Node (pdfkit) — NO headless browser, so it stays
// lean enough to run in the worker on Render. Deliberately importable only via
// '@vivahsync/core/pdf' so the PDF engine never enters the Next.js web bundle
// (the web app reads finished bytes from the DB; only the worker renders).

import PDFDocument from 'pdfkit'
import { brand } from './brand.js'

// Structural shape of a playbook snapshot (mirrors @vivahsync/db PlaybookSnapshot).
export interface PlaybookSnapshotLike {
  project: {
    name: string
    city: string
    start_date: string
    end_date: string
    expected_guest_count: number | null
    status: string
  }
  generated_at: string
  is_draft: boolean
  pending_changes: number
  days: {
    date: string
    day_index: number
    events: {
      name: string
      starts_at: string
      ends_at: string
      setup_minutes: number
      teardown_minutes: number
      expected_guest_count: number | null
      spaces: { venue: string; space: string }[]
      overrides: { rule_key: string; value: string; rationale: string }[]
      vendors: {
        category: string
        scope: string
        arrival: string
        completion: string
        fulfillment: string
        vendor: { name: string; phone: string | null; status: string } | null
      }[]
    }[]
  }[]
}

function prettyCategory(c: string): string {
  return c
    .toLowerCase()
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

export function renderPlaybookPdf(
  snapshot: PlaybookSnapshotLike,
  meta: { version: number },
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50, bufferPages: true })
    const chunks: Buffer[] = []
    doc.on('data', (c: Buffer) => chunks.push(c))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    const maroon = brand.maroon
    const gold = brand.gold
    const muted = '#6b605b'

    // --- header ---
    doc.fillColor(maroon).fontSize(22).font('Helvetica-Bold').text('VivahSync')
    doc.fillColor('#111').fontSize(16).text('Operational Playbook')
    doc.moveDown(0.3)
    doc.fillColor('#111').fontSize(18).font('Helvetica-Bold').text(snapshot.project.name)
    doc
      .fillColor(muted)
      .fontSize(10)
      .font('Helvetica')
      .text(
        `${snapshot.project.city}  ·  ${snapshot.project.start_date} → ${snapshot.project.end_date}` +
          (snapshot.project.expected_guest_count
            ? `  ·  ${snapshot.project.expected_guest_count} guests`
            : ''),
      )
    doc.text(
      `Version ${meta.version}  ·  generated ${snapshot.generated_at} IST` +
        (snapshot.is_draft ? `  ·  DRAFT (${snapshot.pending_changes} change(s) pending)` : ''),
    )
    doc
      .moveTo(50, doc.y + 6)
      .lineTo(545, doc.y + 6)
      .strokeColor(gold)
      .stroke()
    doc.moveDown(1)

    // --- days ---
    for (const day of snapshot.days) {
      doc
        .fillColor(maroon)
        .fontSize(13)
        .font('Helvetica-Bold')
        .text(`Day ${day.day_index + 1}  ·  ${day.date}`)
      doc.moveDown(0.3)

      if (day.events.length === 0) {
        doc.fillColor(muted).fontSize(10).font('Helvetica-Oblique').text('No ceremonies')
        doc.moveDown(0.6)
        continue
      }

      for (const e of day.events) {
        doc
          .fillColor('#111')
          .fontSize(11)
          .font('Helvetica-Bold')
          .text(`${e.starts_at}–${e.ends_at}   ${e.name}`)
        const spaceLine =
          e.spaces.length > 0
            ? e.spaces.map((s) => `${s.venue} · ${s.space}`).join(', ')
            : 'No space assigned'
        doc
          .fillColor(muted)
          .fontSize(9.5)
          .font('Helvetica')
          .text(
            spaceLine +
              (e.expected_guest_count ? `  ·  ${e.expected_guest_count} guests` : '') +
              (e.setup_minutes || e.teardown_minutes
                ? `  ·  setup +${e.setup_minutes}m / teardown +${e.teardown_minutes}m`
                : ''),
          )

        for (const o of e.overrides) {
          doc
            .fillColor('#7a5b0c')
            .fontSize(9.5)
            .font('Helvetica-Oblique')
            .text(`   ⚑ Exception — ${prettyCategory(o.rule_key)}: ${o.value}  (${o.rationale})`, {
              indent: 6,
            })
        }

        for (const v of e.vendors) {
          const line = v.vendor
            ? `${prettyCategory(v.category)}: ${v.vendor.name} [${v.vendor.status}]  ${v.arrival}–${v.completion}` +
              (v.vendor.phone ? `  ${v.vendor.phone}` : '')
            : `${prettyCategory(v.category)}: UNASSIGNED  (${v.arrival}–${v.completion})`
          doc.fillColor('#333').fontSize(9.5).font('Helvetica').text(`   • ${line}`, { indent: 6 })
        }
        doc.moveDown(0.6)
      }
      doc.moveDown(0.4)
    }

    // --- footer on every page ---
    const range = doc.bufferedPageRange()
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(range.start + i)
      doc
        .fillColor(muted)
        .fontSize(8)
        .font('Helvetica')
        .text(
          `VivahSync operational playbook — ${snapshot.project.name} — v${meta.version}` +
            (snapshot.is_draft ? ' (DRAFT)' : '') +
            `    ·    page ${i + 1} of ${range.count}`,
          50,
          800,
          { align: 'center', width: 495, lineBreak: false },
        )
    }

    doc.end()
  })
}
