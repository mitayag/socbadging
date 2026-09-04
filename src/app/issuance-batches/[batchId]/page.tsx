import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { BatchResult } from "@/components/issuance/batch-result";
import { AppShell } from "@/components/layout/app-shell";
import { getCurrentActor } from "@/modules/identity/services/current-actor";
import {
  BatchNotFoundError,
  BatchUnavailableError,
  getBatchDetail,
} from "@/modules/issuance/services/batch-preview-service";

export const dynamic = "force-dynamic";

export default async function IssuanceBatchPage({
  params,
  searchParams,
}: {
  params: Promise<{ batchId: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const actor = await getCurrentActor();
  if (!actor) redirect("/login");

  const [{ batchId }, query] = await Promise.all([params, searchParams]);
  let detail: Awaited<ReturnType<typeof getBatchDetail>>;
  try {
    detail = await getBatchDetail(actor, batchId);
  } catch (error) {
    if (error instanceof BatchNotFoundError || error instanceof BatchUnavailableError) notFound();
    throw error;
  }

  return (
    <AppShell actor={actor} title="Batch Result">
      <section className="workspace-page">
        <Link
          className="text-button"
          href={`/classes/${encodeURIComponent(detail.classId)}/issued`}
        >
          ← Back to Class Issued Badges
        </Link>
        <BatchResult detail={detail} repeatedCommit={query.notice === "existing"} />
      </section>
    </AppShell>
  );
}
