import { notFound, redirect } from "next/navigation";

import { AppShell } from "@/components/layout/app-shell";
import { NotificationList } from "@/components/notifications/notification-list";
import { SuppressedRecipientList } from "@/components/notifications/suppressed-recipient-list";
import { RecordPagination } from "@/components/ui/record-pagination";
import { AuthorizationError } from "@/modules/identity/policies/authorization";
import { getCurrentActor } from "@/modules/identity/services/current-actor";
import {
  listNotifications,
  notificationPageSizes,
} from "@/modules/notifications/services/notification-query-service";
import { listActiveSuppressions } from "@/modules/notifications/services/recipient-suppression-service";

export const dynamic = "force-dynamic";

function paginationHref(query: Record<string, string | undefined>, page: number) {
  const params = new URLSearchParams();
  for (const key of ["query", "status", "providerStatus", "type", "pageSize"] as const) {
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
      providerStatus: query.providerStatus as never,
      type: query.type as never,
      query: query.query,
      pageSize: query.pageSize as never,
    });
  } catch (error) {
    if (error instanceof AuthorizationError) notFound();
    throw error;
  }
  let suppressions: Awaited<ReturnType<typeof listActiveSuppressions>> = [];
  if (actor.role === "ADMIN") {
    try {
      suppressions = await listActiveSuppressions(actor);
    } catch (error) {
      if (error instanceof AuthorizationError) notFound();
      throw error;
    }
  }
  return (
    <AppShell actor={actor} title="Email Notifications">
      <section className="workspace-page">
        <div className="page-heading">
          <p className="eyebrow">{deliveries.role === "ADMIN" ? "Administrator" : "Faculty"}</p>
          <h1>Email Notifications</h1>
          <p>
            Review privacy-safe queue and provider delivery status, search history, and use
            authorized retry or resend actions.
          </p>
        </div>
        <form className="filter-bar" method="get">
          <label>
            Search Recipient or Badge
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
            Provider Status
            <select name="providerStatus" defaultValue={query.providerStatus ?? ""}>
              <option value="">All Provider Statuses</option>
              <option value="ACCEPTED">Accepted</option>
              <option value="DELIVERED">Delivered</option>
              <option value="DEFERRED">Deferred</option>
              <option value="BOUNCED">Bounced</option>
              <option value="BLOCKED">Blocked</option>
              <option value="INVALID">Invalid</option>
              <option value="COMPLAINT">Complaint</option>
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
          <label>
            Rows per page
            <select name="pageSize" defaultValue={query.pageSize ?? "5"}>
              {notificationPageSizes.map((size) => (
                <option key={size} value={size}>
                  {size} per page
                </option>
              ))}
            </select>
          </label>
          <button className="secondary-button" type="submit">
            Apply Filters
          </button>
        </form>
        {query.notice === "resent" ? (
          <p className="notice" role="status">
            Notification queued for resend. Sent means SMTP accepted the message, not inbox
            delivery.
          </p>
        ) : null}
        <p className="faculty-result-meta" role="status">
          {deliveries.total} notification{deliveries.total === 1 ? "" : "s"} · Page{" "}
          {deliveries.page} of {deliveries.totalPages}
        </p>
        <NotificationList items={deliveries.items} />
        {actor.role === "ADMIN" ? <SuppressedRecipientList items={suppressions} /> : null}
        <RecordPagination
          label="Notification pages"
          nextHref={deliveries.hasNext ? paginationHref(query, deliveries.page + 1) : undefined}
          pagination={{
            page: deliveries.page,
            pageSize: deliveries.pageSize,
            total: deliveries.total,
            totalPages: deliveries.totalPages,
            hasNext: deliveries.hasNext,
            hasPrevious: deliveries.page > 1,
          }}
          previousHref={
            deliveries.page > 1 ? paginationHref(query, deliveries.page - 1) : undefined
          }
        />
      </section>
    </AppShell>
  );
}
