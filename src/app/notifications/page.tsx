import { notFound, redirect } from "next/navigation";
import Link from "next/link";

import { AppShell } from "@/components/layout/app-shell";
import { NotificationList } from "@/components/notifications/notification-list";
import { AuthorizationError } from "@/modules/identity/policies/authorization";
import { getCurrentActor } from "@/modules/identity/services/current-actor";
import { listNotifications } from "@/modules/notifications/services/notification-query-service";

export const dynamic = "force-dynamic";

function paginationHref(query: Record<string, string | undefined>, page: number) {
  const params = new URLSearchParams();
  for (const key of ["query", "status", "type"] as const) {
    if (query[key]) params.set(key, query[key]);
  }
  params.set("page", String(page));
  return `/notifications?${params.toString()}`;
}

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const actor = await getCurrentActor();
  if (!actor) redirect("/login");
  const query = await searchParams;
  let deliveries: Awaited<ReturnType<typeof listNotifications>>;
  try {
    deliveries = await listNotifications(actor, {
      page: query.page,
      status: query.status as never,
      type: query.type as never,
      query: query.query,
    });
  } catch (error) {
    if (error instanceof AuthorizationError) notFound();
    throw error;
  }
  return (
    <AppShell actor={actor} title="Email Notifications">
      <section className="workspace-page">
        <div className="page-heading">
          <p className="eyebrow">Administrator</p>
          <h1>Email Notifications</h1>
          <p>Review privacy-safe delivery status and retry eligible failed messages.</p>
        </div>
        <form className="filter-bar" method="get">
          <label>
            Search Masked Recipient
            <input name="query" defaultValue={query.query ?? ""} />
          </label>
          <label>
            Status
            <select name="status" defaultValue={query.status ?? ""}>
              <option value="">All Statuses</option>
              <option value="PENDING">Pending</option>
              <option value="PROCESSING">Processing</option>
              <option value="RETRY_SCHEDULED">Retry Scheduled</option>
              <option value="SENT">Sent</option>
              <option value="FAILED">Failed</option>
            </select>
          </label>
          <label>
            Type
            <select name="type" defaultValue={query.type ?? ""}>
              <option value="">All Types</option>
              <option value="BADGE_ISSUED">Badge Issued</option>
              <option value="BADGE_REVOKED">Badge Revoked</option>
            </select>
          </label>
          <button className="secondary-button" type="submit">
            Apply Filters
          </button>
        </form>
        <NotificationList items={deliveries.items} />
        {deliveries.totalPages > 1 ? (
          <nav aria-label="Notification Pagination" className="pagination">
            {deliveries.page > 1 ? (
              <Link href={paginationHref(query, deliveries.page - 1)}>Previous Page</Link>
            ) : (
              <span aria-hidden="true" />
            )}
            <span>
              Page {deliveries.page} of {deliveries.totalPages}
            </span>
            {deliveries.hasNext ? (
              <Link href={paginationHref(query, deliveries.page + 1)}>Next Page</Link>
            ) : (
              <span aria-hidden="true" />
            )}
          </nav>
        ) : null}
      </section>
    </AppShell>
  );
}
