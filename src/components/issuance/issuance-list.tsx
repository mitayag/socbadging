import Link from "next/link";

import type {
  IssuanceListRecord,
  NormalizedIssuanceFilters,
} from "@/modules/issuance/services/issuance-query-service";

type IssuanceListFilters = Pick<
  NormalizedIssuanceFilters,
  "query" | "status" | "classId" | "badgeTemplateId"
>;

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
  pathname = "/issued",
  totalPages,
}: {
  exportHref: string;
  filters: IssuanceListFilters;
  fixedClassId?: string;
  items: IssuanceListRecord[];
  page: number;
  pathname?: string;
  totalPages: number;
}) {
  return (
    <section aria-labelledby="issued-records-heading" className="issuance-records">
      <div className="section-heading issuance-list-heading">
        <div>
          <span className="eyebrow">Credential Records</span>
          <h2 id="issued-records-heading">Issued Badges</h2>
        </div>
        <Link className="secondary-button export-link" href={exportHref}>
          Export CSV
        </Link>
      </div>
      <form className="filters" method="get">
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
        <button className="secondary-button">Filter</button>
      </form>
      <div className="record-list issuance-list">
        {items.map((item) => (
          <article className="record issuance-record" key={item.id}>
            <div className="issuance-record-main">
              <span className={`status ${item.status.toLowerCase()}`}>{item.status}</span>
              <div>
                <h3>{item.badgeName}</h3>
                <p>
                  <span>{item.recipientDisplayName}</span> · <span>{item.studentNumber}</span>
                </p>
                <small>Public ID:</small>
                <code>{item.publicId}</code>
              </div>
              <div className="issuance-record-date">
                <strong>Issued</strong>
                <time dateTime={item.issuedAt}>{formatIssuedDate(item.issuedAt)}</time>
              </div>
              <Link
                className="secondary-button export-link"
                href={`/issued/${encodeURIComponent(item.id)}`}
              >
                <span className="sr-only">
                  View {item.badgeName} for {item.recipientDisplayName}
                </span>
                <span aria-hidden="true">View Details</span>
              </Link>
            </div>
          </article>
        ))}
        {items.length === 0 ? (
          <div className="empty-state">No issued credentials match these filters.</div>
        ) : null}
      </div>
      {totalPages > 1 ? (
        <nav aria-label="Issuance Pagination" className="pagination">
          {page > 1 ? (
            <Link href={pageHref(pathname, filters, page - 1)}>Previous Page</Link>
          ) : (
            <span>Previous Page</span>
          )}
          <span>
            Page {page} of {totalPages}
          </span>
          {page < totalPages ? (
            <Link aria-label="Next Page" href={pageHref(pathname, filters, page + 1)}>
              Next Page
            </Link>
          ) : (
            <span>Next Page</span>
          )}
        </nav>
      ) : null}
    </section>
  );
}
