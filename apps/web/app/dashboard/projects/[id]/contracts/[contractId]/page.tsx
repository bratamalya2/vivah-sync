import Link from 'next/link'
import { redirect, notFound } from 'next/navigation'
import { getUserCached } from '@/lib/context'
import { getContract } from '@vivahsync/db'
import PageHeader from '../../../../_shell/PageHeader'
import MilestoneGrid from './MilestoneGrid'
import {
  activateContractAction,
  setDraftAction,
  deleteContractAction,
  toggleMilestonePaidAction,
} from '../actions'

export const dynamic = 'force-dynamic'
const inr = (n: number) => `₹${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(n)}`

export default async function ContractDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; contractId: string }>
  searchParams: Promise<{ err?: string; msg?: string; prevented?: string }>
}) {
  const { id, contractId } = await params
  const { err, msg, prevented } = await searchParams
  const user = await getUserCached()
  if (!user) redirect('/login')

  const contract = await getContract(user.id, contractId)
  if (!contract || contract.project_id !== id) notFound()

  const planned = contract.milestones.reduce((s, m) => s + m.amount, 0)
  const paid = contract.milestones.filter((m) => m.paid).reduce((s, m) => s + m.amount, 0)
  const active = contract.status === 'ACTIVE'

  return (
    <main className="dash">
      <PageHeader kicker={`${contract.vendor_name} · ${inr(contract.total_amount)}`} title={contract.title}>
        <Link href={`/dashboard/projects/${id}/contracts`} className="ghost">
          ← Contracts
        </Link>
      </PageHeader>

      {prevented && <p className="prevented banner">{prevented}</p>}
      {err && <p className="err banner">{err}</p>}
      {msg && <p className="ok banner">{msg}</p>}

      <div className="projsub">
        <span className={`badge ${active ? 'st-accepted' : 'st-draft'}`}>{active ? 'Active' : 'Draft'}</span> ·{' '}
        {inr(paid)} paid · {inr(planned)} planned of {inr(contract.total_amount)}
        {contract.notes ? ` · ${contract.notes}` : ''}
      </div>

      {active ? (
        <ul className="mplan">
          {contract.milestones.map((m) => (
            <li key={m.id} className="mplan-row">
              <span className="mplan-label">{m.label}</span>
              <span className="mplan-due">{m.due_date ?? 'no date'}</span>
              <span className="mplan-amt">{inr(m.amount)}</span>
              <span className={`badge ${m.paid ? 'st-accepted' : 'st-sent'}`}>{m.paid ? 'Paid' : 'Due'}</span>
              <form action={toggleMilestonePaidAction} className="inlineform">
                <input type="hidden" name="projectId" value={id} />
                <input type="hidden" name="contractId" value={contractId} />
                <input type="hidden" name="milestoneId" value={m.id} />
                <input type="hidden" name="paid" value={m.paid ? 'false' : 'true'} />
                <button className="mini ghostmini" type="submit">
                  {m.paid ? 'Mark unpaid' : 'Mark paid'}
                </button>
              </form>
            </li>
          ))}
        </ul>
      ) : (
        <div style={{ marginTop: '1.25rem' }}>
          <MilestoneGrid
            projectId={id}
            contractId={contractId}
            total={contract.total_amount}
            initial={contract.milestones}
          />
        </div>
      )}

      <div className="lactions" style={{ marginTop: '1.25rem' }}>
        {active ? (
          <form action={setDraftAction}>
            <input type="hidden" name="projectId" value={id} />
            <input type="hidden" name="contractId" value={contractId} />
            <button className="mini ghostmini" type="submit">
              Back to draft (edit plan)
            </button>
          </form>
        ) : (
          <form action={activateContractAction}>
            <input type="hidden" name="projectId" value={id} />
            <input type="hidden" name="contractId" value={contractId} />
            <button className="mini" type="submit">
              Activate contract
            </button>
          </form>
        )}
        <form action={deleteContractAction}>
          <input type="hidden" name="projectId" value={id} />
          <input type="hidden" name="contractId" value={contractId} />
          <button className="mini ghostmini" type="submit">
            Delete
          </button>
        </form>
      </div>
    </main>
  )
}
