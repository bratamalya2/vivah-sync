import Link from 'next/link'
import { redirect, notFound } from 'next/navigation'
import { getUserCached, getProjectCached } from '@/lib/context'
import {
  listPlaybooks,
  getPlaybook,
  listProposals,
  listRenderStatuses,
} from '@vivahsync/db'
import { categoryLabel } from '@/lib/categories'
import { generatePlaybookAction } from './actions'
import PageHeader from '../../../_shell/PageHeader'

export const dynamic = 'force-dynamic'

export default async function PlaybookPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ pb?: string; err?: string; msg?: string }>
}) {
  const { id } = await params
  const { pb, err, msg } = await searchParams
  const user = await getUserCached()
  if (!user) redirect('/login')

  const project = await getProjectCached(user.id, id)
  if (!project) notFound()

  const [history, proposals, renderStatuses] = await Promise.all([
    listPlaybooks(user.id, id),
    listProposals(user.id, id),
    listRenderStatuses(user.id, id),
  ])
  const statusById = new Map(renderStatuses.map((r) => [r.playbook_id, r.status]))
  const pendingChanges = proposals.filter((p) => p.status === 'PROPOSED').length
  const selectedId = pb ?? history[0]?.id
  const playbook = selectedId ? await getPlaybook(user.id, selectedId) : null
  const selectedMeta = history.find((h) => h.id === selectedId)
  const selectedStatus = selectedId ? statusById.get(selectedId) : undefined

  return (
    <main className="dash">
      <PageHeader kicker="Deterministic snapshot · immutable once generated" title="Playbook">
        <form action={generatePlaybookAction}>
          <input type="hidden" name="projectId" value={id} />
          <button type="submit" className="mini">
            Generate playbook
          </button>
        </form>
      </PageHeader>

      {err && <p className="err banner">{err}</p>}
      {msg && <p className="ok banner">{msg}</p>}
      {pendingChanges > 0 && (
        <p className="warn banner">
          {pendingChanges} schedule change{pendingChanges > 1 ? 's are' : ' is'} still pending —
          generating now produces a <strong>Draft</strong> playbook.
        </p>
      )}

      <section className="dashbody">
        <div className="col-main">
          {!playbook ? (
            <div className="empty">
              No playbook generated yet. Click <strong>Generate playbook</strong> to compile the
              current run of show, spaces, and committed vendors into a versioned document.
            </div>
          ) : (
            <div className="playbook">
              <div className="pbmeta">
                <h2>
                  Version {selectedMeta?.version ?? playbook.version}
                  {playbook.is_draft && <span className="badge ff-open">DRAFT</span>}
                </h2>
                <div className="pbmetaright">
                  <span className="daydate">Generated {playbook.generated_at} IST</span>
                  {selectedStatus === 'READY' ? (
                    <a
                      href={`/dashboard/projects/${id}/playbook/${selectedId}/pdf`}
                      target="_blank"
                      rel="noopener"
                      className="mini pdfbtn"
                    >
                      ⬇ Download PDF
                    </a>
                  ) : selectedStatus === 'FAILED' ? (
                    <span className="pdfstatus failed">PDF render failed</span>
                  ) : (
                    <span className="pdfstatus">PDF rendering…</span>
                  )}
                </div>
              </div>
              <div className="projsub">
                {playbook.snapshot.project.city} · {playbook.snapshot.project.start_date} →{' '}
                {playbook.snapshot.project.end_date}
                {playbook.snapshot.project.expected_guest_count
                  ? ` · ${playbook.snapshot.project.expected_guest_count} guests`
                  : ''}
              </div>

              <div className="timeline">
                {playbook.snapshot.days.map((d) => (
                  <div key={d.date} className="dayblock">
                    <div className="dayhead">
                      <span className="daynum">Day {d.day_index + 1}</span>
                      <span className="daydate">{d.date}</span>
                    </div>
                    {d.events.length === 0 ? (
                      <div className="dayempty">No ceremonies</div>
                    ) : (
                      <ul className="evlist">
                        {d.events.map((e, i) => (
                          <li key={i} className="evitem pbev">
                            <div className="evtime">
                              {e.starts_at}–{e.ends_at}
                            </div>
                            <div className="evbody">
                              <div className="evname">{e.name}</div>
                              <div className="evmeta">
                                {e.spaces.length > 0
                                  ? e.spaces.map((sp) => `${sp.venue} · ${sp.space}`).join(', ')
                                  : 'No space assigned'}
                                {e.expected_guest_count ? ` · ${e.expected_guest_count} guests` : ''}
                                {e.setup_minutes || e.teardown_minutes
                                  ? ` · setup +${e.setup_minutes}m / teardown +${e.teardown_minutes}m`
                                  : ''}
                              </div>
                              {e.overrides.length > 0 && (
                                <ul className="pboverrides">
                                  {e.overrides.map((o, k) => (
                                    <li key={k}>
                                      ⚑ {o.rule_key}: {o.value} — {o.rationale}
                                    </li>
                                  ))}
                                </ul>
                              )}
                              {e.vendors.length > 0 && (
                                <ul className="pbvendors">
                                  {e.vendors.map((v, j) => (
                                    <li key={j}>
                                      <span className="pbcat">{categoryLabel(v.category)}</span>
                                      {v.vendor ? (
                                        <>
                                          <span className="pbvend">{v.vendor.name}</span>
                                          <span className={`badge st-${v.vendor.status.toLowerCase()}`}>
                                            {v.vendor.status}
                                          </span>
                                          <span className="pbtimes">
                                            {v.arrival}–{v.completion}
                                          </span>
                                          {v.vendor.phone && <span className="pbphone">{v.vendor.phone}</span>}
                                        </>
                                      ) : (
                                        <span className="badge ff-unfulfilled">UNASSIGNED</span>
                                      )}
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <aside className="col-side">
          <h3>Versions</h3>
          {history.length === 0 ? (
            <p className="muted">None yet.</p>
          ) : (
            <ul className="versionlist">
              {history.map((h) => (
                <li key={h.id}>
                  <Link
                    href={`/dashboard/projects/${id}/playbook?pb=${h.id}`}
                    className={`versionitem${h.id === selectedId ? ' current' : ''}`}
                  >
                    <span className="vnum">v{h.version}</span>
                    {h.is_draft && <span className="badge ff-open">draft</span>}
                    <span
                      className={`pdfdot ${(statusById.get(h.id) ?? 'PENDING').toLowerCase()}`}
                      title={`PDF ${statusById.get(h.id) ?? 'PENDING'}`}
                    >
                      {statusById.get(h.id) === 'READY'
                        ? 'PDF'
                        : statusById.get(h.id) === 'FAILED'
                          ? 'PDF ✗'
                          : 'PDF …'}
                    </span>
                    <span className="vdate">{h.generated_at}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </section>
    </main>
  )
}
