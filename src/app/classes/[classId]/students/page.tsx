import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { getCurrentActor } from "@/modules/identity/services/current-actor";
import { getClassWorkspace, listRoster } from "@/modules/rosters/services/roster-service";
import {
  addStudentAction,
  commitImportAction,
  editStudentAction,
  enrollmentAction,
} from "./actions";
import { ImportWizard } from "@/components/rosters/import-wizard";
import { getClassTabs } from "@/components/layout/navigation";
export const dynamic = "force-dynamic";
export default async function StudentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ classId: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const actor = await getCurrentActor();
  if (!actor) redirect("/login");
  const classId = (await params).classId;
  const query = await searchParams;
  const status = query.status === "ACTIVE" || query.status === "REMOVED" ? query.status : undefined;
  const page = Math.max(1, Number(query.page) || 1);
  const [item, roster] = await Promise.all([
    getClassWorkspace(actor, classId),
    listRoster(actor, classId, query.q ?? "", status, page),
  ]);
  return (
    <AppShell actor={actor} title={item.courseCode}>
      <section className="workspace-page">
        <div className="page-heading">
          <div>
            <span className="eyebrow">
              {item.courseCode} · {item.section}
            </span>
            <h1>{item.title}</h1>
            <p>
              {item.term} · {item.academicYear}
            </p>
          </div>
        </div>
        <nav aria-label="Class Navigation" className="class-tabs">
          {getClassTabs(classId, "students").map((tab) => (
            <Link className={tab.active ? "active" : undefined} href={tab.href} key={tab.href}>
              {tab.label}
            </Link>
          ))}
        </nav>
        {query.notice && <p className="notice">Roster {query.notice} successfully.</p>}
        {actor.role === "FACULTY" && (
          <>
            <details className="panel">
              <summary className="panel-summary">Add One Student</summary>
              <form action={addStudentAction} className="form-grid">
                <input type="hidden" name="classId" value={classId} />
                <label className="field">
                  Student Number
                  <input name="studentNumber" required />
                </label>
                <label className="field">
                  First Name
                  <input name="firstName" required />
                </label>
                <label className="field">
                  Last Name
                  <input name="lastName" required />
                </label>
                <label className="field">
                  Email
                  <input name="email" type="email" required />
                </label>
                <button className="primary-button form-submit">Add Student</button>
              </form>
            </details>
            <details className="panel">
              <summary className="panel-summary">Import CSV or XLSX</summary>
              <ImportWizard classId={classId} commitAction={commitImportAction} />
            </details>
          </>
        )}
        <form className="filters">
          <input name="q" defaultValue={query.q} placeholder="Search roster" />
          <select name="status" defaultValue={status ?? ""}>
            <option value="">All Enrollments</option>
            <option>ACTIVE</option>
            <option>REMOVED</option>
          </select>
          <button className="secondary-button">Filter</button>
          <a
            className="secondary-button export-link"
            href={`/api/classes/${classId}/roster/export`}
          >
            Export CSV
          </a>
        </form>
        <div className="record-list">
          {roster.items.map(({ student, enrollmentStatus }) => (
            <details className="record" key={student.id}>
              <summary>
                <span>
                  <strong>
                    {student.lastName}, {student.firstName}
                  </strong>
                  <small>
                    {student.studentNumber} · {student.email}
                  </small>
                </span>
                <span className={`status ${enrollmentStatus.toLowerCase()}`}>
                  {enrollmentStatus}
                </span>
              </summary>
              <div className="record-body">
                {actor.role === "FACULTY" ? (
                  <>
                    <form action={editStudentAction} className="form-grid">
                      <input type="hidden" name="classId" value={classId} />
                      <input type="hidden" name="studentId" value={student.id} />
                      <label className="field">
                        Student Number
                        <input name="studentNumber" defaultValue={student.studentNumber} required />
                      </label>
                      <label className="field">
                        First Name
                        <input name="firstName" defaultValue={student.firstName} required />
                      </label>
                      <label className="field">
                        Last Name
                        <input name="lastName" defaultValue={student.lastName} required />
                      </label>
                      <label className="field">
                        Email
                        <input name="email" defaultValue={student.email} required />
                      </label>
                      <button className="secondary-button">Save Student</button>
                    </form>
                    <form action={enrollmentAction}>
                      <input type="hidden" name="classId" value={classId} />
                      <input type="hidden" name="studentId" value={student.id} />
                      <input
                        type="hidden"
                        name="status"
                        value={enrollmentStatus === "ACTIVE" ? "REMOVED" : "ACTIVE"}
                      />
                      <button
                        className={
                          enrollmentStatus === "ACTIVE" ? "danger-button" : "secondary-button"
                        }
                      >
                        {enrollmentStatus === "ACTIVE" ? "Remove from Class" : "Restore Enrollment"}
                      </button>
                    </form>
                  </>
                ) : (
                  <p className="muted">Administrator inspection is read-only.</p>
                )}
              </div>
            </details>
          ))}
          {!roster.items.length && (
            <div className="empty-state">No students match these filters.</div>
          )}
        </div>
      </section>
    </AppShell>
  );
}
