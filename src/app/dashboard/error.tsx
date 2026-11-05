"use client";

export default function DashboardError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <section aria-live="assertive" className="workspace-page dashboard-page">
      <div className="panel dashboard-error">
        <span className="eyebrow">Dashboard Unavailable</span>
        <h1>We could not load your dashboard</h1>
        <p>
          Your session is still active. Try loading the dashboard again, or continue to another
          authorized page.
        </p>
        <button className="primary-button" onClick={reset} type="button">
          Try again
        </button>
      </div>
    </section>
  );
}
