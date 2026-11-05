import Link from "next/link";

import { requestStudentRecoveryAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function StudentRecoveryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const query = await searchParams;
  return (
    <main className="auth-page">
      <section className="auth-brand">
        <div className="auth-brand-header">
          <div className="brand-wordmark" aria-label="HAU SOC Badging System">
            <span data-brand-line="institution">HAU SOC</span>
            <span data-brand-line="product">Badging System</span>
          </div>
        </div>
        <div>
          <h1>Student Account Recovery</h1>
          <p>Request a single-use recovery link for your verified institutional email.</p>
        </div>
        <small>Authorized students only</small>
      </section>
      <section className="auth-panel" aria-labelledby="recovery-heading">
        <div className="auth-card">
          <h2 id="recovery-heading">Recover Access</h2>
          {query.notice === "sent" ? (
            <p className="auth-success" role="status">
              If a student account matches, a recovery email has been sent. The link expires shortly
              and can be used once.
            </p>
          ) : null}
          <form action={requestStudentRecoveryAction}>
            <label className="field">
              Student Number or Institutional Email
              <input name="identifier" required />
            </label>
            <button className="primary-button" type="submit">
              Send Recovery Email
            </button>
          </form>
          <Link className="text-button" href="/login">
            Return to sign in
          </Link>
        </div>
      </section>
    </main>
  );
}
