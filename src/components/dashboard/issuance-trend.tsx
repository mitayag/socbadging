import type { DashboardTrendPoint } from "@/modules/dashboard/types";

function shortDate(date: string): string {
  return new Intl.DateTimeFormat("en-PH", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00.000Z`));
}

export function IssuanceTrend({ points, days }: { points: DashboardTrendPoint[]; days: number }) {
  const total = points.reduce((sum, point) => sum + point.count, 0);
  const maximum = Math.max(...points.map((point) => point.count), 0);
  const hasData = total > 0;
  const summary = points
    .map((point) => `${shortDate(point.date)}: ${point.count} issued`)
    .join(", ");

  return (
    <section className="panel dashboard-panel trend-panel" aria-labelledby="issuance-trend-heading">
      <div className="section-heading">
        <div>
          <span className="eyebrow">Last {days} days</span>
          <h2 id="issuance-trend-heading">Badge Issuance Trend</h2>
        </div>
        <p>
          {hasData ? `${total.toLocaleString("en-PH")} issued in this period` : "No activity yet"}
        </p>
      </div>
      {hasData ? (
        <div
          aria-label={`Badge issuance trend for the last ${days} days. ${summary}`}
          className="trend-chart"
          role="img"
        >
          <div className="trend-bars">
            {points.map((point, index) => {
              const height = maximum ? Math.max(6, Math.round((point.count / maximum) * 100)) : 0;
              const showLabel = index % 2 === 0 || index === points.length - 1;
              return (
                <div className="trend-column" key={point.date}>
                  <div className="trend-track">
                    <div
                      className="trend-bar"
                      style={{ height: `${height}%` }}
                      title={`${shortDate(point.date)}: ${point.count}`}
                    />
                  </div>
                  <span aria-hidden="true" className="trend-label">
                    {showLabel ? shortDate(point.date) : ""}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="empty-state">
          No badge issuance activity in the last {days} days. Trends will appear after the first
          issuance.
        </div>
      )}
    </section>
  );
}
