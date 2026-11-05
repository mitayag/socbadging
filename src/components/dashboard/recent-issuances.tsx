import Link from "next/link";

import type { DashboardIssuance, DashboardPagination } from "@/modules/dashboard/types";

import { RecordPagination } from "./record-pagination";

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function RecentIssuances({
  items,
  pagination,
  previousHref,
  nextHref,
}: {
  items: DashboardIssuance[];
  pagination: DashboardPagination;
  previousHref?: string;
  nextHref?: string;
}) {
  return (
    <section className="panel dashboard-panel" aria-labelledby="recent-issuances-heading">
      <div className="section-heading">
        <div>
          <span className="eyebrow">Credential Activity</span>
          <h2 id="recent-issuances-heading">Recent Badge Issuances</h2>
        </div>
        <Link className="secondary-button export-link" href="/issued">
          View all
        </Link>
      </div>
      {items.length ? (
        <div className="dashboard-record-scroll">
          <table
            className="dashboard-table dashboard-record-table recent-issuance-table"
            aria-describedby="recent-issuances-heading"
          >
            <thead>
              <tr>
                <th scope="col">Badge</th>
                <th scope="col">Class</th>
                <th scope="col">Recipient</th>
                <th scope="col">Issued</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td>
                    <Link href={`/issued/${item.id}`}>{item.badgeName}</Link>
                  </td>
                  <td>{item.classLabel}</td>
                  <td>{item.recipientDisplayName}</td>
                  <td>
                    <time dateTime={item.issuedAt}>{formatDate(item.issuedAt)}</time>
                  </td>
                  <td>
                    <span className={`status ${item.status.toLowerCase()}`}>{item.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty-state">
          No credentials have been issued yet. Recent issuance activity will appear here.
        </div>
      )}
      <RecordPagination
        label="Badge issuance pages"
        nextHref={nextHref}
        pagination={pagination}
        previousHref={previousHref}
      />
    </section>
  );
}
