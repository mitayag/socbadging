import Link from "next/link";
import { redirect } from "next/navigation";

import { IssueBadgeSection } from "@/components/issuance/issue-badge-section";
import { IssuanceList } from "@/components/issuance/issuance-list";
import { BatchHistory } from "@/components/issuance/batch-history";
import { BatchIssuanceSection } from "@/components/issuance/batch-issuance-section";
import { AppShell } from "@/components/layout/app-shell";
import { getClassTabs } from "@/components/layout/navigation";
import { getCurrentActor } from "@/modules/identity/services/current-actor";
import {
  listIssuances,
  listIssueOptions,
  normalizeIssuanceFilters,
} from "@/modules/issuance/services/issuance-query-service";
import { listClassBatches } from "@/modules/issuance/services/batch-preview-service";
import { getClassWorkspace } from "@/modules/rosters/services/roster-service";

import { issueBadgeAction } from "./actions";
import { commitBatchIssuanceAction } from "./batch-actions";

export const dynamic = "force-dynamic";

function issuanceFilters(query: Record<string, string | undefined>, classId: string) {
  const status = query.status;
  return normalizeIssuanceFilters({
    query: query.query,
    status:
      status === "ACTIVE" || status === "REVOKED" || status === "EXPIRED" ? status : undefined,
    classId,
    badgeTemplateId: query.badgeTemplateId,
    page: query.page,
  });
}

function exportHref(classId: string, filters: ReturnType<typeof issuanceFilters>) {
  const params = new URLSearchParams();
  if (filters.query) params.set("query", filters.query);
  if (filters.status) params.set("status", filters.status);
  if (filters.badgeTemplateId) params.set("badgeTemplateId", filters.badgeTemplateId);
  const query = params.toString();
  return `/api/classes/${encodeURIComponent(classId)}/issued/export${query ? `?${query}` : ""}`;
}

export default async function IssuedClassPage({
  params,
  searchParams,
}: {
  params: Promise<{ classId: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const actor = await getCurrentActor();
  if (!actor) redirect("/login");

  const [{ classId }, query] = await Promise.all([params, searchParams]);
  const filters = issuanceFilters(query, classId);
  const [item, issued, options, batches] = await Promise.all([
    getClassWorkspace(actor, classId),
    listIssuances(actor, filters),
    actor.role === "FACULTY" ? listIssueOptions(actor, classId) : Promise.resolve(null),
    listClassBatches(actor, classId),
  ]);
  const notice = query.notice === "issued" || query.notice === "existing" ? query.notice : null;

  return (
    <AppShell actor={actor} title={item.courseCode}>
      <section className="workspace-page">
        <div className="page-heading">
          <div>
            <span className="eyebrow">
              {item.courseCode} · {item.section}
            </span>
            <h1>{item.title}</h1>
            <p>Issue and inspect credential records for this class.</p>
          </div>
        </div>
        <nav aria-label="Class Navigation" className="class-tabs">
          {getClassTabs(classId, "issued").map((tab) => (
            <Link className={tab.active ? "active" : undefined} href={tab.href} key={tab.href}>
              {tab.label}
            </Link>
          ))}
        </nav>
        {notice === "issued" ? (
          <p className="notice">
            Badge issued successfully. The credential record is now available.
          </p>
        ) : null}
        {notice === "existing" ? (
          <p className="notice">
            This badge was already issued. The existing credential was retained.
          </p>
        ) : null}
        <IssueBadgeSection
          classId={classId}
          issueAction={issueBadgeAction}
          options={options}
          role={actor.role}
        />
        <BatchIssuanceSection
          badgeOptions={options?.badgeOptions.map(({ id, name }) => ({ id, name })) ?? []}
          classId={classId}
          commitAction={commitBatchIssuanceAction}
          role={actor.role}
        />
        <BatchHistory items={batches} />
        <IssuanceList
          exportHref={exportHref(classId, filters)}
          filters={filters}
          fixedClassId={classId}
          items={issued.items}
          page={issued.page}
          pathname={`/classes/${encodeURIComponent(classId)}/issued`}
          totalPages={issued.totalPages}
        />
      </section>
    </AppShell>
  );
}
