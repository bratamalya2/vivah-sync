import { redirect, notFound } from 'next/navigation'
import { getUserCached, getProjectCached } from '@/lib/context'
import { listProjectLedger, listVendors } from '@vivahsync/db'
import LedgerRow from './LedgerRow'
import { addLedgerAction } from './actions'
import PageHeader from '../../../_shell/PageHeader'

export const dynamic = 'force-dynamic'

const MODES = ['CASH', 'BANK', 'UPI', 'CARD']
const PAYERS = ['CLIENT', 'PLANNER', 'VENDOR', 'VENUE']
const inr = (n: number) => `₹${new Intl.NumberFormat('en-IN').format(n)}`

export default async function LedgerPage({
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

  const [entries, vendors] = await Promise.all([
    listProjectLedger(user.id, id),
    listVendors(user.id),
  ])
  const vendorOpts = vendors.map((v) => ({ id: v.id, name: v.name }))

  const totalIn = entries.filter((e) => e.direction === 'INFLOW').reduce((s, e) => s + e.amount, 0)
  const totalOut = entries.filter((e) => e.direction === 'OUTFLOW').reduce((s, e) => s + e.amount, 0)
  const net = totalIn - totalOut

  return (
    <main className="dash">
      <PageHeader kicker="Money · immutable, append-only" title="Ledger" />

      {err && <p className="err banner">{err}</p>}
      {msg && <p className="ok banner">{msg}</p>}

      <div className="ledgertotals">
        <div className="lt">
          <span className="ltlabel">Money in</span>
          <span className="ltval inflow">{inr(totalIn)}</span>
        </div>
        <div className="lt">
          <span className="ltlabel">Money out</span>
          <span className="ltval outflow">{inr(totalOut)}</span>
        </div>
        <div className="lt">
          <span className="ltlabel">Net position</span>
          <span className={`ltval ${net >= 0 ? 'inflow' : 'outflow'}`}>{inr(net)}</span>
        </div>
      </div>

      <p className="muted summarysub">
        Entries can be edited or deleted for 15 minutes after they&apos;re recorded; after that
        they lock and can only be corrected with a reversing entry.
      </p>

      <section className="dashbody">
        <div className="col-main">
          <div className="col-head">
            <h2>Entries</h2>
            <span className="count">{entries.length}</span>
          </div>
          {entries.length === 0 ? (
            <div className="empty">No payments recorded yet. Add one from the panel on the right.</div>
          ) : (
            <ul className="ledgerlist">
              {entries.map((e) => (
                <LedgerRow key={e.id} entry={e} projectId={id} vendors={vendorOpts} />
              ))}
            </ul>
          )}
        </div>

        <aside className="col-side">
          <h3>Record a payment</h3>
          <form action={addLedgerAction} className="ledgerform">
            <input type="hidden" name="projectId" value={id} />
            <div className="row2">
              <label>
                Direction
                <select name="direction" defaultValue="INFLOW">
                  <option value="INFLOW">Money in</option>
                  <option value="OUTFLOW">Money out</option>
                </select>
              </label>
              <label>
                Amount ₹
                <input name="amount" type="number" min="1" step="0.01" required placeholder="50000" />
              </label>
            </div>
            <div className="row2">
              <label>
                Mode
                <select name="mode" defaultValue="BANK">
                  {MODES.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Payer
                <select name="payer" defaultValue="CLIENT">
                  {PAYERS.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label>
              Vendor (optional)
              <select name="vendorId" defaultValue="">
                <option value="">—</option>
                {vendorOpts.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Paid at (blank = now)
              <input name="paidAt" type="datetime-local" />
            </label>
            <label>
              Note
              <input name="note" placeholder="e.g. booking advance" />
            </label>
            <button type="submit">Record payment</button>
          </form>
        </aside>
      </section>
    </main>
  )
}
