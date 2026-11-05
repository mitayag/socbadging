import Link from "next/link";

import { DataTable } from "@/components/ui/data-table";
import {
  issuancePageSizes,
  type IssuanceListRecord,
  type NormalizedIssuanceFilters,
} from "@/modules/issuance/services/issuance-query-service";

type IssuanceListFilters = Pick<
  NormalizedIssuanceFilters,
  "query" | "status" | "classId" | "badgeTemplateId"
> & {
  sort?: NormalizedIssuanceFilters["sort"];
  pageSize?: number;
};

function formatIssuedDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
    year: "numeric",
  }).format(new Date(value));
}

function pageHref(pathname: string, filters: IssuanceListFilters, page: number) {
  const params = new URLSearchParams();
  if (filters.query) params.set("query", filters.query);
  if (filters.status) params.set("status", filters.status);
  if (filters.classId) params.set("classId", filters.classId);
  if (filters.badgeTemplateId) params.set("badgeTemplateId", filters.badgeTemplateId);
  if (filters.sort && filters.sort !== "issued_desc") params.set("sort", filters.sort);
  if (filters.pageSize && filters.pageSize !== 5) {
    params.set("pageSize", String(filters.pageSize));
  }
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

export function IssuanceList({
  exportHref,
  filters,
  fixedClassId,
  items,
  page,
  pageSize,
  total,
  totalPages,
  hasNext,
  hasPrevious,
  pathname = "/issued",
}: {
  exportHref: string;
  filters: IssuanceListFilters;
  fixedClassId?: string;
  items: IssuanceListRecord[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrevious: boolean;
  pathname?: string;
}) {
  const toolbar = (
    <form className="filters faculty-toolbar" method="get" role="search">
      <input
        aria-label="Search Issued Credentials"
        defaultValue={filters.query ?? ""}
        name="query"
        placeholder="Search recipient, badge, or class"
      />
      <select aria-label="Issuance Status" defaultValue={filters.status ?? ""} name="status">
        <option value="">All Statuses</option>
        <option value="ACTIVE">Active</option>
        <option value="REVOKED">Revoked</option>
        <option value="EXPIRED">Expired</option>
      </select>
      {fixedClassId ? <input name="classId" type="hidden" value={fixedClassId} /> : null}
      {fixedClassId ? null : (
        <input
          aria-label="Class ID"
          defaultValue={filters.classId ?? ""}
          name="classId"
          placeholder="Filter by class ID"
        />
      )}
      <input
        aria-label="Badge Template ID"
        defaultValue={filters.badgeTemplateId ?? ""}
        name="badgeTemplateId"
        placeholder="Filter by badge ID"
      />
      <select aria-label="Sort order" defaultValue={filters.sort ?? "issued_desc"} name="sort">
        <option value="issued_desc">Newest first</option>
        <option value="issued_asc">Oldest first</option>
        <option value="status">Status</option>
      </select>
      <select
        aria-label="Rows per page"
        defaultValue={String(filters.pageSize ?? 5)}
        name="pageSize"
      >
        {issuancePageSizes.map((size) => (
          <option key={size} value={size}>
            {size} per page
          </option>
        ))}
      </select>
      <button className="secondary-button">Filter</button>
      <Link className="secondary-button export-link" href={exportHref}>
        Export CSV
      </Link>
    </form>
  );

  return (
    <DataTable
      caption="Issued badges"
      columns={[
        {
          key: "badge",
          header: "Badge",
          render: (item) => <span className="faculty-name">{item.badgeName}</span>,
        },
        {
          key: "publicId",
          header: "Public ID",
          render: (item) => <code>{item.publicId}</code>,
        },
        {
          key: "class",
          header: "Class",
          render: (item) => item.classCourseCode + " · " + item.classTitle,
        },
        {
          key: "recipient",
          header: "Recipient",
          render: (item) => (
            <>
              {item.recipientDisplayName} · {item.studentNumber}
            </>
          ),
        },
        {
          key: "issued",
          header: "Issued",
          render: (item) => <time dateTime={item.issuedAt}>{formatIssuedDate(item.issuedAt)}</time>,
        },
        {
          key: "status",
          header: "Status",
          render: (item) =>
            item.dataIntegrity === "INVALID" ? (
              <span className="status unavailable">UNAVAILABLE</span>
            ) : (
              <span className={`status ${item.status.toLowerCase()}`}>{item.status}</span>
            ),
        },
        {
          key: "actions",
          header: "Actions",
          className: "faculty-actions-cell",
          render: (item) =>
            item.dataIntegrity === "INVALID" ? (
              <span aria-disabled="true" className="secondary-button export-link is-disabled">
                Unavailable
              </span>
            ) : (
              <Link className="secondary-button export-link" href={`/issued/${item.id}`}>
                <span className="sr-only">
                  View {item.badgeName} for {item.recipientDisplayName}
                </span>
                <span aria-hidden="true">View Details</span>
              </Link>
            ),
        },
      ]}
      emptyMessage="No issued credentials match these filters."
      label="Issued badges"
      nextHref={hasNext ? pageHref(pathname, filters, page + 1) : undefined}
      pagination={{ page, pageSize, total, totalPages, hasNext, hasPrevious }}
      previousHref={hasPrevious ? pageHref(pathname, filters, page - 1) : undefined}
      recordLabel="issued badge"
      rows={items}
      rowKey={(item) => item.id}
      tableClassName="issuance-table"
      toolbar={toolbar}
    />
  );
}
