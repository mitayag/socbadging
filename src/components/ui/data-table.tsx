import type { ReactNode } from "react";

import { RecordPagination, type RecordPaginationState } from "@/components/ui/record-pagination";

export type DataTableColumn<T> = {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  className?: string;
};

export function DataTable<T>({
  label,
  caption,
  columns,
  rows,
  rowKey,
  emptyMessage,
  toolbar,
  pagination,
  previousHref,
  nextHref,
  recordLabel = "record",
  tableClassName = "",
}: {
  label: string;
  caption?: string;
  columns: Array<DataTableColumn<T>>;
  rows: T[];
  rowKey: (row: T) => string;
  emptyMessage: string;
  toolbar?: ReactNode;
  pagination?: RecordPaginationState;
  previousHref?: string;
  nextHref?: string;
  recordLabel?: string;
  tableClassName?: string;
}) {
  return (
    <section aria-label={label}>
      {toolbar}
      {pagination ? (
        <p className="faculty-result-meta" role="status">
          {pagination.total} {recordLabel}
          {pagination.total === 1 ? "" : "s"} · Page {pagination.page} of {pagination.totalPages}
        </p>
      ) : null}
      {rows.length ? (
        <div aria-label={`${label} table`} className="data-table-scroll" role="region" tabIndex={0}>
          <table className={`data-table ${tableClassName}`.trim()}>
            <caption className="sr-only">{caption ?? label}</caption>
            <thead>
              <tr>
                {columns.map((column) => (
                  <th key={column.key} scope="col">
                    {column.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={rowKey(row)}>
                  {columns.map((column) => (
                    <td className={column.className} key={column.key}>
                      {column.render(row)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty-state">{emptyMessage}</div>
      )}
      {pagination ? (
        <RecordPagination
          label={`${label} pages`}
          nextHref={nextHref}
          pagination={pagination}
          previousHref={previousHref}
        />
      ) : null}
    </section>
  );
}
