import { CheckCircle2 } from "lucide-react";
import { redirect } from "next/navigation";

import { AppShell } from "@/components/layout/app-shell";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { getCurrentActor } from "@/modules/identity/services/current-actor";

export const dynamic = "force-dynamic";
export default async function DashboardPage() {
  const actor = await getCurrentActor();
  if (!actor) redirect("/login");
  const roleLabel = actor.role === "ADMIN" ? "System Administrator" : "Faculty";
  return (
    <AppShell actor={actor}>
      <section className="foundation">
        <h1>Welcome to the HAU SOC Badging System</h1>
        <p>
          Create and manage classes, rosters, badges, and issued credentials from one secure,
          role-aware workspace. Public verification, sharing, revocation, and audit records are
          available now.
        </p>
        <div className="foundation-grid">
          <div>
            <h2>System Readiness</h2>
            <div className="readiness">
              {[
                ["Infrastructure", "Next.js and MariaDB services are configured."],
                ["Access Control", "Authentication and role boundaries are enforced server-side."],
                [
                  "Credential Lifecycle",
                  "Public verification, sharing, exports, revocation, and audit trails are available.",
                ],
              ].map(([title, text]) => (
                <div className="readiness-row" key={title}>
                  <CheckCircle2 aria-hidden="true" size={24} />
                  <div>
                    <strong>{title}</strong>
                    <span>{text}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <aside className="role-card">
            <h2>Your Role</h2>
            <strong>{roleLabel}</strong>
            <p>
              {actor.role === "ADMIN"
                ? "You can manage faculty, review all credential records, audit activity, and issuer settings."
                : "You can manage your profile and the full credential lifecycle of your own classes."}
            </p>
            <SignOutButton />
          </aside>
        </div>
      </section>
    </AppShell>
  );
}
