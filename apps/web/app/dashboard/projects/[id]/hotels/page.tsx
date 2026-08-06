import { redirect, notFound } from 'next/navigation'
import { getUserCached, getProjectCached } from '@/lib/context'
import { listHotelsMatrix, listAllocations, hotelStats, listProjectParties } from '@vivahsync/db'
import PageHeader from '../../../_shell/PageHeader'
import SubmitButton from '@/app/_components/SubmitButton'
import {
  createHotelAction,
  addBlockAction,
  deleteBlockAction,
  deleteHotelAction,
  allocateAction,
  stayStatusAction,
  toggleKitAction,
  toggleKeyAction,
  deleteAllocationAction,
} from './actions'

export const dynamic = 'force-dynamic'

const STAY_STATUSES = ['RESERVED', 'ARRIVED', 'CHECKED_IN', 'CHECKED_OUT', 'CANCELLED']
const inr = (n: string | number) =>
  '₹' + Number(n).toLocaleString('en-IN', { maximumFractionDigits: 0 })

export default async function HotelsPage({
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

  const [hotels, allocations, stats, parties] = await Promise.all([
    listHotelsMatrix(user.id, id),
    listAllocations(user.id, id),
    hotelStats(user.id, id),
    listProjectParties(user.id, id),
  ])

  return (
    <main className="dash">
      <PageHeader kicker="Room blocks · front-desk check-in · welcome kits" title="Hotels & rooms" />

      {err && <p className="err banner">{err}</p>}
      {msg && <p className="ok banner">{msg}</p>}

      <div className="ledgertotals" style={{ marginTop: '1.25rem' }}>
        <div className="lt">
          <span className="ltlabel">Hotels</span>
          <span className="ltval">{stats.hotels}</span>
        </div>
        <div className="lt">
          <span className="ltlabel">Rooms blocked</span>
          <span className="ltval">{stats.roomsBlocked}</span>
        </div>
        <div className="lt">
          <span className="ltlabel">Allocated</span>
          <span className="ltval">{stats.roomsAllocated}</span>
        </div>
        <div className="lt">
          <span className="ltlabel">In-house</span>
          <span className="ltval inflow">{stats.inHouse}</span>
        </div>
        <div className="lt">
          <span className="ltlabel">Kits pending</span>
          <span className={`ltval ${stats.kitsPending > 0 ? 'outflow' : ''}`}>{stats.kitsPending}</span>
        </div>
      </div>

      <section className="dashbody" style={{ marginTop: '1.5rem' }}>
        <div className="col-main">
          <div className="col-head">
            <h2>Room-block matrix</h2>
            <span className="count">{hotels.length}</span>
          </div>
          {hotels.length === 0 ? (
            <div className="empty">
              No hotels yet. Add a hotel on the right, then give it room blocks (a room type, how many
              you&apos;ve held, and the nightly rate).
            </div>
          ) : (
            <div className="htlist">
              {hotels.map((h) => (
                <div key={h.id} className="htcard">
                  <div className="hthead">
                    <div>
                      <span className="htname">{h.name}</span>
                      {h.address && <span className="htaddr">{h.address}</span>}
                    </div>
                    <span className="count">
                      {h.allocated}/{h.totalRooms} rooms
                    </span>
                  </div>

                  {h.blocks.length > 0 && (
                    <table className="htmatrix">
                      <thead>
                        <tr>
                          <th>Type</th>
                          <th>Rate/night</th>
                          <th>Held</th>
                          <th>Allocated</th>
                          <th>Free</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {h.blocks.map((b) => (
                          <tr key={b.id}>
                            <td>{b.room_type}</td>
                            <td className="num">{inr(b.rate)}</td>
                            <td className="num">{b.total_rooms}</td>
                            <td className="num">{b.allocated}</td>
                            <td className={`num ${b.available === 0 ? 'outflow' : 'inflow'}`}>{b.available}</td>
                            <td className="num">
                              <form action={deleteBlockAction}>
                                <input type="hidden" name="projectId" value={id} />
                                <input type="hidden" name="id" value={b.id} />
                                <button type="submit" className="ghostmini">
                                  ✕
                                </button>
                              </form>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}

                  <div className="htfoot">
                    <form action={addBlockAction} className="htblockform">
                      <input type="hidden" name="projectId" value={id} />
                      <input type="hidden" name="hotelId" value={h.id} />
                      <input name="roomType" placeholder="Room type" required />
                      <input name="totalRooms" type="number" min={0} placeholder="Rooms" />
                      <input name="rate" type="number" min={0} placeholder="Rate" />
                      <SubmitButton pendingLabel="…" className="mini">
                        Add block
                      </SubmitButton>
                    </form>
                    <form action={deleteHotelAction} className="htdel">
                      <input type="hidden" name="projectId" value={id} />
                      <input type="hidden" name="id" value={h.id} />
                      <button type="submit" className="ghostmini">
                        Remove hotel
                      </button>
                    </form>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="col-head" style={{ marginTop: '1.75rem' }}>
            <h2>Front-desk console</h2>
            <span className="count">{allocations.length}</span>
          </div>
          {allocations.length === 0 ? (
            <div className="empty">No rooms allocated yet. Assign a party a room on the right.</div>
          ) : (
            <ul className="alloclist">
              {allocations.map((a) => {
                const badge =
                  a.status === 'CHECKED_IN'
                    ? 'st-accepted'
                    : a.status === 'CANCELLED'
                      ? 'st-rejected'
                      : 'st-sent'
                return (
                  <li key={a.id} className="allocrow">
                    <div className="allochead">
                      <div>
                        <span className="allocparty">{a.party_name}</span>
                        <span className="allocmeta">
                          {a.hotel_name} · {a.room_type}
                          {a.room_number ? ` · Rm ${a.room_number}` : ''} · {a.occupancy} pax
                          {a.check_in_date ? ` · ${a.check_in_date}` : ''}
                          {a.check_out_date ? `–${a.check_out_date}` : ''}
                        </span>
                      </div>
                      <span className={`badge ${badge}`} style={{ position: 'static' }}>
                        {a.status.replace('_', ' ')}
                      </span>
                    </div>
                    <div className="allocctl">
                      <form action={stayStatusAction} className="allocstatus">
                        <input type="hidden" name="projectId" value={id} />
                        <input type="hidden" name="id" value={a.id} />
                        <select name="status" defaultValue={a.status}>
                          {STAY_STATUSES.map((st) => (
                            <option key={st} value={st}>
                              {st.replace('_', ' ')}
                            </option>
                          ))}
                        </select>
                        <SubmitButton pendingLabel="…" className="mini ghostmini">
                          Set
                        </SubmitButton>
                      </form>
                      <form action={toggleKeyAction}>
                        <input type="hidden" name="projectId" value={id} />
                        <input type="hidden" name="id" value={a.id} />
                        <input type="hidden" name="value" value={a.key_handed ? '0' : '1'} />
                        <button type="submit" className={`chiptog ${a.key_handed ? 'on' : ''}`}>
                          🔑 Key {a.key_handed ? 'handed' : 'pending'}
                        </button>
                      </form>
                      <form action={toggleKitAction}>
                        <input type="hidden" name="projectId" value={id} />
                        <input type="hidden" name="id" value={a.id} />
                        <input type="hidden" name="value" value={a.welcome_kit ? '0' : '1'} />
                        <button type="submit" className={`chiptog ${a.welcome_kit ? 'on' : ''}`}>
                          🎁 Kit {a.welcome_kit ? 'given' : 'pending'}
                        </button>
                      </form>
                      <form action={deleteAllocationAction} className="htdel">
                        <input type="hidden" name="projectId" value={id} />
                        <input type="hidden" name="id" value={a.id} />
                        <button type="submit" className="ghostmini">
                          Remove
                        </button>
                      </form>
                    </div>
                    {a.notes && <div className="allocnote">{a.notes}</div>}
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <aside className="col-side">
          <h3>Allocate a room</h3>
          {hotels.length === 0 || parties.length === 0 ? (
            <div className="empty">Add a hotel and a guest party first.</div>
          ) : (
            <form action={allocateAction} className="newform">
              <input type="hidden" name="projectId" value={id} />
              <label>
                Hotel
                <select name="hotelId" required>
                  {hotels.map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.name}
                    </option>
                  ))}
                </select>
              </label>
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
                Room type
                <input name="roomType" list="roomtypes" placeholder="Deluxe" required />
                <datalist id="roomtypes">
                  {[...new Set(hotels.flatMap((h) => h.blocks.map((b) => b.room_type)))].map((t) => (
                    <option key={t} value={t} />
                  ))}
                </datalist>
              </label>
              <div className="tvrow2">
                <label>
                  Room #
                  <input name="roomNumber" placeholder="204" />
                </label>
                <label>
                  Occupancy
                  <input name="occupancy" type="number" min={1} defaultValue={2} />
                </label>
              </div>
              <div className="tvrow2">
                <label>
                  Check-in
                  <input name="checkInDate" type="date" />
                </label>
                <label>
                  Check-out
                  <input name="checkOutDate" type="date" />
                </label>
              </div>
              <label>
                Notes
                <input name="notes" placeholder="Early check-in requested" />
              </label>
              <SubmitButton pendingLabel="Allocating…">Allocate room</SubmitButton>
            </form>
          )}

          <h3 style={{ marginTop: '1.5rem' }}>New hotel</h3>
          <form action={createHotelAction} className="newform">
            <input type="hidden" name="projectId" value={id} />
            <label>
              Name
              <input name="name" required placeholder="Taj Palace" />
            </label>
            <label>
              Address
              <input name="address" placeholder="MI Road, Jaipur" />
            </label>
            <label>
              Phone
              <input name="phone" placeholder="+91 …" />
            </label>
            <SubmitButton pendingLabel="Adding…">Add hotel</SubmitButton>
          </form>
        </aside>
      </section>
    </main>
  )
}
