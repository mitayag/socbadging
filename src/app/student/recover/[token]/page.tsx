import Link from "next/link";

import { getStudentRecoveryInfo } from "@/modules/student/services/student-account-service";
import { resetStudentPasswordAction } from "../actions";

export const dynamic = "force-dynamic";

const errors: Record<string, string> = {
  mismatch: "The passwords do not match.",
  invalid: "This recovery link is invalid, expired, or already used.",
};

export default async function StudentRecoveryResetPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const [{ token }, query] = await Promise.all([params, searchParams]);
  const info = await getStudentRecoveryInfo(token);
  const error = query.error ? errors[query.error] : null;
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
          <h1>Choose a New Password</h1>
          <p>Your recovery link is short-lived and can be used once.</p>
        </div>
      </section>
      <section className="auth-panel" aria-labelledby="reset-heading">
        <div className="auth-card">
          <h2 id="reset-heading">Reset Password</h2>
          {info ? (
            <>
              <p>Hello {info.firstName}, choose a new password for your student account.</p>
              {error ? (
                <p className="auth-error" role="alert">
                  {error}
                </p>
              ) : null}
              <form action={resetStudentPasswordAction}>
                <input name="token" type="hidden" value={token} />
                <label className="field">
                  New Password
                  <input
                    autoComplete="new-password"
                    maxLength={200}
                    minLength={14}
                    name="password"
                    required
                    type="password"
                  />
                </label>
                <label className="field">
                  Confirm New Password
                  <input
                    autoComplete="new-password"
                    maxLength={200}
                    minLength={14}
                    name="confirmPassword"
                    required
                    type="password"
                  />
                </label>
                <button className="primary-button" type="submit">
                  Reset Password
                </button>
              </form>
            </>
          ) : (
            <>
              <p className="auth-error" role="alert">
                This recovery link is invalid, expired, or already used.
              </p>
              <Link className="text-button" href="/student/recover">
                Request a new recovery link
              </Link>
            </>
          )}
        </div>
      </section>
    </main>
  );
}
