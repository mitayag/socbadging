import type { AuditLogListItem } from "@/modules/audit/services/audit-log-service";

function displayAction(action: AuditLogListItem["action"]): string {
  return action
    .replaceAll("_", " ")
    .replaceAll(".", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

export function AuditLogList({ items }: { items: AuditLogListItem[] }) {
  if (!items.length) {
    return <p className="empty-state">No sensitive activity has been recorded yet.</p>;
  }

  return (
    <div className="audit-log-list" role="region" aria-label="Sensitive Activity">
      <div className="audit-log-row audit-log-header" aria-hidden="true">
        <span>Event</span>
        <span>Actor</span>
        <span>Record Type</span>
        <span>Recorded</span>
      </div>
      {items.map((item) => (
        <div className="audit-log-row" key={item.id}>
          <span data-label="Event">{displayAction(item.action)}</span>
          <span data-label="Actor">{item.actorName ?? "System"}</span>
          <span data-label="Record Type">{item.entityType}</span>
          <time data-label="Recorded" dateTime={item.createdAt}>
            {new Intl.DateTimeFormat("en", {
              dateStyle: "medium",
              timeStyle: "short",
            }).format(new Date(item.createdAt))}
          </time>
        </div>
      ))}
    </div>
  );
}
