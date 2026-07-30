import { redirect } from 'next/navigation'
import { getUser } from '@/lib/auth'
import { getMyContext, listVendors } from '@vivahsync/db'
import { categoryLabel } from '@/lib/categories'
import VendorForm from './VendorForm'
import AppShell from '../_shell/AppShell'
import PageHeader from '../_shell/PageHeader'

export const dynamic = 'force-dynamic'

export default async function VendorsPage() {
  const user = await getUser()
  if (!user) redirect('/login')
  const ctx = await getMyContext(user.id)
  if (!ctx.org) redirect('/onboarding')

  const vendors = await listVendors(user.id)

  return (
    <AppShell scope="agency" user={user} org={ctx.org}>
      <main className="dash">
        <PageHeader kicker="Reusable vendor roster" title="Vendors" />

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
              {vendors.map((v) => (
                <li key={v.id} className="projitem">
                  <div className="pname">{v.name}</div>
                  <div className="pmeta">
                    {categoryLabel(v.category)}
                    {v.contact_name ? ` · ${v.contact_name}` : ''}
                    {v.contact_phone ? ` · ${v.contact_phone}` : ''}
                  </div>
                  <span className="badge">{categoryLabel(v.category)}</span>
                </li>
              ))}
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
