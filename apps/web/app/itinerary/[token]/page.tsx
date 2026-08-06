import { headers } from 'next/headers'
import QRCode from 'qrcode'
import { loadItinerary } from '@vivahsync/db'

export const dynamic = 'force-dynamic'

const STATUS_LABEL: Record<string, string> = {
  YES: 'Attending',
  MAYBE: 'Maybe',
  NO: 'Not attending',
  PENDING: 'Not yet responded',
}

export default async function ItineraryPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const it = await loadItinerary(token)

  if (!it) {
    return (
      <div className="rsvp-page">
        <div className="rsvp-card">
          <h1>Itinerary not found</h1>
          <p>This link may be mistyped or no longer active. Please check with your host.</p>
        </div>
      </div>
    )
  }

  const h = await headers()
  const host = h.get('host') ?? ''
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https')
  const url = `${proto}://${host}/itinerary/${token}`
  const qr = await QRCode.toString(url, { type: 'svg', margin: 1, width: 200 }).catch(() => '')

  return (
    <div className="rsvp-page">
      <header className="rsvp-header">
        <span className="rsvp-kicker">{it.project.name}</span>
        <h1>{it.party.name}</h1>
        {it.project.city && <p>{it.project.city}</p>}
      </header>

      <div className="itin-wrap">
        <section className="itin-card">
          <h2>Ceremonies</h2>
          {it.events.length === 0 ? (
            <p className="itin-empty">No ceremonies listed yet.</p>
          ) : (
            <ul className="itin-events">
              {it.events.map((e) => (
                <li key={e.id}>
                  <div className="itin-ev-main">
                    <span className="itin-ev-name">{e.name}</span>
                    <span className={`itin-tag s-${e.status.toLowerCase()}`}>{STATUS_LABEL[e.status] ?? e.status}</span>
                  </div>
                  <div className="itin-ev-meta">
                    {e.starts}
                    {e.venue ? ` · ${e.venue}` : ''}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {it.travel.length > 0 && (
          <section className="itin-card">
            <h2>Your travel</h2>
            <ul className="itin-travel">
              {it.travel.map((t, i) => (
                <li key={i}>
                  <div className="itin-ev-main">
                    <span className="itin-ev-name">
                      {t.direction === 'ARRIVAL' ? 'Arrival' : 'Departure'} · {t.mode}
                      {t.carrier_number ? ` ${t.carrier_number}` : ''}
                    </span>
                    {(t.status === 'DELAYED' || t.status === 'CANCELLED') && (
                      <span className="itin-tag s-no">{t.status}</span>
                    )}
                  </div>
                  <div className="itin-ev-meta">
                    {t.scheduled}
                    {t.location ? ` · ${t.location}` : ''}
                    {t.hotel ? ` → ${t.hotel}` : ''}
                  </div>
                  {t.driver_name && (
                    <div className="itin-ev-meta">
                      Driver: {t.driver_name}
                      {t.driver_phone ? ` · ${t.driver_phone}` : ''}
                      {t.vehicle ? ` · ${t.vehicle}` : ''}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        {it.rooms.length > 0 && (
          <section className="itin-card">
            <h2>Your stay</h2>
            <ul className="itin-travel">
              {it.rooms.map((r, i) => (
                <li key={i}>
                  <div className="itin-ev-main">
                    <span className="itin-ev-name">{r.hotel_name}</span>
                    <span className="itin-tag s-maybe">{r.status.replace('_', ' ')}</span>
                  </div>
                  <div className="itin-ev-meta">
                    {r.room_type}
                    {r.room_number ? ` · Room ${r.room_number}` : ''}
                    {r.check_in_date ? ` · ${r.check_in_date}` : ''}
                    {r.check_out_date ? `–${r.check_out_date}` : ''}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="itin-card itin-pass">
          <h2>Your guest pass</h2>
          <p className="itin-empty">Show this at the welcome desk on arrival.</p>
          {qr && <div className="itin-qr" dangerouslySetInnerHTML={{ __html: qr }} />}
          <div className="itin-passname">{it.party.name}</div>
        </section>
      </div>

      <p className="rsvp-foot">VivahSync · your personal wedding itinerary</p>
    </div>
  )
}
