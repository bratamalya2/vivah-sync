import Link from 'next/link'
import { redirect, notFound } from 'next/navigation'
import { getUserCached, getProjectCached } from '@/lib/context'
import {
  listEvents,
  listVendors,
  listProjectRequirements,
  listProjectBookings,
  type BookingRow,
} from '@vivahsync/db'
import { VENDOR_CATEGORIES, categoryLabel } from '@/lib/categories'
import PageHeader from '../../../_shell/PageHeader'
import {
  addRequirementAction,
  createBookingAction,
  transitionBookingAction,
} from './actions'

export const dynamic = 'force-dynamic'

function BookingActions({ projectId, b }: { projectId: string; b: BookingRow }) {
  const hidden = (
    <>
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="bookingId" value={b.id} />
    </>
  )
  const btn = (to: string, label: string, cls = 'mini') => (
    <form action={transitionBookingAction} className="inlineform">
      {hidden}
      <input type="hidden" name="toStatus" value={to} />
      <button className={cls} type="submit">
        {label}
      </button>
    </form>
  )

  if (b.status === 'DRAFT')
    return (
      <div className="actionrow">
        {btn('SENT', 'Send')}
        {btn('CANCELLED', 'Cancel', 'mini ghostmini')}
      </div>
    )
  if (b.status === 'SENT')
    return (
      <div className="actionrow">
        {btn('ACCEPTED', 'Accept')}
        <form action={transitionBookingAction} className="inlineform rejectform">
          {hidden}
          <input type="hidden" name="toStatus" value="REJECTED" />
          <input name="rejectionReason" placeholder="reason…" required />
          <button className="mini" type="submit">
            Reject
          </button>
        </form>
        {btn('CANCELLED', 'Cancel', 'mini ghostmini')}
      </div>
    )
  if (b.status === 'ACCEPTED')
    return (
      <div className="actionrow">
        {btn('CONFIRMED', 'Confirm')}
        {btn('CANCELLED', 'Cancel', 'mini ghostmini')}
      </div>
    )
  return null
}

export default async function ProjectVendorsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ err?: string }>
}) {
  const { id } = await params
  const { err } = await searchParams
  const user = await getUserCached()
  if (!user) redirect('/login')

  const project = await getProjectCached(user.id, id)
  if (!project) notFound()

  const [events, requirements, bookings, vendors] = await Promise.all([
    listEvents(user.id, id),
    listProjectRequirements(user.id, id),
    listProjectBookings(user.id, id),
    listVendors(user.id),
  ])

  const reqsByEvent = new Map<string, typeof requirements>()
  for (const r of requirements) {
    const arr = reqsByEvent.get(r.event_id) ?? []
    arr.push(r)
    reqsByEvent.set(r.event_id, arr)
  }
  const bookingsByReq = new Map<string, BookingRow[]>()
  for (const b of bookings) {
    const arr = bookingsByReq.get(b.requirement_id) ?? []
    arr.push(b)
    bookingsByReq.set(b.requirement_id, arr)
  }

  return (
    <main className="dash">
      <PageHeader kicker="Vendor requirements & booking lifecycle" title="Vendors" />

      {err && <p className="err banner">{err}</p>}

      <section className="dashbody">
        <div className="col-main">
          <div className="col-head">
            <h2>Requirements &amp; bookings</h2>
            <span className="count">{requirements.length}</span>
          </div>

          {requirements.length === 0 ? (
            <div className="empty">
              No vendor requirements yet. Add one on the right for a ceremony, then book a vendor
              against it.
            </div>
          ) : (
            <div className="timeline">
              {events
                .filter((e) => reqsByEvent.has(e.id))
                .map((e) => (
                  <div key={e.id} className="dayblock">
                    <div className="dayhead">
                      <span className="daynum">{e.name}</span>
                      <span className="daydate">{e.starts_at}</span>
                    </div>
                    {(reqsByEvent.get(e.id) ?? []).map((r) => (
                      <div key={r.id} className="reqblock">
                        <div className="reqhead">
                          <div>
                            <span className="reqcat">{categoryLabel(r.category)}</span>
                            <span className={`badge ff-${r.fulfillment_status.toLowerCase()}`}>
                              {r.fulfillment_status}
                            </span>
                          </div>
                          <div className="reqtimes">
                            {r.arrival_at.slice(11)}–{r.completion_at.slice(11)}
                          </div>
                        </div>
                        <div className="reqscope">{r.scope_notes}</div>

                        <div className="bookings">
                          {(bookingsByReq.get(r.id) ?? []).map((b) => (
                            <div key={b.id} className="bookingrow">
                              <span className="bvendor">{b.vendor_name}</span>
                              <span className={`badge st-${b.status.toLowerCase()}`}>{b.status}</span>
                              {b.status === 'REJECTED' && b.rejection_reason && (
                                <span className="brej">“{b.rejection_reason}”</span>
                              )}
                              <BookingActions projectId={id} b={b} />
                            </div>
                          ))}

                          {vendors.length > 0 && (
                            <form action={createBookingAction} className="inlineform addbooking">
                              <input type="hidden" name="projectId" value={id} />
                              <input type="hidden" name="requirementId" value={r.id} />
                              <select name="vendorId" defaultValue="" required>
                                <option value="" disabled>
                                  Book a vendor…
                                </option>
                                {vendors.map((v) => (
                                  <option key={v.id} value={v.id}>
                                    {v.name} · {categoryLabel(v.category)}
                                  </option>
                                ))}
                              </select>
                              <button className="mini" name="send" value="1" type="submit">
                                Send request
                              </button>
                              <button className="mini ghostmini" name="send" value="0" type="submit">
                                Draft
                              </button>
                            </form>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
            </div>
          )}
        </div>

        <aside className="col-side">
          <h3>Add requirement</h3>
          {events.length === 0 ? (
            <p className="muted">
              Schedule a ceremony first on the{' '}
              <Link href={`/dashboard/projects/${id}`}>run of show</Link>.
            </p>
          ) : vendors.length === 0 ? (
            <p className="muted">
              Tip: add vendors to your <Link href="/dashboard/vendors">roster</Link> so you can book
              them.
            </p>
          ) : null}
          {events.length > 0 && (
            <form action={addRequirementAction} className="newform">
              <input type="hidden" name="projectId" value={id} />
              <label>
                Ceremony
                <select name="eventId" required defaultValue="">
                  <option value="" disabled>
                    Select…
                  </option>
                  {events.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name} ({e.starts_at.slice(0, 10)})
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Category
                <select name="category" required defaultValue="">
                  <option value="" disabled>
                    Select…
                  </option>
                  {VENDOR_CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Scope of work
                <input name="scopeNotes" required placeholder="Full-day candid + traditional" />
              </label>
              <label>
                Date
                <input
                  name="date"
                  type="date"
                  required
                  min={project.start_date}
                  max={project.end_date}
                  defaultValue={project.start_date}
                />
              </label>
              <div className="row2">
                <label>
                  Arrival
                  <input name="arrivalTime" type="time" required defaultValue="16:00" />
                </label>
                <label>
                  Completion
                  <input name="completionTime" type="time" required defaultValue="23:00" />
                </label>
              </div>
              <button type="submit">Add requirement</button>
            </form>
          )}
        </aside>
      </section>
    </main>
  )
}
