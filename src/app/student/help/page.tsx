import Link from "next/link";
import { redirect } from "next/navigation";

import { AppShell } from "@/components/layout/app-shell";
import { getCurrentActor } from "@/modules/identity/services/current-actor";

export const dynamic = "force-dynamic";

export default async function StudentHelpPage() {
  const actor = await getCurrentActor();
  if (!actor) redirect("/login");
  if (actor.role !== "STUDENT") redirect("/dashboard");
  return (
    <AppShell actor={actor} title="Help">
      <section className="workspace-page narrow student-page">
        <div className="page-heading">
          <span className="eyebrow">Student Help</span>
          <h1>Badge Access Help</h1>
          <p>How to view, verify, download, and share your credentials.</p>
        </div>
        <section className="panel credential-panel">
          <h2>Public verification</h2>
          <p>
            Every badge has a public verification link. Anyone with the link can confirm the badge
            name, issuer, recipient display identity, issue date, and current status without signing
            in. The link never exposes your email address or student number.
          </p>
          <h2>Downloads</h2>
          <p>
            Use My Badges to download the signed JSON-LD credential, badge artwork, or a
            human-readable PDF summary. The signed JSON-LD is the authoritative credential.
          </p>
          <h2>Lost access</h2>
          <p>
            If you lose access to your account, use the recovery form. Recovery links are
            short-lived and single-use. If you lose the original issuance email, open My Badges to
            retrieve the public verification link.
          </p>
          <div className="inline-actions">
            <Link className="secondary-button export-link" href="/student/badges">
              Open My Badges
            </Link>
            <Link className="secondary-button export-link" href="/student/recover">
              Account Recovery
            </Link>
          </div>
        </section>
      </section>
    </AppShell>
  );
}
