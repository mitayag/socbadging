export default function ClassWorkspaceLoading() {
  return (
    <section aria-busy="true" aria-live="polite" className="workspace-page">
      <span className="sr-only">Loading class workspace</span>
      <div className="dashboard-hero">
        <div className="skeleton skeleton-line short" />
        <div className="skeleton skeleton-title" />
        <div className="skeleton skeleton-line" />
      </div>
      <div className="skeleton skeleton-line" aria-hidden="true" />
      <div className="data-table-scroll" aria-hidden="true">
        <div className="faculty-loading-rows">
          {Array.from({ length: 6 }, (_, index) => (
            <div className="skeleton skeleton-line" key={index} />
          ))}
        </div>
      </div>
    </section>
  );
}
