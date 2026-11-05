import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { AppShell } from "@/components/layout/app-shell";
import { ResendNotificationForm } from "@/components/notifications/resend-notification-form";
import { RetryNotificationForm } from "@/components/notifications/retry-notification-form";
import { AuthorizationError } from "@/modules/identity/policies/authorization";
import { getCurrentActor } from "@/modules/identity/services/current-actor";
import {
  getNotificationDetail,
  NotificationNotFoundError,
} from "@/modules/notifications/services/notification-query-service";

export const dynamic = "force-dynamic";

function label(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(value));
}

export default async function NotificationDetailPage({
  params,
}: {
  params: Promise<{ deliveryId: string }>;
}) {
  const actor = await getCurrentActor();
  if (!actor) redirect("/login");
  const { deliveryId } = await params;
  let detail: Awaited<ReturnType<typeof getNotificationDetail>>;
  try {
    detail = await getNotificationDetail(actor, deliveryId);
  } catch (error) {
    if (error instanceof AuthorizationError) notFound();
    if (error instanceof NotificationNotFoundError) notFound();
    throw error;
  }

  return (
    <AppShell actor={actor} title="Notification History">
      <section className="workspace-page">
        <Link className="text-button" href="/notifications">
          ← Back to notifications
        </Link>
        <div className="page-heading">
          <p className="eyebrow">{detail.deliveryChannel.toUpperCase()} delivery</p>
          <h1>{detail.badgeName}</h1>
          <p>
            {detail.maskedRecipientEmail} · Issuance {detail.publicId.slice(0, 10)}…
          </p>
        </div>

        <div className="credential-grid">
          <section className="panel credential-panel">
            <h2>Delivery status</h2>
            <dl className="credential-facts">
              <div>
                <dt>Queue status</dt>
                <dd>{label(detail.status)}</dd>
              </div>
              <div>
                <dt>Provider status</dt>
                <dd>{detail.providerStatus ? label(detail.providerStatus) : "—"}</dd>
              </div>
              <div>
                <dt>SMTP accepted</dt>
                <dd>{formatDate(detail.smtpAcceptedAt)}</dd>
              </div>
              <div>
                <dt>Provider status at</dt>
                <dd>{formatDate(detail.providerStatusAt)}</dd>
              </div>
              <div>
                <dt>Provider message ID</dt>
                <dd>{detail.providerMessageId ?? "—"}</dd>
              </div>
              <div>
                <dt>Attempts</dt>
                <dd>{detail.attemptCount}</dd>
              </div>
              <div>
                <dt>Resends</dt>
                <dd>{detail.resendCount}</dd>
              </div>
              <div>
                <dt>Last error</dt>
                <dd>{detail.safeDiagnosticCode ?? "—"}</dd>
              </div>
            </dl>
            <div className="inline-actions">
              {detail.canRetry ? <RetryNotificationForm deliveryId={detail.id} /> : null}
              {detail.canResend ? <ResendNotificationForm deliveryId={detail.id} /> : null}
              <Link
                className="secondary-button export-link"
                href={`/credentials/${detail.publicId}`}
                target="_blank"
              >
                Public verification
              </Link>
            </div>
          </section>

          <section className="panel credential-panel">
            <h2>Timeline</h2>
            <p className="muted">
              SMTP acceptance is not the same as provider delivery or inbox receipt.
            </p>
            <dl className="credential-facts">
              <div>
                <dt>Created</dt>
                <dd>{formatDate(detail.createdAt)}</dd>
              </div>
              <div>
                <dt>Sent</dt>
                <dd>{formatDate(detail.sentAt)}</dd>
              </div>
              <div>
                <dt>Last updated</dt>
                <dd>{formatDate(detail.updatedAt)}</dd>
              </div>
            </dl>
          </section>
        </div>

        <section className="panel credential-panel">
          <h2>Delivery attempts</h2>
          {detail.attempts.length ? (
            <div className="table-scroll">
              <table className="data-table" aria-label="Delivery attempts">
                <thead>
                  <tr>
                    <th scope="col">#</th>
                    <th scope="col">Channel</th>
                    <th scope="col">Outcome</th>
                    <th scope="col">Started</th>
                    <th scope="col">Completed</th>
                    <th scope="col">Message ID</th>
                    <th scope="col">Diagnostic</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.attempts.map((attempt) => (
                    <tr key={attempt.id}>
                      <td>{attempt.attemptNumber}</td>
                      <td>{attempt.deliveryChannel}</td>
                      <td>{label(attempt.outcome)}</td>
                      <td>{formatDate(attempt.startedAt)}</td>
                      <td>{formatDate(attempt.completedAt)}</td>
                      <td>{attempt.providerMessageId ?? "—"}</td>
                      <td>{attempt.safeDiagnosticCode ?? attempt.errorCategory ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="empty-state">No delivery attempts recorded yet.</p>
          )}
        </section>

        <section className="panel credential-panel">
          <h2>Provider event history</h2>
          {detail.events.length ? (
            <div className="table-scroll">
              <table className="data-table" aria-label="Provider event history">
                <thead>
                  <tr>
                    <th scope="col">Source</th>
                    <th scope="col">Event</th>
                    <th scope="col">Provider status</th>
                    <th scope="col">Occurred</th>
                    <th scope="col">Received</th>
                    <th scope="col">Applied</th>
                    <th scope="col">Message ID</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.events.map((event) => (
                    <tr key={event.id}>
                      <td>{label(event.source)}</td>
                      <td>{label(event.eventType)}</td>
                      <td>{event.providerStatus ? label(event.providerStatus) : "—"}</td>
                      <td>{formatDate(event.occurredAt)}</td>
                      <td>{formatDate(event.receivedAt)}</td>
                      <td>{event.applied ? "Applied" : "Recorded only"}</td>
                      <td>{event.providerMessageId ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="empty-state">
              No provider events recorded. Provider delivery remains unconfirmed.
            </p>
          )}
        </section>
      </section>
    </AppShell>
  );
}
