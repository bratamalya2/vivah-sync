// Content skeleton for a project route — rendered inside the project layout's
// AppShell, so the top bar + sidebar stay put and only the content shimmers.
export default function ProjectLoading() {
  return (
    <main className="dash">
      <div className="pagehead">
        <div style={{ flex: 1 }}>
          <div className="skel" style={{ height: 10, width: 120, marginBottom: 9 }} />
          <div className="skel" style={{ height: 22, width: '40%' }} />
        </div>
      </div>
      <div className="skel-stack" style={{ marginTop: 18 }}>
        <div className="skel" style={{ height: 90 }} />
        <div className="skel" style={{ height: 160 }} />
        <div className="skel" style={{ height: 160 }} />
      </div>
    </main>
  )
}
