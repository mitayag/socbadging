import Link from "next/link";

import { DataTable } from "@/components/ui/data-table";
import {
  auditLogPageSizes,
  type AuditLogFacets,
  type AuditLogListItem,
  type NormalizedAuditLogFilters,
} from "@/modules/audit/services/audit-log-service";

export function displayAuditAction(action: string): string {
  return action
    .replaceAll("_", " ")
    .replaceAll(".", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function formatRecorded(value: string): string {
  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function AuditLogList({
  items,
  filters,
  facets,
  page,
  pageSize,
  total,
  totalPages,
  hasNext,
  hasPrevious,
  previousHref,
  nextHref,
}: {
  items: AuditLogListItem[];
  filters: NormalizedAuditLogFilters;
  facets: AuditLogFacets;
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrevious: boolean;
  previousHref?: string;
  nextHref?: string;
}) {
  const hasFilters = Boolean(
    filters.query ||
    filters.entityType ||
    filters.action ||
    filters.from ||
    filters.to ||
    pageSize !== 5,
  );

  const toolbar = (
    <form className="filters faculty-toolbar audit-toolbar" method="get" role="search">
      <input
        aria-label="Search audit logs"
        defaultValue={filters.query ?? ""}
        name="query"
        placeholder="Search event, actor, or record type"
      />
      <select aria-label="Record type" defaultValue={filters.entityType ?? ""} name="entityType">
        <option value="">All Record Types</option>
        {facets.entityTypes.map((entityType) => (
          <option key={entityType} value={entityType}>
            {entityType}
          </option>
        ))}
      </select>
      <select aria-label="Event type" defaultValue={filters.action ?? ""} name="action">
        <option value="">All Event Types</option>
        {facets.actions.map((action) => (
          <option key={action} value={action}>
            {displayAuditAction(action)}
          </option>
        ))}
      </select>
      <label className="field audit-date-field">
        From
        <input aria-label="From date" defaultValue={filters.from ?? ""} name="from" type="date" />
      </label>
      <label className="field audit-date-field">
        To
        <input aria-label="To date" defaultValue={filters.to ?? ""} name="to" type="date" />
      </label>
      <select aria-label="Rows per page" defaultValue={String(pageSize)} name="pageSize">
        {auditLogPageSizes.map((size) => (
          <option key={size} value={size}>
            {size} per page
          </option>
        ))}
      </select>
      <button className="secondary-button">Apply</button>
      {hasFilters ? (
        <Link className="text-button" href="/audit-logs">
          Reset
        </Link>
      ) : null}
    </form>
  );

  return (
    <DataTable
      caption="Audit records"
      columns={[
        {
          key: "event",
          header: "Event",
          render: (item) => <span className="faculty-name">{displayAuditAction(item.action)}</span>,
        },
        { key: "actor", header: "Actor", render: (item) => item.actorName ?? "System" },
        { key: "recordType", header: "Record Type", render: (item) => item.entityType },
        {
          key: "recorded",
          header: "Recorded",
          render: (item) => <time dateTime={item.createdAt}>{formatRecorded(item.createdAt)}</time>,
        },
      ]}
      emptyMessage="No audit records match these filters. Adjust the search or date range and try again."
      label="Audit records"
      nextHref={nextHref}
      pagination={{ page, pageSize, total, totalPages, hasNext, hasPrevious }}
      previousHref={previousHref}
      recordLabel="audit record"
      rows={items}
      rowKey={(item) => item.id}
      tableClassName="audit-table"
      toolbar={toolbar}
    />
  );
}
