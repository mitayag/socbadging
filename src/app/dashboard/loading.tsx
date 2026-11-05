export default function DashboardLoading() {
  return (
    <section aria-busy="true" aria-live="polite" className="workspace-page dashboard-page">
      <span className="sr-only">Loading dashboard</span>
      <div className="dashboard-hero">
        <div className="skeleton skeleton-line short" />
        <div className="skeleton skeleton-title" />
        <div className="skeleton skeleton-line" />
      </div>
      <div aria-hidden="true" className="stat-grid">
        {Array.from({ length: 7 }, (_, index) => (
          <div className="stat-card skeleton-card" key={index}>
            <div className="skeleton skeleton-line short" />
            <div className="skeleton skeleton-number" />
          </div>
        ))}
      </div>
      <div aria-hidden="true" className="dashboard-split">
        <div className="panel dashboard-panel">
          <div className="skeleton skeleton-line short" />
          <div className="skeleton skeleton-chart" />
        </div>
        <div className="panel dashboard-panel">
          <div className="skeleton skeleton-line short" />
          <div className="skeleton skeleton-line" />
          <div className="skeleton skeleton-line" />
          <div className="skeleton skeleton-line" />
        </div>
      </div>
    </section>
  );
}
