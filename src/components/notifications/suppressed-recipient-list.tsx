import type { RecipientSuppressionSummary } from "@/modules/notifications/services/recipient-suppression-service";

import { UnsuppressRecipientForm } from "./unsuppress-recipient-form";

function label(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(value));
}

export function SuppressedRecipientList({ items }: { items: RecipientSuppressionSummary[] }) {
  return (
    <section aria-labelledby="suppressed-recipients-heading">
      <div className="page-heading">
        <p className="eyebrow">Administrator</p>
        <h2 id="suppressed-recipients-heading">Suppressed Recipients</h2>
        <p>
          Permanent bounces, spam complaints, invalid recipients, and provider blocks are blocked
          from all sends, retries, and resends until an Administrator clears the suppression with an
          audit reason.
        </p>
      </div>
      {items.length ? (
        <div className="data-table-scroll">
          <table aria-label="Suppressed Recipients" className="data-table notification-table">
            <thead>
              <tr>
                <th scope="col">Recipient</th>
                <th scope="col">Reason</th>
                <th scope="col">Provider</th>
                <th scope="col">Suppressed</th>
                <th scope="col">Correlation</th>
                <th scope="col">Action</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td>{item.normalizedEmail}</td>
                  <td>
                    <span className={`status ${item.reason.toLowerCase()}`}>
                      {label(item.reason)}
                    </span>
                  </td>
                  <td>{label(item.provider)}</td>
                  <td>{formatDate(item.suppressedAt)}</td>
                  <td>{item.providerEventId ? item.providerEventId.slice(0, 16) : "—"}</td>
                  <td>
                    <UnsuppressRecipientForm
                      normalizedEmail={item.normalizedEmail}
                      reason={item.reason}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="empty-state">No active recipient suppressions.</p>
      )}
    </section>
  );
}
