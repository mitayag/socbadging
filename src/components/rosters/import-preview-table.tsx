"use client";

import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Search } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";

import type { ImportPreviewRow } from "./import-types";

type SortKey = "row" | "studentNumber" | "name" | "email" | "status";
type SortDirection = "asc" | "desc";
type StatusFilter = "all" | "ready" | "attention";
const pageSizes = [10, 25, 50, 100] as const;

function displayName(row: ImportPreviewRow) {
  return [row.firstName, row.lastName].filter(Boolean).join(" ");
}

function sortValue(row: ImportPreviewRow, key: SortKey) {
  if (key === "row") return row.rowNumber;
  if (key === "studentNumber") return row.studentNumber;
  if (key === "name") return `${row.lastName} ${row.firstName}`;
  if (key === "email") return row.email;
  return row.errors.length ? 1 : 0;
}

function compareRows(left: ImportPreviewRow, right: ImportPreviewRow, key: SortKey) {
  const leftValue = sortValue(left, key);
  const rightValue = sortValue(right, key);
  if (typeof leftValue === "number" && typeof rightValue === "number") {
    return leftValue - rightValue;
  }
  return String(leftValue).localeCompare(String(rightValue), undefined, { sensitivity: "base" });
}

function SortButton({
  active,
  children,
  direction,
  onClick,
}: {
  active: boolean;
  children: ReactNode;
  direction: SortDirection;
  onClick: () => void;
}) {
  const Icon = active ? (direction === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <button className="import-sort-button" onClick={onClick} type="button">
      {children}
      <Icon aria-hidden size={13} />
    </button>
  );
}

export function ImportPreviewTable({ rows }: { rows: ImportPreviewRow[] }) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sort, setSort] = useState<{ key: SortKey; direction: SortDirection }>({
    key: "row",
    direction: "asc",
  });
  const [pageSize, setPageSize] = useState<(typeof pageSizes)[number]>(10);
  const [page, setPage] = useState(1);

  const filteredRows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (statusFilter === "ready" && row.errors.length) return false;
      if (statusFilter === "attention" && !row.errors.length) return false;
      if (!normalizedQuery) return true;
      return [
        String(row.rowNumber),
        row.studentNumber,
        row.firstName,
        row.lastName,
        displayName(row),
        row.email,
        row.errors.join(" "),
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery);
    });
  }, [query, rows, statusFilter]);

  const sortedRows = useMemo(() => {
    return [...filteredRows].sort((left, right) => {
      const result = compareRows(left, right, sort.key);
      return sort.direction === "asc" ? result : -result;
    });
  }, [filteredRows, sort.direction, sort.key]);

  const pageCount = Math.max(1, Math.ceil(sortedRows.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const start = (currentPage - 1) * pageSize;
  const visibleRows = sortedRows.slice(start, start + pageSize);

  function toggleSort(key: SortKey) {
    setSort((current) => ({
      key,
      direction: current.key === key && current.direction === "asc" ? "desc" : "asc",
    }));
    setPage(1);
  }

  function sortState(key: SortKey) {
    if (sort.key !== key) return "none" as const;
    return sort.direction === "asc" ? ("ascending" as const) : ("descending" as const);
  }

  return (
    <div className="import-preview-controls">
      <div className="import-preview-toolbar">
        <label className="import-preview-search">
          <Search aria-hidden size={17} />
          <span className="sr-only">Search preview rows</span>
          <input
            aria-label="Search preview rows"
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(1);
            }}
            placeholder="Search student number, name, email, or error"
            type="search"
            value={query}
          />
        </label>
        <label className="import-preview-filter">
          <span>Status</span>
          <select
            aria-label="Filter preview rows by status"
            onChange={(event) => {
              setStatusFilter(event.target.value as StatusFilter);
              setPage(1);
            }}
            value={statusFilter}
          >
            <option value="all">All rows</option>
            <option value="ready">Ready</option>
            <option value="attention">Needs attention</option>
          </select>
        </label>
        <label className="import-preview-filter">
          <span>Sort by</span>
          <select
            aria-label="Sort preview rows"
            onChange={(event) => {
              setSort((current) => ({ ...current, key: event.target.value as SortKey }));
              setPage(1);
            }}
            value={sort.key}
          >
            <option value="row">Row</option>
            <option value="studentNumber">Student Number</option>
            <option value="name">Name</option>
            <option value="email">Email</option>
            <option value="status">Status</option>
          </select>
        </label>
        <label className="import-preview-filter">
          <span>Direction</span>
          <select
            aria-label="Sort direction"
            onChange={(event) => {
              setSort((current) => ({
                ...current,
                direction: event.target.value as SortDirection,
              }));
              setPage(1);
            }}
            value={sort.direction}
          >
            <option value="asc">Ascending</option>
            <option value="desc">Descending</option>
          </select>
        </label>
        <label className="import-preview-filter">
          <span>Rows per page</span>
          <select
            aria-label="Preview rows per page"
            onChange={(event) => {
              setPageSize(Number(event.target.value) as (typeof pageSizes)[number]);
              setPage(1);
            }}
            value={pageSize}
          >
            {pageSizes.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </label>
      </div>

      <p aria-live="polite" className="import-preview-result-count" role="status">
        Showing {visibleRows.length} of {sortedRows.length} filtered rows ({rows.length} total)
      </p>

      <div className="import-review-table-wrap">
        <table className="import-review-table">
          <caption className="sr-only">Validated roster import rows</caption>
          <thead>
            <tr>
              <th aria-sort={sortState("row")} scope="col">
                <SortButton
                  active={sort.key === "row"}
                  direction={sort.direction}
                  onClick={() => toggleSort("row")}
                >
                  Row
                </SortButton>
              </th>
              <th aria-sort={sortState("studentNumber")} scope="col">
                <SortButton
                  active={sort.key === "studentNumber"}
                  direction={sort.direction}
                  onClick={() => toggleSort("studentNumber")}
                >
                  Student Number
                </SortButton>
              </th>
              <th aria-sort={sortState("name")} scope="col">
                <SortButton
                  active={sort.key === "name"}
                  direction={sort.direction}
                  onClick={() => toggleSort("name")}
                >
                  Name
                </SortButton>
              </th>
              <th aria-sort={sortState("email")} scope="col">
                <SortButton
                  active={sort.key === "email"}
                  direction={sort.direction}
                  onClick={() => toggleSort("email")}
                >
                  Email
                </SortButton>
              </th>
              <th aria-sort={sortState("status")} scope="col">
                <SortButton
                  active={sort.key === "status"}
                  direction={sort.direction}
                  onClick={() => toggleSort("status")}
                >
                  Status
                </SortButton>
              </th>
              <th scope="col">Details</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.length ? (
              visibleRows.map((row) => (
                <tr
                  className={row.errors.length ? "needs-attention" : undefined}
                  key={row.rowNumber}
                >
                  <td data-label="Row">{row.rowNumber}</td>
                  <td data-label="Student Number">{row.studentNumber || "—"}</td>
                  <td data-label="Name">{displayName(row) || "—"}</td>
                  <td data-label="Email">{row.email || "—"}</td>
                  <td data-label="Status">
                    <span
                      className={`import-row-status ${row.errors.length ? "attention" : "ready"}`}
                    >
                      {row.errors.length ? "Needs attention" : "Ready"}
                    </span>
                  </td>
                  <td data-label="Details">
                    {row.errors.length ? (
                      <ul className="import-row-errors">
                        {row.errors.map((rowError) => (
                          <li key={rowError}>{rowError}</li>
                        ))}
                      </ul>
                    ) : (
                      <span className="import-row-ok">Validated</span>
                    )}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td className="import-preview-empty" colSpan={6}>
                  No rows match the current search and filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="import-preview-pagination">
        <span>
          Page {currentPage} of {pageCount}
        </span>
        <div className="import-preview-pagination-actions">
          <button
            aria-label="Previous preview page"
            className="secondary-button import-page-button"
            disabled={currentPage <= 1}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
            type="button"
          >
            <ChevronLeft aria-hidden size={16} />
            Previous
          </button>
          <button
            aria-label="Next preview page"
            className="secondary-button import-page-button"
            disabled={currentPage >= pageCount}
            onClick={() => setPage((current) => Math.min(pageCount, current + 1))}
            type="button"
          >
            Next
            <ChevronRight aria-hidden size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
