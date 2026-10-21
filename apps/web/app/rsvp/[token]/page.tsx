import { loadRsvp } from '@vivahsync/db'
import RsvpForm from './RsvpForm'
import BrandLogo from '@/app/_components/BrandLogo'

export const dynamic = 'force-dynamic'

export default async function RsvpPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>
  searchParams: Promise<{ done?: string; err?: string }>
}) {
  const { token } = await params
  const { done, err } = await searchParams
  const data = await loadRsvp(token)

  return (
    <div className="rsvp-page">
      <header className="rsvp-header">
        <BrandLogo className="rsvp-logo" />
      </header>
      <main className="rsvp-main">
        {!data ? (
          <div className="rsvp-card">
            <h1>Link not found</h1>
            <p className="muted">This RSVP link isn’t valid or has expired. Please check with your host.</p>
          </div>
        ) : done ? (
          <div className="rsvp-card">
            <div className="rsvp-tick">✓</div>
            <h1>Thank you!</h1>
            <p className="muted">
              Your RSVP for {data.party.project_name} has been received. You can reopen this link any time
              to update it.
            </p>
            <a className="lp-btn ghost" href={`/rsvp/${token}`}>
              Update my RSVP
            </a>
          </div>
        ) : (
          <div className="rsvp-card wide">
            <div className="rsvp-kicker">You’re invited</div>
            <h1>{data.party.project_name}</h1>
            <p className="rsvp-sub">
              {data.party.city} · RSVP for <strong>{data.party.name}</strong>
            </p>
            {err && <p className="err">{err}</p>}
            {data.party.submitted && (
              <p className="ok">We already have your response — you can update it below.</p>
            )}
            {data.events.length === 0 ? (
              <p className="muted">No events to RSVP for yet. Please check back later.</p>
            ) : (
              <RsvpForm
                token={token}
                events={data.events}
                guests={data.guests}
                rsvps={data.rsvps}
                plusOnesAllowed={data.party.plus_ones_allowed}
              />
            )}
          </div>
        )}
        <footer className="rsvp-foot">
          <BrandLogo className="rsvp-foot-logo" />
        </footer>
      </main>
    </div>
  )
}
