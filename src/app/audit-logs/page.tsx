import { notFound, redirect } from "next/navigation";

import { AuditLogList } from "@/components/audit/audit-log-list";
import { AppShell } from "@/components/layout/app-shell";
import { listAuditLogs } from "@/modules/audit/services/audit-log-service";
import { AuthorizationError } from "@/modules/identity/policies/authorization";
import { getCurrentActor } from "@/modules/identity/services/current-actor";

export const dynamic = "force-dynamic";

export default async function AuditLogsPage() {
  const actor = await getCurrentActor();
  if (!actor) redirect("/login");

  let auditLogs: Awaited<ReturnType<typeof listAuditLogs>>;
  try {
    auditLogs = await listAuditLogs(actor);
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
        <AuditLogList items={auditLogs} />
      </section>
    </AppShell>
  );
}
