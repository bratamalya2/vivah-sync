import { redirect } from 'next/navigation'
import { getUser } from '@/lib/auth'
import { getMyContext, listVenues, listSpaces } from '@vivahsync/db'
import { AddVenueForm, AddSpaceForm } from './VenueForms'
import AppShell from '../_shell/AppShell'
import PageHeader from '../_shell/PageHeader'

export const dynamic = 'force-dynamic'

export default async function VenuesPage() {
  const user = await getUser()
  if (!user) redirect('/login')
  const ctx = await getMyContext(user.id)
  if (!ctx.org) redirect('/onboarding')

  const [venues, spaces] = await Promise.all([listVenues(user.id), listSpaces(user.id)])
  const spacesByVenue = new Map<string, typeof spaces>()
  for (const sp of spaces) {
    const arr = spacesByVenue.get(sp.venue_id) ?? []
    arr.push(sp)
    spacesByVenue.set(sp.venue_id, arr)
  }

  return (
    <AppShell scope="agency" user={user} org={ctx.org}>
      <main className="dash">
        <PageHeader kicker="Venue & space allocation" title="Venues" />

      <section className="dashbody">
        <div className="col-main">
          <div className="col-head">
            <h2>Venues &amp; spaces</h2>
            <span className="count">{venues.length}</span>
          </div>

          {venues.length === 0 ? (
            <div className="empty">
              No venues yet. Add one on the right — then add its bookable spaces.
            </div>
          ) : (
            <ul className="projlist">
              {venues.map((v) => (
                <li key={v.id} className="projitem">
                  <div className="pname">{v.name}</div>
                  {v.address && <div className="pmeta">{v.address}</div>}
                  {v.contact_name && (
                    <div className="pmeta">
                      {v.contact_name}
                      {v.contact_phone ? ` · ${v.contact_phone}` : ''}
                    </div>
                  )}
                  <div className="spaces">
                    {(spacesByVenue.get(v.id) ?? []).length === 0 ? (
                      <span className="muted">No spaces yet</span>
                    ) : (
                      (spacesByVenue.get(v.id) ?? []).map((sp) => (
                        <span key={sp.id} className="chip">
                          {sp.name}
                          {sp.legal_max_capacity != null ? ` · max ${sp.legal_max_capacity}` : ''}
                        </span>
                      ))
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <aside className="col-side">
          <h3>Add venue</h3>
          <AddVenueForm />
          <hr className="sep" />
          <h3>Add space</h3>
          <AddSpaceForm venues={venues.map((v) => ({ id: v.id, name: v.name }))} />
        </aside>
      </section>
      </main>
    </AppShell>
  )
}
