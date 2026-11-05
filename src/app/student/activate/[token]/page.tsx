import Link from "next/link";

import { getStudentActivationInfo } from "@/modules/student/services/student-account-service";
import { activateStudentAction } from "./actions";

export const dynamic = "force-dynamic";

const errors: Record<string, string> = {
  mismatch: "The passwords do not match.",
  invalid: "This activation link is invalid, expired, or already used.",
};

export default async function StudentActivationPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const [{ token }, query] = await Promise.all([params, searchParams]);
  const info = await getStudentActivationInfo(token);
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
          <h1>Student Badge Portal</h1>
          <p>Activate your account to view and manage your earned credentials.</p>
        </div>
        <small>Authorized students only</small>
      </section>
      <section className="auth-panel" aria-labelledby="activation-heading">
        <div className="auth-card">
          <h2 id="activation-heading">Activate Student Account</h2>
          {info ? (
            <>
              <p>
                Welcome, {info.firstName} {info.lastName}. Confirm your institutional email{" "}
                <strong>{info.email}</strong> by choosing a password.
              </p>
              {error ? (
                <p className="auth-error" role="alert">
                  {error}
                </p>
              ) : null}
              <form action={activateStudentAction}>
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
                  Activate Account
                </button>
              </form>
            </>
          ) : (
            <>
              <p className="auth-error" role="alert">
                This activation link is invalid, expired, or already used.
              </p>
              <Link className="text-button" href="/login">
                Return to sign in
              </Link>
            </>
          )}
        </div>
      </section>
    </main>
  );
}
