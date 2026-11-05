export default function FacultyLoading() {
  return (
    <section aria-busy="true" aria-live="polite" className="workspace-page">
      <span className="sr-only">Loading faculty accounts</span>
      <div className="dashboard-hero">
        <div className="skeleton skeleton-line short" />
        <div className="skeleton skeleton-title" />
        <div className="skeleton skeleton-line" />
      </div>
      <div className="panel">
        <div className="skeleton skeleton-line short" />
        <div className="skeleton skeleton-line" />
      </div>
      <div className="filters faculty-toolbar" aria-hidden="true">
        <div className="skeleton skeleton-line" />
        <div className="skeleton skeleton-line short" />
        <div className="skeleton skeleton-line short" />
        <div className="skeleton skeleton-line short" />
      </div>
      <div className="faculty-table-scroll" aria-hidden="true">
        <div className="faculty-loading-rows">
          {Array.from({ length: 8 }, (_, index) => (
            <div className="skeleton skeleton-line" key={index} />
          ))}
        </div>
      </div>
    </section>
  );
}
