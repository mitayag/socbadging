import Link from "next/link";
import { redirect } from "next/navigation";

import { AppShell } from "@/components/layout/app-shell";
import { getCurrentActor } from "@/modules/identity/services/current-actor";
import { listDashboardActivities } from "@/modules/dashboard/services/dashboard-service";

export const dynamic = "force-dynamic";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default async function DashboardActivityPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const actor = await getCurrentActor();
  if (!actor) redirect("/login");
  if (actor.role === "STUDENT") redirect("/student");
  const params = await searchParams;
  const result = await listDashboardActivities(actor, Math.max(1, Number(params.page) || 1));
  return (
    <AppShell actor={actor} title="Operational History">
      <section className="workspace-page">
        <Link className="text-button" href="/dashboard">
          ← Back to dashboard
        </Link>
        <div className="page-heading">
          <span className="eyebrow">Operational History</span>
          <h1>Recent Activities</h1>
          <p>Review class, roster, badge, credential, notification, and signing-key activity.</p>
        </div>
        <section className="panel">
          {result.items.length ? (
            <ol className="activity-list activity-list-page">
              {result.items.map((item) => (
                <li key={item.id}>
                  <span aria-hidden="true" className="activity-dot" />
                  <div>
                    <strong>{item.label}</strong>
                    <small>
                      {item.actorName ?? "System"} · {item.entityType}
                    </small>
                  </div>
                  <time dateTime={item.createdAt}>{formatDate(item.createdAt)}</time>
                </li>
              ))}
            </ol>
          ) : (
            <div className="empty-state">No activity found.</div>
          )}
        </section>
        <nav className="pagination" aria-label="Activity pagination">
          {result.page > 1 ? (
            <Link
              className="secondary-button export-link"
              href={`/dashboard/activity?page=${result.page - 1}`}
            >
              Previous
            </Link>
          ) : null}
          <span>Page {result.page}</span>
          {result.hasNext ? (
            <Link
              className="secondary-button export-link"
              href={`/dashboard/activity?page=${result.page + 1}`}
            >
              Next
            </Link>
          ) : null}
        </nav>
      </section>
    </AppShell>
  );
}
