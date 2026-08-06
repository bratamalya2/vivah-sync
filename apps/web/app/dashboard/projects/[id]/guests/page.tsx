import Link from 'next/link'
import { redirect, notFound } from 'next/navigation'
import { getUserCached, getProjectCached } from '@/lib/context'
import { listProjectParties, guestStats } from '@vivahsync/db'
import PageHeader from '../../../_shell/PageHeader'
import SubmitButton from '@/app/_components/SubmitButton'
import CopyLink from '@/app/_components/CopyLink'
import { createPartyAction } from './actions'

export const dynamic = 'force-dynamic'

export default async function GuestsPage({
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

  const [parties, stats] = await Promise.all([listProjectParties(user.id, id), guestStats(user.id, id)])

  return (
    <main className="dash">
      <PageHeader kicker="Guest list · RSVP · dietary & assistance" title="Guests" />

      {err && <p className="err banner">{err}</p>}
      {msg && <p className="ok banner">{msg}</p>}

      <div className="ledgertotals" style={{ marginTop: '1.25rem' }}>
        <div className="lt">
          <span className="ltlabel">Parties</span>
          <span className="ltval">{stats.parties}</span>
        </div>
        <div className="lt">
          <span className="ltlabel">Responded</span>
          <span className="ltval">
            {stats.submitted}/{stats.parties}
          </span>
        </div>
        <div className="lt">
          <span className="ltlabel">Guests attending</span>
          <span className="ltval inflow">{stats.attendingHeads}</span>
        </div>
      </div>

      {stats.perEvent.length > 0 && (
        <div className="gstevents">
          {stats.perEvent.map((e) => (
            <div key={e.id} className="gstevent">
              <div className="ge-name">{e.name}</div>
              <div className="ge-counts">
                <span className="ge-yes">{e.yes} yes</span> · {e.maybe} maybe · {e.no} no · {e.pending} pending
              </div>
            </div>
          ))}
        </div>
      )}

      <section className="dashbody" style={{ marginTop: '1.5rem' }}>
        <div className="col-main">
          <div className="col-head">
            <h2>Parties</h2>
            <span className="count">{parties.length}</span>
          </div>
          {parties.length === 0 ? (
            <div className="empty">
              No guest parties yet. Add a family / household on the right — each one gets a no-login RSVP
              link you can share over WhatsApp.
            </div>
          ) : (
            <ul className="projlist">
              {parties.map((p) => (
                <li key={p.id} className="projitem">
                  <Link href={`/dashboard/projects/${id}/guests/${p.id}`} className="pname plink">
                    {p.name}
                  </Link>
                  <div className="pmeta">
                    {p.guests} guest{p.guests !== 1 ? 's' : ''}
                    {p.contact_name ? ` · ${p.contact_name}` : ''}
                    {p.contact_phone ? ` · ${p.contact_phone}` : ''} · {p.attending} attending
                  </div>
                  <div className="gactions">
                    <span className={`badge ${p.submitted ? 'st-accepted' : 'st-sent'}`} style={{ position: 'static' }}>
                      {p.submitted ? 'RSVP in' : 'Awaiting RSVP'}
                    </span>
                    <CopyLink token={p.rsvp_token} />
                    <CopyLink token={p.rsvp_token} path="itinerary" label="Copy itinerary link" />
                  </div>
                </li>
              ))}
            </ul>
          )}

          {(stats.dietary.length > 0 || stats.assistance.length > 0) && (
            <div className="gstnotes">
              {stats.dietary.length > 0 && (
                <div>
                  <h3>Dietary &amp; allergies</h3>
                  <ul>
                    {stats.dietary.map((d, i) => (
                      <li key={i}>
                        {d.guest} <span className="muted">({d.party})</span> — {d.note}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {stats.assistance.length > 0 && (
                <div>
                  <h3>Special assistance</h3>
                  <ul>
                    {stats.assistance.map((a, i) => (
                      <li key={i}>
                        {a.guest} <span className="muted">({a.party})</span> — {a.note}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        <aside className="col-side">
          <h3>New party</h3>
          <form action={createPartyAction} className="newform">
            <input type="hidden" name="projectId" value={id} />
            <label>
              Party / family name
              <input name="name" required placeholder="The Sharma Family" />
            </label>
            <label>
              Primary contact
              <input name="contactName" placeholder="Anil Sharma" />
            </label>
            <label>
              Phone
              <input name="contactPhone" placeholder="+91 …" />
            </label>
            <label>
              Email
              <input name="contactEmail" type="email" placeholder="optional" />
            </label>
            <label>
              Plus-ones allowed
              <input name="plusOnesAllowed" type="number" min={0} defaultValue={0} />
            </label>
            <SubmitButton pendingLabel="Adding…">Add party</SubmitButton>
          </form>
        </aside>
      </section>
    </main>
  )
}
