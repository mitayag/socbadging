import Link from "next/link";

import type { DashboardActivity, DashboardPagination } from "@/modules/dashboard/types";

import { RecordPagination } from "./record-pagination";

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function RecentActivities({
  items,
  pagination,
  previousHref,
  nextHref,
  viewAllHref,
}: {
  items: DashboardActivity[];
  pagination: DashboardPagination;
  previousHref?: string;
  nextHref?: string;
  viewAllHref?: string;
}) {
  return (
    <section className="panel dashboard-panel" aria-labelledby="recent-activities-heading">
      <div className="section-heading">
        <div>
          <span className="eyebrow">Operational History</span>
          <h2 id="recent-activities-heading">Recent Activities</h2>
        </div>
        {viewAllHref ? (
          <Link className="secondary-button export-link" href={viewAllHref}>
            View all
          </Link>
        ) : null}
      </div>
      {items.length ? (
        <div className="dashboard-record-scroll">
          <table
            aria-describedby="recent-activities-heading"
            className="dashboard-table dashboard-record-table activity-table"
          >
            <thead>
              <tr>
                <th scope="col">Activity</th>
                <th scope="col">Details</th>
                <th scope="col">When</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td>
                    <strong>{item.label}</strong>
                  </td>
                  <td>
                    {item.actorName ?? "System"} · {item.entityType}
                  </td>
                  <td>
                    <time dateTime={item.createdAt}>{formatDate(item.createdAt)}</time>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty-state">
          No recent activity yet. Class, badge, roster, and credential actions will appear here.
        </div>
      )}
      <RecordPagination
        label="Activity pages"
        nextHref={nextHref}
        pagination={pagination}
        previousHref={previousHref}
      />
    </section>
  );
}
