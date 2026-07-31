/* eslint-disable @next/next/no-img-element */
import { redirect, notFound } from 'next/navigation'
import { getUser } from '@/lib/auth'
import { familyRunsheet, type FamilyRunsheet } from '@vivahsync/db'
import { categoryLabel } from '@/lib/categories'
import AppShell from '@/app/dashboard/_shell/AppShell'
import PageHeader from '@/app/dashboard/_shell/PageHeader'

export const dynamic = 'force-dynamic'

export default async function FamilyRunsheetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await getUser()
  if (!user) redirect('/login')

  let rs: FamilyRunsheet
  try {
    rs = await familyRunsheet(user.id, id)
  } catch {
    notFound() // not authorized / not shared with this family member
  }

  return (
    <AppShell
      scope="family"
      user={user}
      org={null}
      project={{
        id,
        name: rs.project.name,
        city: rs.project.city,
        start_date: rs.project.start_date,
        end_date: rs.project.end_date,
      }}
    >
      <main className="dash">
        <PageHeader kicker="Read-only schedule" title={rs.project.name} />

      <div className="projsub">
        {rs.project.city} · {rs.project.start_date} → {rs.project.end_date}
      </div>

      <div className="timeline" style={{ marginTop: '1.5rem' }}>
        {rs.days.map((d) => (
          <div key={d.date} className="dayblock">
            <div className="dayhead">
              <span className="daynum">Day {d.day_index + 1}</span>
              <span className="daydate">{d.date}</span>
            </div>
            {d.events.length === 0 ? (
              <div className="dayempty">No ceremonies scheduled</div>
            ) : (
              <ul className="evlist">
                {d.events.map((e, i) => (
                  <li key={i} className="evitem">
                    <div className="evtime">
                      {e.starts_at}–{e.ends_at}
                    </div>
                    <div className="evbody">
                      <div className="evname">{e.name}</div>
                      {e.spaces.length > 0 && (
                        <div className="evmeta">
                          {e.spaces.map((sp) => `${sp.venue} · ${sp.space}`).join(', ')}
                        </div>
                      )}
                      {e.vendors.length > 0 && (
                        <ul className="pbvendors">
                          {e.vendors.map((v, j) => (
                            <li key={j}>
                              <span className="pbcat">{categoryLabel(v.category)}</span>
                              <span className="pbvend">{v.name}</span>
                              <span className="pbtimes">
                                arrives {v.arrival}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                      {e.media.length > 0 && (
                        <>
                          <div className="evmeta" style={{ marginTop: '0.5rem', fontWeight: 600 }}>
                            Setup photos
                          </div>
                          <ul className="evidencelist" style={{ marginTop: '0.3rem' }}>
                            {e.media.map((m) => (
                              <li key={m.id}>
                                <a href={`/media/${m.id}`} target="_blank" rel="noopener noreferrer">
                                  {m.content_type?.startsWith('image/') ? (
                                    <img
                                      src={`/media/${m.id}`}
                                      alt={m.file_name ?? 'photo'}
                                      className="evthumb"
                                    />
                                  ) : (
                                    <span className="evfile">📎 {m.file_name ?? 'file'}</span>
                                  )}
                                </a>
                              </li>
                            ))}
                          </ul>
                        </>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>

      <p className="muted" style={{ marginTop: '1.5rem', fontSize: '0.8rem' }}>
        This is a read-only schedule. Contract, pricing and vendor contact details are not shown.
      </p>
      </main>
    </AppShell>
  )
}
