import { redirect } from "next/navigation";

import { AppShell } from "@/components/layout/app-shell";
import { DashboardStatCards } from "@/components/dashboard/stat-cards";
import { IssuanceTrend } from "@/components/dashboard/issuance-trend";
import { QuickActions } from "@/components/dashboard/quick-actions";
import { RecentActivities } from "@/components/dashboard/recent-activities";
import { RecentIssuances } from "@/components/dashboard/recent-issuances";
import { getDashboardData } from "@/modules/dashboard/services/dashboard-service";
import { getCurrentActor } from "@/modules/identity/services/current-actor";

export const dynamic = "force-dynamic";

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const actor = await getCurrentActor();
  if (!actor) redirect("/login");
  if (actor.role === "STUDENT") redirect("/student");

  const params = await searchParams;
  const dashboard = await getDashboardData(actor, {
    issuancePage: Math.max(1, Number(params.issuancePage) || 1),
    activityPage: Math.max(1, Number(params.activityPage) || 1),
  });
  const roleLabel = actor.role === "ADMIN" ? "Administrator Overview" : "Faculty Overview";
  const recordHref = (target: { issuancePage?: number; activityPage?: number }) => {
    const query = new URLSearchParams();
    const issuancePage = target.issuancePage ?? dashboard.issuancePagination.page;
    const activityPage = target.activityPage ?? dashboard.activityPagination.page;
    if (issuancePage > 1) query.set("issuancePage", String(issuancePage));
    if (activityPage > 1) query.set("activityPage", String(activityPage));
    const suffix = query.toString();
    return suffix ? `/dashboard?${suffix}` : "/dashboard";
  };

  return (
    <AppShell actor={actor} title="Dashboard">
      <section className="workspace-page dashboard-page">
        <header className="dashboard-hero">
          <span className="eyebrow">{roleLabel}</span>
          <h1>Welcome back, {firstName(actor.name)}</h1>
          <p>
            {actor.role === "ADMIN"
              ? "A current view of faculty, classes, badge templates, and credential activity across the School of Computing."
              : "A current view of your classes, students, badge templates, and credential activity."}
          </p>
        </header>

        <DashboardStatCards
          role={dashboard.role}
          stats={dashboard.stats}
          trendTotal={dashboard.trend.reduce((sum, point) => sum + point.count, 0)}
        />

        <div className="dashboard-split">
          <IssuanceTrend days={dashboard.trendDays} points={dashboard.trend} />
          <QuickActions actions={dashboard.quickActions} />
        </div>

        <RecentIssuances
          items={dashboard.recentIssuances}
          pagination={dashboard.issuancePagination}
          previousHref={
            dashboard.issuancePagination.hasPrevious
              ? recordHref({ issuancePage: dashboard.issuancePagination.page - 1 })
              : undefined
          }
          nextHref={
            dashboard.issuancePagination.hasNext
              ? recordHref({ issuancePage: dashboard.issuancePagination.page + 1 })
              : undefined
          }
        />
        <RecentActivities
          items={dashboard.recentActivities}
          pagination={dashboard.activityPagination}
          previousHref={
            dashboard.activityPagination.hasPrevious
              ? recordHref({ activityPage: dashboard.activityPagination.page - 1 })
              : undefined
          }
          nextHref={
            dashboard.activityPagination.hasNext
              ? recordHref({ activityPage: dashboard.activityPagination.page + 1 })
              : undefined
          }
          viewAllHref="/dashboard/activity"
        />
      </section>
    </AppShell>
  );
}
