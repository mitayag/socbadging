import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { AppShell } from "@/components/layout/app-shell";
import { BadgeVersionFields } from "@/components/library/badge-version-fields";
import { ConfirmDialogButton } from "@/components/ui/confirm-dialog-button";
import {
  detectDuplicateCandidates,
  getBadgeDefinition,
  getBadgeUsage,
} from "@/modules/badge-library/services/badge-library-service";
import { listClassOptions, listCourseOptions } from "@/modules/catalog/services/course-service";
import { getCurrentActor } from "@/modules/identity/services/current-actor";
import {
  archiveBadgeDefinitionAction,
  assignBadgeAction,
  reviewBadgeDefinitionAction,
  reviseBadgeDefinitionAction,
  submitBadgeDefinitionAction,
} from "../actions";

export const dynamic = "force-dynamic";

const statusLabels: Record<string, string> = {
  DRAFT: "Draft",
  PENDING_APPROVAL: "Pending Approval",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  ARCHIVED: "Archived",
};

const noticeMessages: Record<string, string> = {
  created: "Badge definition created as a draft.",
  submitted: "Badge version submitted for approval.",
  reviewed: "Approval decision recorded.",
  archived: "Badge definition and active assignments archived.",
  "version-created": "A new version was created. Existing credentials are unchanged.",
  assigned: "Badge assigned to the class section.",
};

export default async function BadgeDefinitionPage({
  params,
  searchParams,
}: {
  params: Promise<{ definitionId: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const actor = await getCurrentActor();
  if (!actor) redirect("/login");
  if (actor.role === "STUDENT") redirect("/student");
  const { definitionId } = await params;
  const query = await searchParams;

  let definition: Awaited<ReturnType<typeof getBadgeDefinition>>;
  try {
    definition = await getBadgeDefinition(actor, definitionId);
  } catch {
    notFound();
  }
  const isAdmin = actor.role === "ADMIN";
  const isOwner = definition.createdByUserId === actor.id;
  const [courses, classes, usage, duplicates] = await Promise.all([
    listCourseOptions(actor),
    listClassOptions(actor),
    isAdmin ? getBadgeUsage(actor, definitionId) : Promise.resolve(null),
    (async () => {
      const latest = definition.versions[0];
      if (!latest) return [];
      const candidates = await detectDuplicateCandidates(actor, {
        courseId: definition.courseId,
        name: latest.name,
        criteria: latest.criteria,
        imagePath: latest.imagePath,
      });
      return candidates.filter((candidate) => candidate.definition.id !== definition.id);
    })(),
  ]);
  const latest = definition.versions[0];
  const approved = definition.versions.find((version) => version.status === "APPROVED");
  const pending = definition.versions.find((version) => version.status === "PENDING_APPROVAL");
  const activeClasses = classes.filter((item) => item.status === "ACTIVE");
  const canSubmit =
    (isAdmin || isOwner) &&
    latest &&
    (latest.status === "DRAFT" || latest.status === "REJECTED") &&
    definition.status !== "ARCHIVED";
  const canRevise = isAdmin || (isOwner && !approved);
  const canAssign =
    definition.status === "APPROVED" && Boolean(approved) && activeClasses.length > 0;

  return (
    <AppShell actor={actor} title="Badge Library">
      <section className="workspace-page">
        <div className="page-heading">
          <div>
            <span className="eyebrow">
              <Link href="/library">Badge Library</Link> · {definition.course.code}
            </span>
            <h1>{definition.name}</h1>
            <p>{definition.course.title}</p>
          </div>
          <span className={`status ${definition.status.toLowerCase()}`}>
            {statusLabels[definition.status] ?? definition.status}
          </span>
        </div>
        {query.notice && noticeMessages[query.notice] ? (
          <p className="notice" role="status">
            {noticeMessages[query.notice]}
          </p>
        ) : null}
        {query.error ? (
          <p className="notice error" role="alert">
            {query.error}
          </p>
        ) : null}

        <section className="panel credential-panel">
          <div className="badge-detail">
            {latest ? (
              <Image
                alt={`${definition.name} badge artwork`}
                height={180}
                src={`/api/media/${latest.imagePath}`}
                unoptimized
                width={180}
              />
            ) : null}
            <dl className="credential-facts">
              <div>
                <dt>Course</dt>
                <dd>
                  {definition.course.code} · {definition.course.title}
                </dd>
              </div>
              <div>
                <dt>Created By</dt>
                <dd>{definition.createdBy.name}</dd>
              </div>
              <div>
                <dt>Latest Version</dt>
                <dd>{latest ? `v${latest.version} · ${statusLabels[latest.status]}` : "—"}</dd>
              </div>
              {approved ? (
                <div>
                  <dt>Approved Version</dt>
                  <dd>
                    v{approved.version}
                    {approved.approvedAt
                      ? ` · ${approved.approvedAt.toISOString().slice(0, 10)}`
                      : ""}
                    {approved.approvedBy ? ` · ${approved.approvedBy.name}` : ""}
                  </dd>
                </div>
              ) : null}
              {latest?.gradingPeriod ? (
                <div>
                  <dt>Grading Period</dt>
                  <dd>{latest.gradingPeriod}</dd>
                </div>
              ) : null}
              {latest ? (
                <div>
                  <dt>Issuing Institution</dt>
                  <dd>{latest.issuingInstitution}</dd>
                </div>
              ) : null}
              {latest?.validityDays ? (
                <div>
                  <dt>Validity</dt>
                  <dd>{latest.validityDays} days</dd>
                </div>
              ) : null}
            </dl>
          </div>
        </section>

        {usage ? (
          <section className="panel">
            <h2>Badge Usage</h2>
            <dl className="credential-facts">
              <div>
                <dt>Class Assignments</dt>
                <dd>
                  {usage.activeAssignments} active / {usage.assignments} total
                </dd>
              </div>
              <div>
                <dt>Class Sections</dt>
                <dd>{usage.distinctClasses}</dd>
              </div>
              <div>
                <dt>Issued Credentials</dt>
                <dd>{usage.issuances}</dd>
              </div>
              <div>
                <dt>Distinct Students</dt>
                <dd>{usage.distinctStudents}</dd>
              </div>
              <div>
                <dt>Revoked</dt>
                <dd>{usage.revoked}</dd>
              </div>
            </dl>
          </section>
        ) : null}

        <section className="panel">
          <h2>Actions</h2>
          <div className="inline-actions">
            {canSubmit ? (
              <form action={submitBadgeDefinitionAction} className="form-grid">
                <input name="definitionId" type="hidden" value={definition.id} />
                <label className="field full">
                  Submission Note (optional)
                  <input maxLength={500} name="note" />
                </label>
                <button className="primary-button">Submit for Approval</button>
              </form>
            ) : null}
          </div>
          {isAdmin && pending ? (
            <div className="approval-actions">
              <form action={reviewBadgeDefinitionAction} className="form-grid">
                <input name="definitionId" type="hidden" value={definition.id} />
                <input name="versionId" type="hidden" value={pending.id} />
                <input name="decision" type="hidden" value="APPROVED" />
                <button className="primary-button">Approve &amp; Publish</button>
              </form>
              <form action={reviewBadgeDefinitionAction} className="form-grid">
                <input name="definitionId" type="hidden" value={definition.id} />
                <input name="versionId" type="hidden" value={pending.id} />
                <input name="decision" type="hidden" value="REJECTED" />
                <label className="field full">
                  Rejection Reason
                  <input maxLength={500} name="note" required />
                </label>
                <button className="danger-button">Reject</button>
              </form>
            </div>
          ) : null}
          {isAdmin && definition.status !== "ARCHIVED" ? (
            <ConfirmDialogButton
              action={archiveBadgeDefinitionAction}
              confirmLabel="Archive Badge"
              description="Archiving blocks new assignments and issuance while preserving every historical credential, version and audit record."
              fields={{ definitionId: definition.id }}
              title={`Archive ${definition.name}?`}
              triggerLabel="Archive Badge"
            />
          ) : null}
        </section>

        {canRevise && latest ? (
          <details className="panel">
            <summary className="panel-summary">Create a New Version</summary>
            <p className="muted">
              Material changes create a new immutable version. Existing issued credentials continue
              to reference their original version and signature.
            </p>
            <form action={reviseBadgeDefinitionAction} className="form-grid">
              <input name="definitionId" type="hidden" value={definition.id} />
              <BadgeVersionFields
                courses={courses}
                item={{ ...latest, courseId: definition.courseId }}
                requireImage={false}
              />
              <button className="secondary-button form-submit">Create Version</button>
            </form>
          </details>
        ) : null}

        {canAssign && approved ? (
          <details className="panel" open>
            <summary className="panel-summary">Assign to a Class Section</summary>
            <p className="muted">
              Assign approved version v{approved.version} to one of your class sections. Duplicate
              assignments are prevented.
            </p>
            <form action={assignBadgeAction} className="form-grid">
              <input name="definitionId" type="hidden" value={definition.id} />
              <input name="versionId" type="hidden" value={approved.id} />
              <label className="field">
                Class Section
                <select name="classId" required>
                  {activeClasses.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.courseCode} · {item.title} · {item.section} ({item.academicYear})
                    </option>
                  ))}
                </select>
              </label>
              <button className="primary-button form-submit">Assign Badge</button>
            </form>
          </details>
        ) : null}

        {duplicates.length ? (
          <section className="panel">
            <h2>Potential Duplicates</h2>
            <p className="muted">
              These definitions look similar. They are not merged automatically; an administrator
              must review them.
            </p>
            <ul>
              {duplicates.map((candidate) => (
                <li key={candidate.definition.id}>
                  <Link href={`/library/${candidate.definition.id}`}>
                    {candidate.definition.name}
                  </Link>{" "}
                  — {candidate.reasons.join(", ")}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="panel">
          <h2>Version History</h2>
          <div className="data-table-scroll" role="region" tabIndex={0}>
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Version</th>
                  <th scope="col">Status</th>
                  <th scope="col">Created</th>
                  <th scope="col">Approved</th>
                  <th scope="col">Details</th>
                  <th scope="col">Reviews</th>
                </tr>
              </thead>
              <tbody>
                {definition.versions.map((version) => (
                  <tr key={version.id}>
                    <td>v{version.version}</td>
                    <td>
                      <span className={`status ${version.status.toLowerCase()}`}>
                        {statusLabels[version.status]}
                      </span>
                    </td>
                    <td>{version.createdAt.toISOString().slice(0, 10)}</td>
                    <td>
                      {version.approvedAt
                        ? `${version.approvedAt.toISOString().slice(0, 10)} · ${version.approvedBy?.name ?? ""}`
                        : "—"}
                    </td>
                    <td>
                      <details>
                        <summary className="text-button">View</summary>
                        <p>{version.description}</p>
                        <strong>Competencies</strong>
                        <p>{version.competencies}</p>
                        <strong>Assessment Criteria</strong>
                        <p>{version.assessmentCriteria}</p>
                        {version.rejectionReason ? (
                          <p className="notice error">Rejected: {version.rejectionReason}</p>
                        ) : null}
                      </details>
                    </td>
                    <td>{version.reviews.length}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="panel">
          <h2>Associated Class Sections</h2>
          {definition.assignments.length ? (
            <div className="data-table-scroll" role="region" tabIndex={0}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th scope="col">Class</th>
                    <th scope="col">Faculty</th>
                    <th scope="col">Version</th>
                    <th scope="col">Status</th>
                    <th scope="col">Issued</th>
                  </tr>
                </thead>
                <tbody>
                  {definition.assignments.map((assignment) => (
                    <tr key={assignment.id}>
                      <td>
                        {assignment.class.courseCode} · {assignment.class.title} ·{" "}
                        {assignment.class.section}
                      </td>
                      <td>{assignment.class.owner.name}</td>
                      <td>v{assignment.badgeDefinitionVersion.version}</td>
                      <td>
                        <span className={`status ${assignment.status.toLowerCase()}`}>
                          {assignment.status}
                        </span>
                      </td>
                      <td>{assignment.badgeTemplate?._count.badgeIssuances ?? 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty-state">This badge has not been assigned to a class section.</div>
          )}
        </section>
      </section>
    </AppShell>
  );
}
