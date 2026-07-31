import { redirect } from 'next/navigation'
import { getUser } from '@/lib/auth'
import { getMyContext, listVendors, listVendorPortalInvites } from '@vivahsync/db'
import { categoryLabel } from '@/lib/categories'
import VendorForm from './VendorForm'
import { inviteVendorToPortal } from './actions'
import AppShell from '../_shell/AppShell'
import PageHeader from '../_shell/PageHeader'

export const dynamic = 'force-dynamic'

export default async function VendorsPage({
  searchParams,
}: {
  searchParams: Promise<{ err?: string; msg?: string }>
}) {
  const { err, msg } = await searchParams
  const user = await getUser()
  if (!user) redirect('/login')
  const ctx = await getMyContext(user.id)
  if (!ctx.org) redirect('/onboarding')

  const [vendors, invites] = await Promise.all([
    listVendors(user.id),
    listVendorPortalInvites(user.id),
  ])
  const inviteByVendor = new Map(invites.map((i) => [i.vendor_id, i]))

  return (
    <AppShell scope="agency" user={user} org={ctx.org}>
      <main className="dash">
        <PageHeader kicker="Reusable vendor roster" title="Vendors" />

        {err && <p className="err banner">{err}</p>}
        {msg && <p className="ok banner">{msg}</p>}

        <section className="dashbody">
          <div className="col-main">
            <div className="col-head">
              <h2>Vendors</h2>
              <span className="count">{vendors.length}</span>
            </div>
            {vendors.length === 0 ? (
              <div className="empty">
                No vendors yet. Add your regulars on the right — you can book them into any wedding.
              </div>
            ) : (
              <ul className="projlist">
                {vendors.map((v) => {
                  const inv = inviteByVendor.get(v.id)
                  return (
                    <li key={v.id} className="projitem">
                      <div className="pname">{v.name}</div>
                      <div className="pmeta">
                        {categoryLabel(v.category)}
                        {v.contact_name ? ` · ${v.contact_name}` : ''}
                        {v.contact_phone ? ` · ${v.contact_phone}` : ''}
                      </div>
                      <span className="badge">{categoryLabel(v.category)}</span>

                      {inv?.claimed_at ? (
                        <div className="pmeta" style={{ marginTop: '0.5rem' }}>
                          <span className="badge st-accepted" style={{ position: 'static' }}>
                            On portal
                          </span>{' '}
                          {inv.email}
                        </div>
                      ) : (
                        <details className="reschedule">
                          <summary>{inv ? `Invited · ${inv.email}` : 'Invite to portal'}</summary>
                          <form
                            action={inviteVendorToPortal}
                            className="reschedform"
                            style={{ marginTop: '0.4rem' }}
                          >
                            <input type="hidden" name="vendorId" value={v.id} />
                            <input
                              name="email"
                              type="email"
                              placeholder="vendor@email.com"
                              defaultValue={inv?.email ?? ''}
                              required
                            />
                            <button className="mini" type="submit">
                              {inv ? 'Resend invite' : 'Send invite'}
                            </button>
                          </form>
                        </details>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
          <aside className="col-side">
            <h3>Add vendor</h3>
            <VendorForm />
          </aside>
        </section>
      </main>
    </AppShell>
  )
}
