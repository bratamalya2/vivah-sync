import Link from 'next/link'
import { redirect, notFound } from 'next/navigation'
import { getUserCached, getProjectCached } from '@/lib/context'
import {
  listDays,
  listEvents,
  listSpaces,
  listProposals,
  listProjectOverrides,
  listProjectEvidence,
} from '@vivahsync/db'
import ScheduleForm from './ScheduleForm'
import PageHeader from '../../_shell/PageHeader'
import {
  rescheduleAction,
  acknowledgeAction,
  finalizeAction,
  cancelProposalAction,
  addOverrideAction,
  editEventAction,
  deleteEventAction,
  setEventSpacesAction,
  uploadEvidenceAction,
} from './actions'

const RULE_KEYS: { value: string; label: string }[] = [
  { value: 'ACCESS_CLOSE', label: 'Access close time' },
  { value: 'ACCESS_OPEN', label: 'Access open time' },
  { value: 'NOISE_CURFEW', label: 'Noise curfew' },
  { value: 'OTHER', label: 'Other rule' },
]
const ruleLabel = (v: string) => RULE_KEYS.find((r) => r.value === v)?.label ?? v

export const dynamic = 'force-dynamic'

export default async function ProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ err?: string; msg?: string; prevented?: string }>
}) {
  const { id } = await params
  const { err, msg, prevented } = await searchParams
  const user = await getUserCached()
  if (!user) redirect('/login')

  const project = await getProjectCached(user.id, id)
  if (!project) notFound()

  const [days, events, spaces, proposals, overrides, evidence] = await Promise.all([
    listDays(user.id, id),
    listEvents(user.id, id),
    listSpaces(user.id),
    listProposals(user.id, id),
    listProjectOverrides(user.id, id),
    listProjectEvidence(user.id, id),
  ])
  const overridesByEvent = new Map<string, typeof overrides>()
  for (const o of overrides) {
    const arr = overridesByEvent.get(o.event_id) ?? []
    arr.push(o)
    overridesByEvent.set(o.event_id, arr)
  }
  const evidenceByEvent = new Map<string, typeof evidence>()
  for (const m of evidence) {
    const arr = evidenceByEvent.get(m.entity_id) ?? []
    arr.push(m)
    evidenceByEvent.set(m.entity_id, arr)
  }
  const eventsByDate = new Map<string, typeof events>()
  for (const e of events) {
    const date = e.starts_at.slice(0, 10)
    const arr = eventsByDate.get(date) ?? []
    arr.push(e)
    eventsByDate.set(date, arr)
  }
  const pending = proposals.filter((p) => p.status === 'PROPOSED')

  const spaceOptions = spaces.map((sp) => ({
    id: sp.id,
    label: `${sp.venue_name} — ${sp.name}${sp.legal_max_capacity != null ? ` (max ${sp.legal_max_capacity})` : ''}`,
  }))

  return (
    <main className="dash">
      <PageHeader kicker="Run of show · computed live" title={project.name} />

      <div className="projsub">
        {project.city} · {project.start_date} → {project.end_date}
        {project.expected_guest_count ? ` · ${project.expected_guest_count} guests` : ''} ·{' '}
        <span className={`badge ${project.status.toLowerCase()}`}>{project.status}</span>
      </div>

      {prevented && <p className="prevented banner">{prevented}</p>}
      {err && <p className="err banner">{err}</p>}
      {msg && <p className="ok banner">{msg}</p>}

      {pending.length > 0 && (
        <section className="changes">
          <h2>Pending schedule changes</h2>
          {pending.map((p) => {
            const allAcked = p.acks.every((a) => a.acknowledged)
            const waiting = p.acks.filter((a) => !a.acknowledged).length
            return (
              <div key={p.id} className="changecard">
                <div className="changehead">
                  <strong>{p.event_name}</strong>
                  <span className="changetimes">
                    <s>
                      {p.current_start} → {p.current_end.slice(11)}
                    </s>{' '}
                    ⟶ {p.proposed_start} → {p.proposed_end.slice(11)}
                  </span>
                </div>
                <div className="acks">
                  {p.acks.map((a) => (
                    <div key={a.id} className="ackrow">
                      <span className="bvendor">{a.vendor_name}</span>
                      {a.acknowledged ? (
                        <span className="badge st-accepted">Acknowledged</span>
                      ) : (
                        <form action={acknowledgeAction} className="inlineform">
                          <input type="hidden" name="projectId" value={id} />
                          <input type="hidden" name="ackId" value={a.id} />
                          <button className="mini" type="submit">
                            Record acknowledgement
                          </button>
                        </form>
                      )}
                    </div>
                  ))}
                </div>
                <div className="actionrow">
                  {allAcked ? (
                    <form action={finalizeAction} className="inlineform">
                      <input type="hidden" name="projectId" value={id} />
                      <input type="hidden" name="proposalId" value={p.id} />
                      <button className="mini" type="submit">
                        Apply change
                      </button>
                    </form>
                  ) : (
                    <span className="muted">Waiting on {waiting} acknowledgement(s)</span>
                  )}
                  <form action={cancelProposalAction} className="inlineform">
                    <input type="hidden" name="projectId" value={id} />
                    <input type="hidden" name="proposalId" value={p.id} />
                    <button className="mini ghostmini" type="submit">
                      Cancel proposal
                    </button>
                  </form>
                </div>
              </div>
            )
          })}
        </section>
      )}

      <section className="dashbody">
        <div className="col-main">
          <div className="col-head">
            <h2>Run of show</h2>
            <span className="count">
              {events.length} {events.length === 1 ? 'ceremony' : 'ceremonies'}
            </span>
          </div>

          <div className="timeline">
            {days.map((d) => {
              const dayEvents = eventsByDate.get(d.day_date) ?? []
              return (
                <div key={d.day_date} className="dayblock">
                  <div className="dayhead">
                    <span className="daynum">Day {d.day_index + 1}</span>
                    <span className="daydate">{d.day_date}</span>
                  </div>
                  {dayEvents.length === 0 ? (
                    <div className="dayempty">No ceremonies</div>
                  ) : (
                    <ul className="evlist">
                      {dayEvents.map((e) => (
                        <li key={e.id} className="evitem">
                          <div className="evtime">
                            {e.starts_at.slice(11)}–{e.ends_at.slice(11)}
                          </div>
                          <div className="evbody">
                            <div className="evname">{e.name}</div>
                            <div className="evmeta">
                              {e.spaces.length > 0
                                ? e.spaces.map((sp) => `${sp.venue} · ${sp.space}`).join(', ')
                                : 'No space assigned'}
                              {e.expected_guest_count ? ` · ${e.expected_guest_count} guests` : ''}
                              {e.setup_minutes || e.teardown_minutes
                                ? ` · +${e.setup_minutes}/${e.teardown_minutes}m`
                                : ''}
                            </div>
                            <details className="reschedule">
                              <summary>Reschedule</summary>
                              <form action={rescheduleAction} className="reschedform">
                                <input type="hidden" name="projectId" value={id} />
                                <input type="hidden" name="eventId" value={e.id} />
                                <input
                                  name="date"
                                  type="date"
                                  required
                                  min={project.start_date}
                                  max={project.end_date}
                                  defaultValue={e.starts_at.slice(0, 10)}
                                />
                                <input name="startTime" type="time" required defaultValue={e.starts_at.slice(11)} />
                                <input name="endTime" type="time" required defaultValue={e.ends_at.slice(11)} />
                                <button className="mini" type="submit">
                                  Save
                                </button>
                              </form>
                            </details>
                            <details className="reschedule">
                              <summary>Edit details</summary>
                              <form action={editEventAction} className="reschedform">
                                <input type="hidden" name="projectId" value={id} />
                                <input type="hidden" name="eventId" value={e.id} />
                                <input name="name" required defaultValue={e.name} placeholder="name" />
                                <input
                                  name="guestCount"
                                  type="number"
                                  min={0}
                                  defaultValue={e.expected_guest_count ?? ''}
                                  placeholder="guests"
                                />
                                <input name="setupMinutes" type="number" min={0} defaultValue={e.setup_minutes} title="setup mins" />
                                <input name="teardownMinutes" type="number" min={0} defaultValue={e.teardown_minutes} title="teardown mins" />
                                <button className="mini" type="submit">
                                  Save
                                </button>
                              </form>
                            </details>
                            <details className="reschedule">
                              <summary>Spaces ({e.spaces.length})</summary>
                              {spaces.length === 0 ? (
                                <p className="muted">
                                  <Link href="/dashboard/venues">Add venues &amp; spaces</Link> first.
                                </p>
                              ) : (
                                <form action={setEventSpacesAction} className="reschedform spacesform">
                                  <input type="hidden" name="projectId" value={id} />
                                  <input type="hidden" name="eventId" value={e.id} />
                                  <div className="spacechecks">
                                    {spaces.map((sp) => (
                                      <label key={sp.id} className="spacecheck">
                                        <input
                                          type="checkbox"
                                          name="spaceId"
                                          value={sp.id}
                                          defaultChecked={e.spaces.some((es) => es.space_id === sp.id)}
                                        />
                                        {sp.venue_name} · {sp.name}
                                        {sp.legal_max_capacity != null ? ` (max ${sp.legal_max_capacity})` : ''}
                                      </label>
                                    ))}
                                  </div>
                                  <button className="mini" type="submit">
                                    Save spaces
                                  </button>
                                </form>
                              )}
                            </details>
                            <form action={deleteEventAction} className="inlineform">
                              <input type="hidden" name="projectId" value={id} />
                              <input type="hidden" name="eventId" value={e.id} />
                              <button className="mini ghostmini" type="submit">
                                Delete ceremony
                              </button>
                            </form>
                            {(overridesByEvent.get(e.id) ?? []).length > 0 && (
                              <ul className="overrides">
                                {(overridesByEvent.get(e.id) ?? []).map((o) => (
                                  <li key={o.id}>
                                    <span className="ovkey">{ruleLabel(o.rule_key)}:</span>{' '}
                                    {o.override_value}
                                    <span className="ovrat"> — {o.rationale}</span>
                                  </li>
                                ))}
                              </ul>
                            )}
                            <details className="reschedule">
                              <summary>Venue exception</summary>
                              <form action={addOverrideAction} className="reschedform">
                                <input type="hidden" name="projectId" value={id} />
                                <input type="hidden" name="eventId" value={e.id} />
                                <select name="ruleKey" required defaultValue="ACCESS_CLOSE">
                                  {RULE_KEYS.map((rk) => (
                                    <option key={rk.value} value={rk.value}>
                                      {rk.label}
                                    </option>
                                  ))}
                                </select>
                                <input name="overrideValue" required placeholder="e.g. 02:00" />
                                <input
                                  name="rationale"
                                  required
                                  placeholder="rationale (required)"
                                  className="ovrationale"
                                />
                                <button className="mini" type="submit">
                                  Save exception
                                </button>
                              </form>
                            </details>
                            <details className="reschedule">
                              <summary>Evidence ({(evidenceByEvent.get(e.id) ?? []).length})</summary>
                              {(evidenceByEvent.get(e.id) ?? []).length > 0 && (
                                <ul className="evidencelist">
                                  {(evidenceByEvent.get(e.id) ?? []).map((m) => (
                                    <li key={m.id}>
                                      <a
                                        href={`/dashboard/projects/${id}/media/${m.id}`}
                                        target="_blank"
                                        rel="noopener"
                                      >
                                        {m.content_type?.startsWith('image/') ? (
                                          // eslint-disable-next-line @next/next/no-img-element
                                          <img
                                            src={`/dashboard/projects/${id}/media/${m.id}`}
                                            alt={m.file_name ?? 'evidence'}
                                            className="evthumb"
                                          />
                                        ) : (
                                          <span className="evfile">📎 {m.file_name ?? 'file'}</span>
                                        )}
                                      </a>
                                      <span className="muted evup">
                                        {m.uploader_name} · {m.created_at}
                                      </span>
                                    </li>
                                  ))}
                                </ul>
                              )}
                              <form action={uploadEvidenceAction} className="reschedform">
                                <input type="hidden" name="projectId" value={id} />
                                <input type="hidden" name="eventId" value={e.id} />
                                <input type="file" name="file" accept="image/*,video/*" required />
                                <button className="mini" type="submit">
                                  Upload
                                </button>
                              </form>
                            </details>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        <aside className="col-side">
          <h3>Schedule a ceremony</h3>
          {spaces.length === 0 && (
            <p className="muted">
              Tip: <Link href="/dashboard/venues">add a venue &amp; space</Link> first to enable
              conflict-free booking.
            </p>
          )}
          <ScheduleForm
            projectId={id}
            minDate={project.start_date}
            maxDate={project.end_date}
            spaces={spaceOptions}
          />
        </aside>
      </section>
    </main>
  )
}
