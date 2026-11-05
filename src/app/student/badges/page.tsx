import { redirect } from "next/navigation";

import { AppShell } from "@/components/layout/app-shell";
import { StudentBadgeCollection } from "@/components/student/student-badge-collection";
import { getCurrentActor } from "@/modules/identity/services/current-actor";
import { listStudentBadges } from "@/modules/student/services/student-portal-service";
import type { StudentBadgeSort, StudentCredentialStatus } from "@/modules/student/types";

export const dynamic = "force-dynamic";

function parseStatus(value: string | undefined): StudentCredentialStatus | undefined {
  return value === "ACTIVE" || value === "REVOKED" || value === "EXPIRED" ? value : undefined;
}

function parseSort(value: string | undefined): StudentBadgeSort {
  return value === "issued_asc" || value === "status" ? value : "issued_desc";
}

function parseView(value: string | undefined): "grid" | "list" {
  return value === "list" ? "list" : "grid";
}

export default async function StudentBadgesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const actor = await getCurrentActor();
  if (!actor) redirect("/login");
  if (actor.role !== "STUDENT") redirect("/dashboard");
  const params = await searchParams;
  const query = {
    q: params.q,
    status: parseStatus(params.status),
    sort: parseSort(params.sort),
    view: parseView(params.view),
  };
  const result = await listStudentBadges(actor, {
    query: query.q,
    status: query.status,
    sort: query.sort,
    page: Math.max(1, Number(params.page) || 1),
  });

  return (
    <AppShell actor={actor} title="My Badges">
      <section className="workspace-page student-page">
        <div className="page-heading">
          <span className="eyebrow">Credential Wallet</span>
          <h1>My Badges</h1>
          <p>Browse every credential issued to your student record across classes and terms.</p>
        </div>
        <StudentBadgeCollection
          basePath="/student/badges"
          hasNext={result.hasNext}
          items={result.items}
          page={result.page}
          query={query}
        />
      </section>
    </AppShell>
  );
}
