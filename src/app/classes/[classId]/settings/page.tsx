import Link from "next/link";
import { redirect } from "next/navigation";

import { AppShell } from "@/components/layout/app-shell";
import { getClassTabs } from "@/components/layout/navigation";
import { listCourseOptions } from "@/modules/catalog/services/course-service";
import { getCurrentActor } from "@/modules/identity/services/current-actor";
import { prisma } from "@/platform/db/prisma";
import { getClassWorkspace } from "@/modules/rosters/services/roster-service";
import { mapCourseAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function ClassSettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ classId: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const actor = await getCurrentActor();
  if (!actor) redirect("/login");
  if (actor.role === "STUDENT") redirect("/student");

  const { classId } = await params;
  const query = await searchParams;
  const [item, courses, classRecord] = await Promise.all([
    getClassWorkspace(actor, classId),
    listCourseOptions(actor),
    prisma.class.findUnique({ where: { id: classId }, select: { courseId: true } }),
  ]);

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
        {query.notice === "mapped" ? (
          <p className="notice" role="status">
            Course mapping updated.
          </p>
        ) : null}
        {query.error ? (
          <p className="notice error" role="alert">
            {query.error}
          </p>
        ) : null}
        <section className="panel">
          <h2>Standardized Course</h2>
          <p className="muted">
            Mapping this class to a catalog course enables shared, approved badges for the course.
          </p>
          <form action={mapCourseAction} className="form-grid">
            <input name="classId" type="hidden" value={classId} />
            <label className="field">
              Catalog Course
              <select defaultValue={classRecord?.courseId ?? ""} name="courseId">
                <option value="">Unmapped (legacy)</option>
                {courses.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.code} · {course.title}
                  </option>
                ))}
              </select>
            </label>
            <button className="secondary-button form-submit">Save Course Mapping</button>
          </form>
        </section>
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
