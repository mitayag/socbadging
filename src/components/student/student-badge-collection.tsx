import Link from "next/link";

import type {
  StudentBadgeListItem,
  StudentBadgeSort,
  StudentCredentialStatus,
} from "@/modules/student/types";

import { StudentBadgeCard } from "./student-badge-card";

type CollectionQuery = {
  q?: string;
  status?: StudentCredentialStatus;
  sort?: StudentBadgeSort;
  view?: "grid" | "list";
};

function hrefWith(
  basePath: string,
  query: CollectionQuery,
  overrides: Record<string, string | undefined> = {},
) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries({ ...query, ...overrides })) {
    if (value) params.set(key, value);
  }
  return `${basePath}?${params.toString()}`;
}

export function StudentBadgeCollection({
  basePath,
  items,
  query,
  page,
  hasNext,
}: {
  basePath: string;
  items: StudentBadgeListItem[];
  query: CollectionQuery;
  page: number;
  hasNext: boolean;
}) {
  const view = query.view ?? "grid";
  return (
    <>
      <form className="filters student-badge-filters" method="get">
        <input name="q" defaultValue={query.q ?? ""} placeholder="Search badge, class, or issuer" />
        <select name="status" defaultValue={query.status ?? ""}>
          <option value="">All Statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="EXPIRED">Expired</option>
          <option value="REVOKED">Revoked</option>
        </select>
        <select name="sort" defaultValue={query.sort ?? "issued_desc"}>
          <option value="issued_desc">Newest first</option>
          <option value="issued_asc">Oldest first</option>
          <option value="status">Status</option>
        </select>
        <input name="view" type="hidden" value={view} />
        <button className="secondary-button" type="submit">
          Apply
        </button>
      </form>
      <div className="student-collection-toolbar">
        <span>{items.length ? "Showing your credentials" : "No credentials match"}</span>
        <div className="inline-actions" role="group" aria-label="Badge view">
          <Link
            aria-current={view === "grid" ? "page" : undefined}
            className={view === "grid" ? "text-button active" : "text-button"}
            href={hrefWith(basePath, query, { view: "grid", page: undefined })}
          >
            Grid
          </Link>
          <Link
            aria-current={view === "list" ? "page" : undefined}
            className={view === "list" ? "text-button active" : "text-button"}
            href={hrefWith(basePath, query, { view: "list", page: undefined })}
          >
            List
          </Link>
        </div>
      </div>
      {items.length ? (
        <div className={view === "list" ? "student-badge-list" : "student-badge-grid"}>
          {items.map((item) => (
            <StudentBadgeCard item={item} key={item.issuanceId} />
          ))}
        </div>
      ) : (
        <div className="empty-state">
          No badges match these filters. Credentials appear here after Faculty issue them.
        </div>
      )}
      <nav className="pagination" aria-label="Badge pages">
        {page > 1 ? (
          <Link
            className="secondary-button export-link"
            href={hrefWith(basePath, query, { page: String(page - 1) })}
          >
            Previous
          </Link>
        ) : null}
        <span>Page {page}</span>
        {hasNext ? (
          <Link
            className="secondary-button export-link"
            href={hrefWith(basePath, query, { page: String(page + 1) })}
          >
            Next
          </Link>
        ) : null}
      </nav>
    </>
  );
}
