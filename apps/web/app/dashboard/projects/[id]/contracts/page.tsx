import Link from 'next/link'
import { redirect, notFound } from 'next/navigation'
import { getUserCached, getProjectCached } from '@/lib/context'
import { listProjectContracts, listVendors } from '@vivahsync/db'
import PageHeader from '../../../_shell/PageHeader'
import NewContractForm from './NewContractForm'

export const dynamic = 'force-dynamic'
const inr = (n: number) => `₹${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(n)}`

export default async function ContractsPage({
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

  const [contracts, vendors] = await Promise.all([
    listProjectContracts(user.id, id),
    listVendors(user.id),
  ])

  return (
    <main className="dash">
      <PageHeader kicker="Vendor contracts · every payment plan must total 100%" title="Contracts" />

      {prevented && <p className="prevented banner">{prevented}</p>}
      {err && <p className="err banner">{err}</p>}
      {msg && <p className="ok banner">{msg}</p>}

      <section className="dashbody">
        <div className="col-main">
          <div className="col-head">
            <h2>Contracts</h2>
            <span className="count">{contracts.length}</span>
          </div>
          {contracts.length === 0 ? (
            <div className="empty">
              No contracts yet. Add one on the right — set the total value, then build a payment plan
              that adds up to exactly 100%.
            </div>
          ) : (
            <ul className="projlist">
              {contracts.map((c) => {
                const planPct = c.total_amount > 0 ? Math.min(100, Math.round((c.planned / c.total_amount) * 100)) : 0
                const paidPct = c.total_amount > 0 ? Math.min(100, Math.round((c.paid / c.total_amount) * 100)) : 0
                return (
                  <li key={c.id} className="projitem">
                    <Link href={`/dashboard/projects/${id}/contracts/${c.id}`} className="pname plink">
                      {c.title}
                    </Link>
                    <div className="pmeta">
                      {c.vendor_name} · {inr(c.total_amount)}
                      {c.next_due ? ` · next due ${c.next_due}` : ''}
                    </div>
                    <div className="cbar">
                      <div className="cbar-plan" style={{ width: `${planPct}%` }} />
                      <div className="cbar-paid" style={{ width: `${paidPct}%` }} />
                    </div>
                    <div className="csub">
                      {inr(c.paid)} paid · {inr(c.planned)} planned of {inr(c.total_amount)} ({planPct}%)
                    </div>
                    <span className={`badge ${c.status === 'ACTIVE' ? 'st-accepted' : 'st-draft'}`}>
                      {c.status === 'ACTIVE' ? 'Active' : 'Draft'}
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
        <aside className="col-side">
          <h3>New contract</h3>
          <NewContractForm projectId={id} vendors={vendors.map((v) => ({ id: v.id, name: v.name }))} />
        </aside>
      </section>
    </main>
  )
}
