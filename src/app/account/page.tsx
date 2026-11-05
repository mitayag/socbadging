import Link from "next/link";
import { redirect } from "next/navigation";

import { AppShell } from "@/components/layout/app-shell";
import { getCurrentActor } from "@/modules/identity/services/current-actor";
import { changePasswordAction, updateAccountNameAction } from "./actions";

export const dynamic = "force-dynamic";

const errors: Record<string, string> = {
  name: "Enter a display name between 2 and 191 characters.",
  "password-mismatch": "The new passwords do not match.",
  "current-password": "Your current password is incorrect.",
  password: "Use a new password between 14 and 200 characters.",
};

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const actor = await getCurrentActor();
  if (!actor) redirect("/login");
  const params = await searchParams;
  const error = params.error ? errors[params.error] : null;
  const roleLabel =
    actor.role === "ADMIN"
      ? "System Administrator"
      : actor.role === "STUDENT"
        ? "Student"
        : "Faculty";

  return (
    <AppShell actor={actor} title="Account Settings">
      <section className="workspace-page narrow account-page">
        <div className="page-heading">
          <span className="eyebrow">Account</span>
          <h1>Account Settings</h1>
          <p>Manage your display name and sign-in password.</p>
        </div>

        {params.notice === "name-updated" ? (
          <p className="notice" role="status">
            Your display name was updated.
          </p>
        ) : null}
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}

        <section className="panel account-summary" aria-labelledby="account-summary-heading">
          <h2 id="account-summary-heading">Account</h2>
          <dl>
            <div>
              <dt>Display Name</dt>
              <dd>{actor.name}</dd>
            </div>
            <div>
              <dt>Email</dt>
              <dd>{actor.email}</dd>
            </div>
            <div>
              <dt>Role</dt>
              <dd>{roleLabel}</dd>
            </div>
          </dl>
          <p className="muted">
            Contact an administrator to change your sign-in email.{" "}
            {actor.role === "ADMIN" ? <Link href="/settings">Manage issuer settings</Link> : null}
          </p>
        </section>

        <section className="panel" aria-labelledby="display-name-heading">
          <h2 id="display-name-heading">Display Name</h2>
          <form action={updateAccountNameAction} className="form-grid">
            <label className="field full">
              Display Name
              <input defaultValue={actor.name} maxLength={191} minLength={2} name="name" required />
            </label>
            <button className="primary-button form-submit">Save Display Name</button>
          </form>
        </section>

        <section className="panel" aria-labelledby="password-heading">
          <h2 id="password-heading">Change Password</h2>
          <p className="muted">
            Changing your password signs out all active sessions, including this one.
          </p>
          <form action={changePasswordAction} className="form-grid">
            <label className="field full">
              Current Password
              <input
                autoComplete="current-password"
                maxLength={1024}
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
                name="newPassword"
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
            <button className="primary-button form-submit">Change Password</button>
          </form>
        </section>
      </section>
    </AppShell>
  );
}
