import { notFound, redirect } from "next/navigation";

import { AuditLogList } from "@/components/audit/audit-log-list";
import { AppShell } from "@/components/layout/app-shell";
import {
  listAuditLogs,
  type NormalizedAuditLogFilters,
} from "@/modules/audit/services/audit-log-service";
import { AuthorizationError } from "@/modules/identity/policies/authorization";
import { getCurrentActor } from "@/modules/identity/services/current-actor";

export const dynamic = "force-dynamic";

function auditHref(filters: NormalizedAuditLogFilters, page: number) {
  const params = new URLSearchParams();
  if (filters.query) params.set("query", filters.query);
  if (filters.entityType) params.set("entityType", filters.entityType);
  if (filters.action) params.set("action", filters.action);
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  if (filters.pageSize !== 5) params.set("pageSize", String(filters.pageSize));
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `/audit-logs?${query}` : "/audit-logs";
}

export default async function AuditLogsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const actor = await getCurrentActor();
  if (!actor) redirect("/login");

  const params = await searchParams;
  let auditLogs: Awaited<ReturnType<typeof listAuditLogs>>;
  try {
    auditLogs = await listAuditLogs(actor, params);
  } catch (error) {
    if (error instanceof AuthorizationError) notFound();
    throw error;
  }

  return (
    <AppShell actor={actor} title="Audit Logs">
      <section className="workspace-page">
        <div className="page-heading">
          <p className="eyebrow">Administrator</p>
          <h1>Audit Logs</h1>
          <p>
            Review sensitive system activity. Private audit context and network identifiers are not
            shown here.
          </p>
        </div>
        <AuditLogList
          facets={auditLogs.facets}
          filters={auditLogs.filters}
          hasNext={auditLogs.hasNext}
          hasPrevious={auditLogs.hasPrevious}
          items={auditLogs.items}
          nextHref={
            auditLogs.hasNext ? auditHref(auditLogs.filters, auditLogs.page + 1) : undefined
          }
          page={auditLogs.page}
          pageSize={auditLogs.pageSize}
          previousHref={
            auditLogs.hasPrevious ? auditHref(auditLogs.filters, auditLogs.page - 1) : undefined
          }
          total={auditLogs.total}
          totalPages={auditLogs.totalPages}
        />
      </section>
    </AppShell>
  );
}
