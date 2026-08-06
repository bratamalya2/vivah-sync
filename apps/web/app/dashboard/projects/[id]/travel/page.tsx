import { redirect, notFound } from 'next/navigation'
import { getUserCached, getProjectCached } from '@/lib/context'
import { listProjectTravel, listProjectParties, type TravelRow } from '@vivahsync/db'
import PageHeader from '../../../_shell/PageHeader'
import SubmitButton from '@/app/_components/SubmitButton'
import { addTravelAction, travelStatusAction, dispatchAction, deleteTravelAction } from './actions'

export const dynamic = 'force-dynamic'

const ARRIVAL_NEXT = ['SCHEDULED', 'DELAYED', 'ARRIVED', 'CANCELLED']
const DEPARTURE_NEXT = ['SCHEDULED', 'DELAYED', 'DEPARTED', 'CANCELLED']

function TravelLeg({ t, projectId }: { t: TravelRow; projectId: string }) {
  const statuses = t.direction === 'ARRIVAL' ? ARRIVAL_NEXT : DEPARTURE_NEXT
  const badge =
    t.status === 'DELAYED' || t.status === 'CANCELLED'
      ? 'st-rejected'
      : t.status === 'ARRIVED' || t.status === 'DEPARTED'
        ? 'st-accepted'
        : 'st-sent'
  return (
    <li className="tvleg">
      <div className="tvhead">
        <div>
          <span className="tvparty">{t.party_name}</span>
          <span className="tvmode">
            {t.mode}
            {t.carrier_number ? ` ${t.carrier_number}` : ''} · {t.headcount} pax
          </span>
        </div>
        <span className={`badge ${badge}`} style={{ position: 'static' }}>
          {t.status}
        </span>
      </div>
      <div className="tvmeta">
        {t.scheduled}
        {t.location ? ` · ${t.location}` : ''}
        {t.hotel ? ` → ${t.hotel}` : ''}
        {t.delay_note ? ` · ${t.delay_note}` : ''}
      </div>

      <form action={dispatchAction} className="tvdispatch">
        <input type="hidden" name="projectId" value={projectId} />
        <input type="hidden" name="id" value={t.id} />
        <input name="driverName" defaultValue={t.driver_name ?? ''} placeholder="Driver" />
        <input name="driverPhone" defaultValue={t.driver_phone ?? ''} placeholder="Phone" />
        <input name="vehicle" defaultValue={t.vehicle ?? ''} placeholder="Vehicle / plate" />
        <SubmitButton pendingLabel="…" className="mini">
          Assign
        </SubmitButton>
      </form>

      <form action={travelStatusAction} className="tvstatus">
        <input type="hidden" name="projectId" value={projectId} />
        <input type="hidden" name="id" value={t.id} />
        <select name="status" defaultValue={t.status}>
          {statuses.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <input name="delayNote" defaultValue={t.delay_note ?? ''} placeholder="Delay / note" />
        <SubmitButton pendingLabel="…" className="mini ghostmini">
          Update
        </SubmitButton>
      </form>

      <form action={deleteTravelAction} className="tvdel">
        <input type="hidden" name="projectId" value={projectId} />
        <input type="hidden" name="id" value={t.id} />
        <button type="submit" className="ghostmini">
          Remove
        </button>
      </form>
    </li>
  )
}

export default async function TravelPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ err?: string; msg?: string }>
}) {
  const { id } = await params
  const { err, msg } = await searchParams
  const user = await getUserCached()
  if (!user) redirect('/login')
  const project = await getProjectCached(user.id, id)
  if (!project) notFound()

  const [travel, parties] = await Promise.all([listProjectTravel(user.id, id), listProjectParties(user.id, id)])
  const arrivals = travel.filter((t) => t.direction === 'ARRIVAL')
  const departures = travel.filter((t) => t.direction === 'DEPARTURE')
  const heads = arrivals.filter((t) => t.status !== 'CANCELLED').reduce((n, t) => n + t.headcount, 0)

  // Pickup windows: arrivals grouped by hotel + 30-min bucket, for the dispatch sheet.
  const windows = new Map<string, { hotel: string; window: string; legs: TravelRow[]; heads: number }>()
  for (const a of arrivals) {
    if (a.status === 'CANCELLED') continue
    const hotel = a.hotel ?? 'Unassigned hotel'
    const key = `${hotel}|${a.window}`
    let w = windows.get(key)
    if (!w) {
      w = { hotel, window: a.window, legs: [], heads: 0 }
      windows.set(key, w)
    }
    w.legs.push(a)
    w.heads += a.headcount
  }
  const dispatchSheet = [...windows.values()]

  return (
    <main className="dash">
      <PageHeader kicker="Arrivals · pickup windows · fleet dispatch" title="Travel & dispatch" />

      {err && <p className="err banner">{err}</p>}
      {msg && <p className="ok banner">{msg}</p>}

      <div className="ledgertotals" style={{ marginTop: '1.25rem' }}>
        <div className="lt">
          <span className="ltlabel">Arrivals</span>
          <span className="ltval">{arrivals.length}</span>
        </div>
        <div className="lt">
          <span className="ltlabel">Departures</span>
          <span className="ltval">{departures.length}</span>
        </div>
        <div className="lt">
          <span className="ltlabel">Heads arriving</span>
          <span className="ltval inflow">{heads}</span>
        </div>
      </div>

      <section className="dashbody" style={{ marginTop: '1.5rem' }}>
        <div className="col-main">
          <div className="col-head">
            <h2>Pickup dispatch sheet</h2>
            <span className="count">{dispatchSheet.length}</span>
          </div>
          {dispatchSheet.length === 0 ? (
            <div className="empty">
              No arrivals logged yet. Add a travel leg on the right — arrivals auto-group into 30-minute
              pickup windows per hotel so you can batch the fleet.
            </div>
          ) : (
            <div className="tvwindows">
              {dispatchSheet.map((w, i) => (
                <div key={i} className="tvwindow">
                  <div className="tvwhead">
                    <span className="tvwtime">{w.window}</span>
                    <span className="tvwhotel">{w.hotel}</span>
                    <span className="count">{w.heads} pax</span>
                  </div>
                  <ul className="tvlegs">
                    {w.legs.map((t) => (
                      <TravelLeg key={t.id} t={t} projectId={id} />
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}

          {departures.length > 0 && (
            <>
              <div className="col-head" style={{ marginTop: '1.75rem' }}>
                <h2>Departures</h2>
                <span className="count">{departures.length}</span>
              </div>
              <ul className="tvlegs">
                {departures.map((t) => (
                  <TravelLeg key={t.id} t={t} projectId={id} />
                ))}
              </ul>
            </>
          )}
        </div>

        <aside className="col-side">
          <h3>Add travel leg</h3>
          {parties.length === 0 ? (
            <div className="empty">Add a guest party first — travel legs attach to a party.</div>
          ) : (
            <form action={addTravelAction} className="newform">
              <input type="hidden" name="projectId" value={id} />
              <label>
                Party
                <select name="partyId" required>
                  {parties.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Direction
                <select name="direction" defaultValue="ARRIVAL">
                  <option value="ARRIVAL">Arrival</option>
                  <option value="DEPARTURE">Departure</option>
                </select>
              </label>
              <label>
                Mode
                <select name="mode" defaultValue="FLIGHT">
                  <option value="FLIGHT">Flight</option>
                  <option value="TRAIN">Train</option>
                  <option value="CAR">Car</option>
                  <option value="OTHER">Other</option>
                </select>
              </label>
              <label>
                Flight / train number
                <input name="carrierNumber" placeholder="6E-203" />
              </label>
              <div className="tvrow2">
                <label>
                  Date
                  <input name="date" type="date" required />
                </label>
                <label>
                  Time (IST)
                  <input name="time" type="time" required />
                </label>
              </div>
              <label>
                Terminal / station
                <input name="location" placeholder="T2, Delhi (DEL)" />
              </label>
              <label>
                Destination hotel
                <input name="hotel" placeholder="Taj Palace" />
              </label>
              <label>
                Headcount
                <input name="headcount" type="number" min={1} defaultValue={1} />
              </label>
              <SubmitButton pendingLabel="Adding…">Add leg</SubmitButton>
            </form>
          )}
        </aside>
      </section>
    </main>
  )
}
