import { redirect, notFound } from 'next/navigation'
import { getUserCached, getProjectCached } from '@/lib/context'
import { listBroadcasts, audienceCounts } from '@vivahsync/db'
import PageHeader from '../../../_shell/PageHeader'
import SubmitButton from '@/app/_components/SubmitButton'
import { sendBroadcastAction } from './actions'

export const dynamic = 'force-dynamic'

const AUDIENCE_LABEL: Record<string, string> = {
  ALL: 'Everyone',
  PENDING_RSVP: 'Awaiting RSVP',
  ATTENDING: 'Confirmed attending',
  ARRIVING: 'Arriving guests',
}

export default async function BroadcastPage({
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

  const [log, counts] = await Promise.all([listBroadcasts(user.id, id), audienceCounts(user.id, id)])

  return (
    <main className="dash">
      <PageHeader kicker="Segmented reminders · itineraries · message log" title="Guest messaging" />

      {err && <p className="err banner">{err}</p>}
      {msg && <p className="ok banner">{msg}</p>}

      <p className="bcnote">
        Sending is <strong>stubbed</strong> — messages are logged and recipients snapshotted, but nothing
        is dispatched until a WhatsApp / SMS / email provider is connected. Each guest party also has a
        personalized digital itinerary + QR pass on its RSVP link.
      </p>

      <section className="dashbody" style={{ marginTop: '1.25rem' }}>
        <div className="col-main">
          <div className="col-head">
            <h2>Message log</h2>
            <span className="count">{log.length}</span>
          </div>
          {log.length === 0 ? (
            <div className="empty">No broadcasts yet. Compose one on the right.</div>
          ) : (
            <ul className="bclog">
              {log.map((b) => (
                <li key={b.id} className="bcrow">
                  <div className="bchead">
                    <span className="badge st-accepted" style={{ position: 'static' }}>
                      {b.channel}
                    </span>
                    <span className="bcaud">{AUDIENCE_LABEL[b.audience] ?? b.audience}</span>
                    <span className="bcmeta">
                      {b.recipients} recipient{b.recipients !== 1 ? 's' : ''} · {b.sent}
                    </span>
                  </div>
                  {b.subject && <div className="bcsubject">{b.subject}</div>}
                  <div className="bcbody">{b.body}</div>
                  {b.names.length > 0 && (
                    <div className="bcnames">→ {b.names.slice(0, 8).join(', ')}{b.names.length > 8 ? ` +${b.names.length - 8} more` : ''}</div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        <aside className="col-side">
          <h3>Compose broadcast</h3>
          <form action={sendBroadcastAction} className="newform">
            <input type="hidden" name="projectId" value={id} />
            <label>
              Channel
              <select name="channel" defaultValue="WHATSAPP">
                <option value="WHATSAPP">WhatsApp</option>
                <option value="SMS">SMS</option>
                <option value="EMAIL">Email</option>
              </select>
            </label>
            <label>
              Audience
              <select name="audience" defaultValue="ALL">
                <option value="ALL">Everyone ({counts.ALL})</option>
                <option value="PENDING_RSVP">Awaiting RSVP ({counts.PENDING_RSVP})</option>
                <option value="ATTENDING">Confirmed attending ({counts.ATTENDING})</option>
                <option value="ARRIVING">Arriving guests ({counts.ARRIVING})</option>
              </select>
            </label>
            <label>
              Subject (email)
              <input name="subject" placeholder="optional" />
            </label>
            <label>
              Message
              <textarea name="body" rows={5} required placeholder="Namaste! A quick reminder…" />
            </label>
            <SubmitButton pendingLabel="Queuing…">Send broadcast</SubmitButton>
          </form>
        </aside>
      </section>
    </main>
  )
}
