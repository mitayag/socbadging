export default function StudentLoading() {
  return (
    <section aria-busy="true" aria-live="polite" className="workspace-page student-page">
      <span className="sr-only">Loading student portal</span>
      <div className="dashboard-hero">
        <div className="skeleton skeleton-line short" />
        <div className="skeleton skeleton-title" />
        <div className="skeleton skeleton-line" />
      </div>
      <div aria-hidden="true" className="stat-grid">
        {Array.from({ length: 4 }, (_, index) => (
          <div className="stat-card skeleton-card" key={index}>
            <div className="skeleton skeleton-line short" />
            <div className="skeleton skeleton-number" />
          </div>
        ))}
      </div>
      <div className="panel dashboard-panel">
        <div className="skeleton skeleton-line short" />
        <div className="skeleton skeleton-chart" />
      </div>
    </section>
  );
}
