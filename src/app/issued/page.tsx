import { redirect } from "next/navigation";

import { IssuanceList } from "@/components/issuance/issuance-list";
import { AppShell } from "@/components/layout/app-shell";
import { getCurrentActor } from "@/modules/identity/services/current-actor";
import {
  listIssuances,
  normalizeIssuanceFilters,
} from "@/modules/issuance/services/issuance-query-service";

export const dynamic = "force-dynamic";

function issuanceFilters(query: Record<string, string | undefined>) {
  const status = query.status;
  return normalizeIssuanceFilters({
    query: query.query,
    status:
      status === "ACTIVE" || status === "REVOKED" || status === "EXPIRED" ? status : undefined,
    classId: query.classId,
    badgeTemplateId: query.badgeTemplateId,
    page: query.page,
    pageSize: query.pageSize,
    sort: query.sort === "issued_asc" || query.sort === "status" ? query.sort : undefined,
  });
}

function exportHref(filters: ReturnType<typeof issuanceFilters>) {
  const params = new URLSearchParams();
  if (filters.query) params.set("query", filters.query);
  if (filters.status) params.set("status", filters.status);
  if (filters.classId) params.set("classId", filters.classId);
  if (filters.badgeTemplateId) params.set("badgeTemplateId", filters.badgeTemplateId);
  if (filters.sort && filters.sort !== "issued_desc") params.set("sort", filters.sort);
  const query = params.toString();
  return `/api/issued/export${query ? `?${query}` : ""}`;
}

export default async function IssuedBadgesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const actor = await getCurrentActor();
  if (!actor) redirect("/login");
  if (actor.role === "STUDENT") redirect("/student");

  const filters = issuanceFilters(await searchParams);
  const issued = await listIssuances(actor, filters);

  return (
    <AppShell actor={actor} title="Issued Badges">
      <section className="workspace-page">
        <div className="page-heading">
          <div>
            <span className="eyebrow">Credential Records</span>
            <h1>Issued Badges</h1>
            <p>Search, filter, and export the credential records you are authorized to inspect.</p>
          </div>
        </div>
        <IssuanceList
          exportHref={exportHref(filters)}
          filters={filters}
          hasNext={issued.hasNext}
          hasPrevious={issued.hasPrevious}
          items={issued.items}
          page={issued.page}
          pageSize={issued.pageSize}
          total={issued.total}
          totalPages={issued.totalPages}
        />
      </section>
    </AppShell>
  );
}
