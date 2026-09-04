import type { NotificationListItem } from "@/modules/notifications/services/notification-query-service";
import { RetryNotificationForm } from "./retry-notification-form";

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

export function NotificationList({ items }: { items: NotificationListItem[] }) {
  if (!items.length) return <p className="empty-state">No notification deliveries found.</p>;
  return (
    <div className="table-scroll">
      <table aria-label="Notification Deliveries" className="data-table notification-table">
        <thead>
          <tr>
            <th scope="col">Recipient</th>
            <th scope="col">Badge</th>
            <th scope="col">Type</th>
            <th scope="col">Status</th>
            <th scope="col">Attempts</th>
            <th scope="col">Created</th>
            <th scope="col">Sent</th>
            <th scope="col">Action</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id}>
              <td>{item.maskedRecipientEmail}</td>
              <td>{item.badgeName}</td>
              <td>{label(item.type)}</td>
              <td>
                <span className={`status ${item.status.toLowerCase()}`}>{label(item.status)}</span>
              </td>
              <td>{item.attemptCount}</td>
              <td>{formatDate(item.createdAt)}</td>
              <td>{formatDate(item.sentAt)}</td>
              <td>{item.canRetry ? <RetryNotificationForm deliveryId={item.id} /> : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
