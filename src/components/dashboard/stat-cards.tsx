import type { DashboardStats } from "@/modules/dashboard/types";

type StatCard = {
  label: string;
  value: number;
  hint?: string;
  tone?: "default" | "success" | "danger" | "warning";
};

function formatCount(value: number): string {
  return value.toLocaleString("en-PH");
}

export function DashboardStatCards({
  role,
  stats,
  trendTotal = 0,
}: {
  role: "ADMIN" | "FACULTY";
  stats: DashboardStats;
  trendTotal?: number;
}) {
  const cards: StatCard[] =
    role === "ADMIN"
      ? [
          { label: "Faculty Accounts", value: stats.facultyAccounts ?? 0, hint: "Non-deleted" },
          { label: "Classes", value: stats.classes, hint: "All class workspaces" },
          { label: "Students", value: stats.students, hint: "Global roster records" },
          { label: "Badge Templates", value: stats.badgeTemplates },
          { label: "Issued Badges", value: stats.issuedBadges },
          { label: "Active Credentials", value: stats.activeCredentials, tone: "success" },
          { label: "Revoked Credentials", value: stats.revokedCredentials, tone: "danger" },
          { label: "Expired Credentials", value: stats.expiredCredentials, tone: "warning" },
        ]
      : [
          { label: "My Classes", value: stats.classes, hint: "Owned workspaces" },
          { label: "Enrolled Students", value: stats.students, hint: "Unique active students" },
          { label: "Badge Templates", value: stats.badgeTemplates, hint: "Owned templates" },
          { label: "Badges Issued", value: stats.issuedBadges },
          { label: "Active Credentials", value: stats.activeCredentials, tone: "success" },
          { label: "Revoked Credentials", value: stats.revokedCredentials, tone: "danger" },
          { label: "Expired Credentials", value: stats.expiredCredentials, tone: "warning" },
          { label: "Issued (14 days)", value: trendTotal, hint: "Recent issuance activity" },
        ];

  return (
    <section aria-label="Dashboard summary" className="stat-grid dashboard-stat-grid">
      {cards.map((card) => (
        <article className={`stat-card ${card.tone ?? "default"}`} key={card.label}>
          <span>{card.label}</span>
          <strong>{formatCount(card.value)}</strong>
          {card.hint ? <small>{card.hint}</small> : null}
        </article>
      ))}
    </section>
  );
}
