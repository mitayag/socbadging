import Link from "next/link";
import { redirect } from "next/navigation";

import { AppShell } from "@/components/layout/app-shell";
import { getCurrentActor } from "@/modules/identity/services/current-actor";
import { getStudentAccountForActor } from "@/modules/student/services/student-account-service";
import { getPublicSystemSettings } from "@/modules/settings/services/system-settings-service";

export const dynamic = "force-dynamic";

export default async function StudentProfilePage() {
  const actor = await getCurrentActor();
  if (!actor) redirect("/login");
  if (actor.role !== "STUDENT") redirect("/dashboard");
  const account = await getStudentAccountForActor(actor);
  const settings = await getPublicSystemSettings();
  return (
    <AppShell actor={actor} title="Profile">
      <section className="workspace-page narrow student-page">
        <div className="page-heading">
          <span className="eyebrow">Student Account</span>
          <h1>My Profile</h1>
          <p>Your institutional identity is managed by the School of Computing.</p>
        </div>
        <section className="panel account-summary" aria-labelledby="student-profile-heading">
          <h2 id="student-profile-heading">Student Identity</h2>
          <dl>
            <div>
              <dt>Name</dt>
              <dd>
                {account.student.firstName} {account.student.lastName}
              </dd>
            </div>
            <div>
              <dt>Student Number</dt>
              <dd>{account.student.studentNumber}</dd>
            </div>
            <div>
              <dt>Verified Email</dt>
              <dd>{account.user.email}</dd>
            </div>
            <div>
              <dt>Account Status</dt>
              <dd>{account.user.status}</dd>
            </div>
          </dl>
          <p className="muted">
            Your name, student number, and credential recipient identity cannot be changed from this
            profile. Contact an Administrator for identity corrections.
          </p>
          {settings.supportContact ? (
            <p className="muted">
              Support:{" "}
              <a
                href={
                  settings.supportContact.includes(":")
                    ? settings.supportContact
                    : `mailto:${settings.supportContact}`
                }
              >
                {settings.supportContact}
              </a>
            </p>
          ) : null}
          <div className="inline-actions">
            <Link className="secondary-button export-link" href="/account">
              Account Security
            </Link>
          </div>
        </section>
      </section>
    </AppShell>
  );
}
