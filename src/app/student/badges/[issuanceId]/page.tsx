import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { AppShell } from "@/components/layout/app-shell";
import { StudentCredentialDetail } from "@/components/student/student-credential-detail";
import { getCurrentActor } from "@/modules/identity/services/current-actor";
import {
  getStudentBadgeDetail,
  StudentBadgeNotFoundError,
} from "@/modules/student/services/student-portal-service";

export const dynamic = "force-dynamic";

export default async function StudentBadgeDetailPage({
  params,
}: {
  params: Promise<{ issuanceId: string }>;
}) {
  const actor = await getCurrentActor();
  if (!actor) redirect("/login");
  if (actor.role !== "STUDENT") redirect("/dashboard");
  const { issuanceId } = await params;
  let detail: Awaited<ReturnType<typeof getStudentBadgeDetail>>;
  try {
    detail = await getStudentBadgeDetail(actor, issuanceId);
  } catch (error) {
    if (error instanceof StudentBadgeNotFoundError) notFound();
    throw error;
  }
  return (
    <AppShell actor={actor} title="Credential Detail">
      <section className="workspace-page">
        <Link className="text-button" href="/student/badges">
          ← Back to My Badges
        </Link>
        <StudentCredentialDetail credential={detail.credential} />
      </section>
    </AppShell>
  );
}
