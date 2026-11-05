import Link from "next/link";
import { redirect } from "next/navigation";

import { AppShell } from "@/components/layout/app-shell";
import { getCurrentActor } from "@/modules/identity/services/current-actor";
import { changeRequiredPasswordAction } from "./actions";

export const dynamic = "force-dynamic";

const errors: Record<string, string> = {
  mismatch: "The passwords do not match.",
  current: "Your current password is incorrect.",
  policy: "Use a new password between 14 and 200 characters.",
  invalid: "Your password could not be changed. Try again.",
};

export default async function RequiredPasswordChangePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const actor = await getCurrentActor();
  if (!actor) redirect("/login");
  if (actor.role !== "STUDENT") redirect("/dashboard");
  if (!actor.mustChangePassword) redirect("/student");
  const query = await searchParams;
  const error = query.error ? errors[query.error] : null;

  return (
    <AppShell actor={actor} title="Choose a New Password">
      <section className="workspace-page narrow">
        <div className="page-heading">
          <span className="eyebrow">Account Security</span>
          <h1>Choose a New Password</h1>
          <p>
            An administrator or faculty member reset your password. Choose a new password before
            continuing to the student portal.
          </p>
        </div>
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="panel">
          <form action={changeRequiredPasswordAction} className="form-grid">
            <label className="field full">
              Current Password
              <input
                autoComplete="current-password"
                maxLength={200}
                name="currentPassword"
                required
                type="password"
              />
            </label>
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
            <p className="muted field full">Use at least 14 characters.</p>
            <button className="primary-button form-submit">Update Password</button>
          </form>
        </div>
        <Link className="text-button" href="/login">
          Return to sign in
        </Link>
      </section>
    </AppShell>
  );
}
