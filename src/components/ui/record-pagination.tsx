import Link from "next/link";

export type RecordPaginationState = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrevious: boolean;
};

export function RecordPagination({
  label,
  pagination,
  previousHref,
  nextHref,
}: {
  label: string;
  pagination: RecordPaginationState;
  previousHref?: string;
  nextHref?: string;
}) {
  return (
    <div className="dashboard-record-footer">
      <p className="dashboard-record-meta" role="status">
        Page {pagination.page} of {pagination.totalPages} ·{" "}
        {pagination.total.toLocaleString("en-PH")} record{pagination.total === 1 ? "" : "s"}
      </p>
      <nav aria-label={label} className="dashboard-record-pager">
        {previousHref ? (
          <Link className="secondary-button export-link" href={previousHref}>
            Previous
          </Link>
        ) : (
          <span aria-disabled="true" className="secondary-button export-link is-disabled">
            Previous
          </span>
        )}
        {nextHref ? (
          <Link className="secondary-button export-link" href={nextHref}>
            Next
          </Link>
        ) : (
          <span aria-disabled="true" className="secondary-button export-link is-disabled">
            Next
          </span>
        )}
      </nav>
    </div>
  );
}
