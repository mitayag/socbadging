import type { StudentDashboardData } from "@/modules/student/types";

function count(value: number) {
  return value.toLocaleString("en-PH");
}

export function StudentStatCards({ data }: { data: StudentDashboardData }) {
  const cards = [
    { label: "Earned Badges", value: data.total, hint: "All credentials", tone: "default" },
    { label: "Active", value: data.active, hint: "Currently valid", tone: "success" },
    { label: "Expired", value: data.expired, hint: "Past validity", tone: "warning" },
    { label: "Revoked", value: data.revoked, hint: "No longer valid", tone: "danger" },
  ];
  return (
    <section aria-label="Badge summary" className="stat-grid student-stat-grid">
      {cards.map((card) => (
        <article className={`stat-card ${card.tone}`} key={card.label}>
          <span>{card.label}</span>
          <strong>{count(card.value)}</strong>
          <small>{card.hint}</small>
        </article>
      ))}
    </section>
  );
}
