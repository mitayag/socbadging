"use client";

export default function StudentError({ reset }: { error: Error; reset: () => void }) {
  return (
    <section aria-live="assertive" className="workspace-page student-page">
      <div className="panel dashboard-error">
        <span className="eyebrow">Student Portal Unavailable</span>
        <h1>We could not load your student portal</h1>
        <p>Your session is still active. Try again or return to your dashboard.</p>
        <button className="primary-button" onClick={reset} type="button">
          Try again
        </button>
      </div>
    </section>
  );
}
