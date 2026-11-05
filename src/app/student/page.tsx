import Link from "next/link";
import { redirect } from "next/navigation";

import { AppShell } from "@/components/layout/app-shell";
import { StudentBadgeCollection } from "@/components/student/student-badge-collection";
import { StudentStatCards } from "@/components/student/student-stat-cards";
import { getCurrentActor } from "@/modules/identity/services/current-actor";
import {
  getStudentDashboard,
  listStudentBadges,
} from "@/modules/student/services/student-portal-service";
import type { StudentBadgeSort, StudentCredentialStatus } from "@/modules/student/types";

export const dynamic = "force-dynamic";

function parseStatus(value: string | undefined): StudentCredentialStatus | undefined {
  return value === "ACTIVE" || value === "REVOKED" || value === "EXPIRED" ? value : undefined;
}

function parseSort(value: string | undefined): StudentBadgeSort {
  return value === "issued_asc" || value === "status" ? value : "issued_desc";
}

function parseView(value: string | undefined): "grid" | "list" {
  return value === "list" ? "list" : "grid";
}

export default async function StudentOverviewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const actor = await getCurrentActor();
  if (!actor) redirect("/login");
  if (actor.role !== "STUDENT") redirect("/dashboard");
  const params = await searchParams;
  const query = {
    q: params.q,
    status: parseStatus(params.status),
    sort: parseSort(params.sort),
    view: parseView(params.view),
  };
  const [data, badges] = await Promise.all([
    getStudentDashboard(actor),
    listStudentBadges(actor, {
      query: query.q,
      status: query.status,
      sort: query.sort,
      page: Math.max(1, Number(params.page) || 1),
    }),
  ]);
  const firstName = actor.name.trim().split(/\s+/)[0] || actor.name;

  return (
    <AppShell actor={actor} title="Student Portal">
      <section className="workspace-page student-page">
        <header className="dashboard-hero">
          <span className="eyebrow">Student Overview</span>
          <h1>Welcome back, {firstName}</h1>
          <p>Review every earned credential, current status, and public verification option.</p>
        </header>
        <StudentStatCards data={data} />
        <section className="panel dashboard-panel" aria-labelledby="student-badges-heading">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Credential Wallet</span>
              <h2 id="student-badges-heading">All Earned Badges</h2>
            </div>
            <Link className="secondary-button export-link" href="/student/notifications">
              Notifications
            </Link>
          </div>
          <StudentBadgeCollection
            basePath="/student"
            hasNext={badges.hasNext}
            items={badges.items}
            page={badges.page}
            query={query}
          />
        </section>
        <section className="panel dashboard-panel" aria-labelledby="student-links-heading">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Account</span>
              <h2 id="student-links-heading">Helpful Links</h2>
            </div>
          </div>
          <div className="quick-actions-grid">
            <Link className="quick-action" href="/student/profile">
              <span>
                <strong>Profile</strong>
                <small>Review your verified email, student number, and security settings.</small>
              </span>
            </Link>
            <Link className="quick-action" href="/student/help">
              <span>
                <strong>Help</strong>
                <small>Learn how public verification and credential downloads work.</small>
              </span>
            </Link>
          </div>
        </section>
      </section>
    </AppShell>
  );
}
