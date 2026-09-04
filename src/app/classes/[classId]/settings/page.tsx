import Link from "next/link";
import { redirect } from "next/navigation";

import { AppShell } from "@/components/layout/app-shell";
import { getClassTabs } from "@/components/layout/navigation";
import { getCurrentActor } from "@/modules/identity/services/current-actor";
import { getClassWorkspace } from "@/modules/rosters/services/roster-service";

export const dynamic = "force-dynamic";

export default async function ClassSettingsPage({
  params,
}: {
  params: Promise<{ classId: string }>;
}) {
  const actor = await getCurrentActor();
  if (!actor) redirect("/login");

  const { classId } = await params;
  const item = await getClassWorkspace(actor, classId);

  return (
    <AppShell actor={actor} title={item.courseCode}>
      <section className="workspace-page narrow">
        <div className="page-heading">
          <div>
            <span className="eyebrow">
              {item.courseCode} · {item.section}
            </span>
            <h1>Class Settings</h1>
            <p>Review this class’s current configuration.</p>
          </div>
        </div>
        <nav aria-label="Class Navigation" className="class-tabs">
          {getClassTabs(classId, "settings").map((tab) => (
            <Link className={tab.active ? "active" : undefined} href={tab.href} key={tab.href}>
              {tab.label}
            </Link>
          ))}
        </nav>
        <section className="panel credential-panel">
          <h2>{item.title}</h2>
          <dl className="credential-facts">
            <div>
              <dt>Term</dt>
              <dd>{item.term}</dd>
            </div>
            <div>
              <dt>Academic Year</dt>
              <dd>{item.academicYear}</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>
                <span className={`status ${item.status.toLowerCase()}`}>{item.status}</span>
              </dd>
            </div>
            {item.description ? (
              <div>
                <dt>Description</dt>
                <dd>{item.description}</dd>
              </div>
            ) : null}
          </dl>
          {actor.role === "FACULTY" ? (
            <p className="muted">
              To update class details or status, use the existing class management controls.
            </p>
          ) : (
            <p className="muted">Administrator inspection is read-only.</p>
          )}
          <Link className="secondary-button export-link" href="/classes">
            Back to Classes
          </Link>
        </section>
      </section>
    </AppShell>
  );
}
