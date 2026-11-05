import Link from "next/link";
import { redirect } from "next/navigation";

import { AppShell } from "@/components/layout/app-shell";
import { getCurrentActor } from "@/modules/identity/services/current-actor";
import { listStudentNotifications } from "@/modules/student/services/student-portal-service";

export const dynamic = "force-dynamic";

function label(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

function date(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(value));
}

export default async function StudentNotificationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const actor = await getCurrentActor();
  if (!actor) redirect("/login");
  if (actor.role !== "STUDENT") redirect("/dashboard");
  const query = await searchParams;
  const page = Math.max(1, Number(query.page) || 1);
  const result = await listStudentNotifications(actor, page);

  return (
    <AppShell actor={actor} title="Notifications">
      <section className="workspace-page student-page">
        <div className="page-heading">
          <span className="eyebrow">Issuance History</span>
          <h1>Notifications</h1>
          <p>
            Email notifications for credentials issued to your student record. “Sent” means the SMTP
            transport accepted the message; it does not confirm inbox delivery.
          </p>
        </div>
        {result.items.length ? (
          <div className="data-table-scroll">
            <table aria-label="My notification history" className="data-table notification-table">
              <thead>
                <tr>
                  <th scope="col">Badge</th>
                  <th scope="col">Type</th>
                  <th scope="col">Status</th>
                  <th scope="col">Created</th>
                  <th scope="col">Sent</th>
                  <th scope="col">Attempts</th>
                </tr>
              </thead>
              <tbody>
                {result.items.map((item) => (
                  <tr key={item.id}>
                    <td>{item.badgeName}</td>
                    <td>{label(item.type)}</td>
                    <td>
                      <span className={`status ${item.status.toLowerCase()}`}>
                        {label(item.status)}
                      </span>
                    </td>
                    <td>{date(item.createdAt)}</td>
                    <td>{date(item.sentAt)}</td>
                    <td>{item.attemptCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state">No notification history is available yet.</div>
        )}
        <nav className="pagination" aria-label="Notification pages">
          {result.page > 1 ? (
            <Link
              className="secondary-button export-link"
              href={`/student/notifications?page=${result.page - 1}`}
            >
              Previous
            </Link>
          ) : null}
          <span>Page {result.page}</span>
          {result.hasNext ? (
            <Link
              className="secondary-button export-link"
              href={`/student/notifications?page=${result.page + 1}`}
            >
              Next
            </Link>
          ) : null}
        </nav>
      </section>
    </AppShell>
  );
}
