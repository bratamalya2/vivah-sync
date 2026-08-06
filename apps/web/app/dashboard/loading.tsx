// Skeleton shown while the dashboard loads — a shell-shaped placeholder instead
// of a blank screen. (The agency pages render their own AppShell, so this mimics
// the top bar + sidebar too.)
export default function DashboardLoading() {
  return (
    <div className="shell-root">
      <div className="shell-topbar" />
      <div className="shell-body">
        <aside className="shell-sidebar" />
        <div className="shell-main">
          <main className="dash">
            <div className="pagehead">
              <div style={{ flex: 1 }}>
                <div className="skel" style={{ height: 10, width: 150, marginBottom: 9 }} />
                <div className="skel" style={{ height: 22, width: '45%' }} />
              </div>
            </div>
            <div className="skel-grid" style={{ marginTop: 18 }}>
              <div className="skel" />
              <div className="skel" />
              <div className="skel" />
              <div className="skel" />
              <div className="skel" />
            </div>
            <div className="skel-stack" style={{ marginTop: 20 }}>
              <div className="skel" style={{ height: 120 }} />
              <div className="skel" style={{ height: 120 }} />
            </div>
          </main>
        </div>
      </div>
    </div>
  )
}
