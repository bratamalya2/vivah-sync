import Link from 'next/link'
import { redirect, notFound } from 'next/navigation'
import { getUserCached } from '@/lib/context'
import { getParty } from '@vivahsync/db'
import PageHeader from '../../../../_shell/PageHeader'
import CopyLink from '@/app/_components/CopyLink'
import {
  updateContactAction,
  deletePartyAction,
  addGuestAction,
  updateGuestAction,
  deleteGuestAction,
  setInvitesAction,
} from '../actions'

export const dynamic = 'force-dynamic'

export default async function PartyPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; partyId: string }>
  searchParams: Promise<{ err?: string; msg?: string }>
}) {
  const { id, partyId } = await params
  const { err, msg } = await searchParams
  const user = await getUserCached()
  if (!user) redirect('/login')

  const party = await getParty(user.id, partyId)
  if (!party || party.project_id !== id) notFound()

  const invitedSet = new Set(party.invited.map((e) => e.id))
  const rsvpMap = new Map(party.rsvps.map((r) => [`${r.guest_id}:${r.event_id}`, r.status]))

  return (
    <main className="dash">
      <PageHeader kicker="Guest party" title={party.name}>
        <Link href={`/dashboard/projects/${id}/guests`} className="ghost">
          ← Guests
        </Link>
      </PageHeader>

      {err && <p className="err banner">{err}</p>}
      {msg && <p className="ok banner">{msg}</p>}

      <div className="projsub" style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
        <span className={`badge ${party.submitted ? 'st-accepted' : 'st-sent'}`} style={{ position: 'static' }}>
          {party.submitted ? 'RSVP received' : 'Awaiting RSVP'}
        </span>
        <CopyLink token={party.rsvp_token} />
        <span className="muted">Share this no-login link with the household to collect their RSVP.</span>
      </div>

      <section className="dashbody">
        <div className="col-main">
          <div className="col-head">
            <h2>Guests</h2>
            <span className="count">{party.guests.length}</span>
          </div>

          <ul className="glist">
            {party.guests.map((g) => (
              <li key={g.id} className="gcard">
                <form action={updateGuestAction} className="gedit">
                  <input type="hidden" name="projectId" value={id} />
                  <input type="hidden" name="partyId" value={partyId} />
                  <input type="hidden" name="guestId" value={g.id} />
                  <input className="ginput gname" name="name" defaultValue={g.name} />
                  <label className="gcheck">
                    <input type="checkbox" name="isChild" defaultChecked={g.is_child} /> child
                  </label>
                  {g.is_plus_one && <span className="badge st-sent" style={{ position: 'static' }}>plus-one</span>}
                  <input className="ginput" name="dietary" defaultValue={g.dietary ?? ''} placeholder="dietary / allergies" />
                  <input className="ginput" name="assistance" defaultValue={g.assistance ?? ''} placeholder="assistance" />
                  <button className="mini" type="submit">
                    Save
                  </button>
                </form>
                <div className="grow2">
                  <div className="grsvp">
                    {party.invited.map((ev) => {
                      const st = (rsvpMap.get(`${g.id}:${ev.id}`) ?? 'PENDING').toLowerCase()
                      return (
                        <span key={ev.id} className={`gstat s-${st}`}>
                          {ev.name}: {st === 'pending' ? '—' : st}
                        </span>
                      )
                    })}
                  </div>
                  <form action={deleteGuestAction} className="inlineform">
                    <input type="hidden" name="projectId" value={id} />
                    <input type="hidden" name="partyId" value={partyId} />
                    <input type="hidden" name="guestId" value={g.id} />
                    <button className="mini ghostmini" type="submit">
                      Remove
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>

          <form action={addGuestAction} className="addguest">
            <input type="hidden" name="projectId" value={id} />
            <input type="hidden" name="partyId" value={partyId} />
            <input name="name" placeholder="Add a guest…" required />
            <label className="gcheck">
              <input type="checkbox" name="isChild" /> child
            </label>
            <button className="mini" type="submit">
              Add guest
            </button>
          </form>
        </div>

        <aside className="col-side">
          <h3>Contact &amp; settings</h3>
          <form action={updateContactAction} className="newform">
            <input type="hidden" name="projectId" value={id} />
            <input type="hidden" name="partyId" value={partyId} />
            <label>
              Party name
              <input name="name" defaultValue={party.name} required />
            </label>
            <label>
              Contact
              <input name="contactName" defaultValue={party.contact_name ?? ''} />
            </label>
            <label>
              Phone
              <input name="contactPhone" defaultValue={party.contact_phone ?? ''} />
            </label>
            <label>
              Email
              <input name="contactEmail" defaultValue={party.contact_email ?? ''} />
            </label>
            <label>
              Plus-ones allowed
              <input name="plusOnesAllowed" type="number" min={0} defaultValue={party.plus_ones_allowed} />
            </label>
            <button className="mini" type="submit">
              Save
            </button>
          </form>

          <hr className="sep" />
          <h3>Invited to</h3>
          <form action={setInvitesAction} className="newform">
            <input type="hidden" name="projectId" value={id} />
            <input type="hidden" name="partyId" value={partyId} />
            {party.allEvents.length === 0 ? (
              <p className="hint">Add ceremonies on the run-of-show first.</p>
            ) : (
              party.allEvents.map((ev) => (
                <label className="spacecheck" key={ev.id}>
                  <input type="checkbox" name="eventId" value={ev.id} defaultChecked={invitedSet.has(ev.id)} />
                  {ev.name} <span className="muted">· {ev.when}</span>
                </label>
              ))
            )}
            <button className="mini" type="submit">
              Save invites
            </button>
          </form>

          <hr className="sep" />
          <form action={deletePartyAction}>
            <input type="hidden" name="projectId" value={id} />
            <input type="hidden" name="partyId" value={partyId} />
            <button className="mini ghostmini" type="submit">
              Delete party
            </button>
          </form>
        </aside>
      </section>
    </main>
  )
}
