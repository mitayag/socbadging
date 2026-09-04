import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { AppShell } from "@/components/layout/app-shell";
import { CredentialDetail } from "@/components/issuance/credential-detail";
import { getCurrentActor } from "@/modules/identity/services/current-actor";
import {
  getIssuanceDetail,
  IssuanceNotFoundError,
} from "@/modules/issuance/services/issuance-query-service";
import { getIssuanceNotificationStatus } from "@/modules/notifications/services/notification-query-service";

export const dynamic = "force-dynamic";

export default async function IssuanceDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ issuanceId: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const actor = await getCurrentActor();
  if (!actor) redirect("/login");

  const [{ issuanceId }, query] = await Promise.all([params, searchParams]);
  let detail: Awaited<ReturnType<typeof getIssuanceDetail>>;
  try {
    detail = await getIssuanceDetail(actor, issuanceId);
  } catch (error) {
    if (error instanceof IssuanceNotFoundError) notFound();
    throw error;
  }
  const notice = ["issued", "existing", "revoked"].includes(query.notice ?? "")
    ? query.notice
    : null;
  const canRevoke =
    detail.status === "ACTIVE" && (actor.role === "ADMIN" || actor.role === "FACULTY");
  const notificationStatus = await getIssuanceNotificationStatus(actor, detail.id);

  return (
    <AppShell actor={actor} title="Credential Detail">
      <section className="workspace-page narrow">
        <Link className="text-button" href="/issued">
          ← Back to Issued Badges
        </Link>
        {notice === "issued" ? (
          <p className="notice">
            Badge issued successfully. This immutable credential snapshot is now saved.
          </p>
        ) : null}
        {notice === "existing" ? (
          <p className="notice">
            This badge was already issued. Showing the existing credential snapshot.
          </p>
        ) : null}
        {notice === "revoked" ? <p className="notice">Credential revoked successfully.</p> : null}
        <CredentialDetail
          canRevoke={canRevoke}
          canReplace={actor.role === "ADMIN"}
          detail={detail}
          notificationStatus={notificationStatus}
        />
      </section>
    </AppShell>
  );
}
