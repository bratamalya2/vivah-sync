/* eslint-disable @next/next/no-img-element */
import { redirect } from 'next/navigation'
import { getUser } from '@/lib/auth'
import {
  getMyContext,
  claimVendorInvitations,
  vendorBookings,
  vendorEvidence,
  type VendorBooking,
} from '@vivahsync/db'
import { categoryLabel } from '@/lib/categories'
import AppShell from '@/app/dashboard/_shell/AppShell'
import PageHeader from '@/app/dashboard/_shell/PageHeader'
import SubmitButton from '@/app/_components/SubmitButton'
import { respondBookingAction, acknowledgeChangeAction, uploadVendorEvidenceAction } from './actions'

export const dynamic = 'force-dynamic'

const STATUS: Record<string, { label: string; cls: string }> = {
  SENT: { label: 'Awaiting your response', cls: 'st-sent' },
  ACCEPTED: { label: 'Accepted', cls: 'st-accepted' },
  CONFIRMED: { label: 'Confirmed', cls: 'st-confirmed' },
  REJECTED: { label: 'Declined', cls: 'st-rejected' },
  CANCELLED: { label: 'Cancelled', cls: 'st-cancelled' },
}

export default async function VendorPortal({
  searchParams,
}: {
  searchParams: Promise<{ err?: string; msg?: string }>
}) {
  const { err, msg } = await searchParams
  const user = await getUser()
  if (!user) redirect('/login')

  await claimVendorInvitations(user.id) // idempotent; provisions the vendor org on first visit
  const ctx = await getMyContext(user.id)
  if (!ctx.org) redirect('/onboarding')
  if (ctx.org.type !== 'VENDOR') redirect('/home')

  const [bookings, evidence] = await Promise.all([vendorBookings(user.id), vendorEvidence(user.id)])
  const pending = bookings.filter((b) => b.status === 'SENT' || b.pending_ack_id).length
  const evidenceByEvent = new Map<string, typeof evidence>()
  for (const m of evidence) {
    const arr = evidenceByEvent.get(m.event_id) ?? []
    arr.push(m)
    evidenceByEvent.set(m.event_id, arr)
  }

  const byProject = new Map<
    string,
    { name: string; city: string; dates: string; rows: VendorBooking[] }
  >()
  for (const b of bookings) {
    let g = byProject.get(b.project_id)
    if (!g) {
      g = { name: b.project_name, city: b.city, dates: `${b.start_date} → ${b.end_date}`, rows: [] }
      byProject.set(b.project_id, g)
    }
    g.rows.push(b)
  }

  return (
    <AppShell scope="vendor" user={user} org={ctx.org} pending={pending}>
      <main className="dash">
        <PageHeader kicker="Vendor portal · your assignments only" title="My bookings" />

        {err && <p className="err banner">{err}</p>}
        {msg && <p className="ok banner">{msg}</p>}

        {bookings.length === 0 ? (
          <div className="empty" style={{ marginTop: '1.5rem' }}>
            No bookings assigned to you yet. When a planner sends you a booking request, it will
            appear here for you to accept or decline.
          </div>
        ) : (
          <div className="timeline" style={{ marginTop: '1.5rem' }}>
            {[...byProject.values()].map((proj) => (
              <div key={proj.name} className="dayblock">
                <div className="dayhead">
                  <span className="daynum">{proj.name}</span>
                  <span className="daydate">
                    {proj.city} · {proj.dates}
                  </span>
                </div>
                <ul className="evlist">
                  {proj.rows.map((b) => {
                    const st = STATUS[b.status] ?? { label: b.status, cls: 'st-draft' }
                    const media = evidenceByEvent.get(b.event_id) ?? []
                    return (
                      <li key={b.booking_id} className="evitem">
                        <div className="evtime">
                          {b.event_date}
                          <br />
                          {b.starts}–{b.ends}
                        </div>
                        <div className="evbody" style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.5rem' }}>
                            <span className="evname">{b.event_name}</span>
                            <span className={`badge ${st.cls}`} style={{ position: 'static' }}>
                              {st.label}
                            </span>
                          </div>
                          <div className="evmeta">
                            {categoryLabel(b.category)} · {b.scope_notes}
                          </div>
                          <div className="reqtimes">
                            Arrive {b.arrival} → wrap {b.completion}
                            {b.spaces ? ` · at ${b.spaces}` : ''}
                          </div>
                          {b.status === 'REJECTED' && b.rejection_reason && (
                            <div className="brej">You declined: {b.rejection_reason}</div>
                          )}

                          {b.pending_ack_id && (
                            <div className="warn banner" style={{ marginTop: '0.55rem' }}>
                              The planner has proposed moving this ceremony to{' '}
                              <strong>
                                {b.proposed_start}–{b.proposed_end}
                              </strong>
                              . Please acknowledge so it can be applied.
                              <form action={acknowledgeChangeAction} style={{ marginTop: '0.45rem' }}>
                                <input type="hidden" name="ackId" value={b.pending_ack_id} />
                                <SubmitButton className="mini" pendingLabel="Saving…">
                                  Acknowledge change
                                </SubmitButton>
                              </form>
                            </div>
                          )}

                          {b.status === 'SENT' && (
                            <div className="actionrow" style={{ marginTop: '0.55rem' }}>
                              <form action={respondBookingAction} className="inlineform">
                                <input type="hidden" name="bookingId" value={b.booking_id} />
                                <input type="hidden" name="accept" value="accept" />
                                <SubmitButton className="mini" pendingLabel="Accepting…">
                                  Accept
                                </SubmitButton>
                              </form>
                              <form action={respondBookingAction} className="inlineform rejectform">
                                <input type="hidden" name="bookingId" value={b.booking_id} />
                                <input type="hidden" name="accept" value="decline" />
                                <input name="reason" placeholder="reason to decline…" required />
                                <SubmitButton className="mini ghostmini" pendingLabel="Declining…">
                                  Decline
                                </SubmitButton>
                              </form>
                            </div>
                          )}

                          {(b.status === 'ACCEPTED' || b.status === 'CONFIRMED') && (
                            <details className="reschedule" style={{ marginTop: '0.55rem' }}>
                              <summary>Proof of setup ({media.length})</summary>
                              {media.length > 0 && (
                                <ul className="evidencelist">
                                  {media.map((m) => (
                                    <li key={m.id}>
                                      <a href={`/media/${m.id}`} target="_blank" rel="noopener noreferrer">
                                        {m.content_type?.startsWith('image/') ? (
                                          <img
                                            src={`/media/${m.id}`}
                                            alt={m.file_name ?? 'evidence'}
                                            className="evthumb"
                                          />
                                        ) : (
                                          <span className="evfile">📎 {m.file_name ?? 'file'}</span>
                                        )}
                                      </a>
                                      <span className="muted evup">{m.created_at}</span>
                                    </li>
                                  ))}
                                </ul>
                              )}
                              <form
                                action={uploadVendorEvidenceAction}
                                className="reschedform"
                                style={{ marginTop: '0.4rem' }}
                              >
                                <input type="hidden" name="eventId" value={b.event_id} />
                                <input type="file" name="file" accept="image/*,video/*" required />
                                <SubmitButton className="mini" pendingLabel="Uploading…">
                                  Upload proof
                                </SubmitButton>
                              </form>
                            </details>
                          )}
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </div>
            ))}
          </div>
        )}
      </main>
    </AppShell>
  )
}
