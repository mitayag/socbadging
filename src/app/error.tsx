"use client";

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="workspace-page" role="alert">
      <div className="panel dashboard-error">
        <h1>Something went wrong</h1>
        <p className="muted">
          The page could not be loaded. Try again. If the problem persists, contact an
          administrator.
        </p>
        <button className="primary-button" onClick={reset} type="button">
          Try again
        </button>
      </div>
    </main>
  );
}
