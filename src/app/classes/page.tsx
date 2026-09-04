import { redirect } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { listClasses } from "@/modules/classes/services/class-service";
import { getCurrentActor } from "@/modules/identity/services/current-actor";
import { createClassAction, editClassAction, statusClassAction } from "./actions";
export const dynamic = "force-dynamic";
export default async function ClassesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const actor = await getCurrentActor();
  if (!actor) redirect("/login");
  const params = await searchParams;
  const status =
    params.status === "ACTIVE" || params.status === "ARCHIVED" ? params.status : undefined;
  const page = Math.max(1, Number(params.page) || 1);
  const result = await listClasses(actor, params.q ?? "", status, page);
  const classes = result.items;
  return (
    <AppShell actor={actor} title="Classes">
      <section className="workspace-page">
        <div className="page-heading">
          <div>
            <span className="eyebrow">Learning Spaces</span>
            <h1>{actor.role === "ADMIN" ? "All Classes" : "My Classes"}</h1>
            <p>
              {actor.role === "ADMIN"
                ? "Inspect faculty classes across the School of Computing."
                : "Create and maintain your classes. Archived classes remain available."}
            </p>
          </div>
        </div>
        {params.notice && (
          <p className="notice" role="status">
            Class {params.notice} successfully.
          </p>
        )}
        {actor.role === "FACULTY" && (
          <details className="panel">
            <summary className="panel-summary">Create Class</summary>
            <form action={createClassAction} className="form-grid">
              <label className="field">
                Course Code
                <input name="courseCode" required />
              </label>
              <label className="field">
                Class Title
                <input name="title" required />
              </label>
              <label className="field">
                Section
                <input name="section" required />
              </label>
              <label className="field">
                Term
                <input name="term" placeholder="First Semester" required />
              </label>
              <label className="field">
                Academic Year
                <input name="academicYear" placeholder="2026-2027" pattern="\d{4}-\d{4}" required />
              </label>
              <label className="field">
                Description
                <input name="description" />
              </label>
              <button className="primary-button form-submit">Create Class</button>
            </form>
          </details>
        )}
        <form className="filters">
          <input name="q" defaultValue={params.q} placeholder="Search code, title, or section" />
          <select name="status" defaultValue={status ?? ""}>
            <option value="">All Statuses</option>
            <option>ACTIVE</option>
            <option>ARCHIVED</option>
          </select>
          <button className="secondary-button">Filter</button>
        </form>
        <div className="record-list">
          {classes.map((item) => (
            <details className="record" key={item.id}>
              <summary>
                <span>
                  <strong>
                    {item.courseCode} · {item.title}
                  </strong>
                  <small>
                    {item.section} · {item.term} · {item.academicYear}
                    {actor.role === "ADMIN" ? ` · ${item.owner.name}` : ""}
                  </small>
                </span>
                <span className={`status ${item.status.toLowerCase()}`}>{item.status}</span>
              </summary>
              <div className="record-body">
                {actor.role === "FACULTY" ? (
                  <>
                    <div className="inline-actions">
                      <Link
                        className="secondary-button export-link"
                        href={`/classes/${item.id}/students`}
                      >
                        Open Roster
                      </Link>
                      <Link
                        className="secondary-button export-link"
                        href={`/classes/${item.id}/badges`}
                      >
                        Badge Templates
                      </Link>
                    </div>
                    <form action={editClassAction} className="form-grid">
                      <input type="hidden" name="classId" value={item.id} />
                      <label className="field">
                        Course Code
                        <input name="courseCode" defaultValue={item.courseCode} required />
                      </label>
                      <label className="field">
                        Class Title
                        <input name="title" defaultValue={item.title} required />
                      </label>
                      <label className="field">
                        Section
                        <input name="section" defaultValue={item.section} required />
                      </label>
                      <label className="field">
                        Term
                        <input name="term" defaultValue={item.term} required />
                      </label>
                      <label className="field">
                        Academic Year
                        <input name="academicYear" defaultValue={item.academicYear} required />
                      </label>
                      <label className="field">
                        Description
                        <input name="description" defaultValue={item.description ?? ""} />
                      </label>
                      <button className="secondary-button">Save Class</button>
                    </form>
                    <form action={statusClassAction}>
                      <input type="hidden" name="classId" value={item.id} />
                      <input
                        type="hidden"
                        name="status"
                        value={item.status === "ACTIVE" ? "ARCHIVED" : "ACTIVE"}
                      />
                      <button
                        className={item.status === "ACTIVE" ? "danger-button" : "secondary-button"}
                      >
                        {item.status === "ACTIVE" ? "Archive Class" : "Reopen Class"}
                      </button>
                    </form>
                  </>
                ) : (
                  <p className="muted">
                    Owned by {item.owner.name} ({item.owner.email}). Administrator access is
                    read-only in Phase 2.
                  </p>
                )}
              </div>
            </details>
          ))}
          {!classes.length && <div className="empty-state">No classes match these filters.</div>}
        </div>
        <nav className="pagination" aria-label="Class pages">
          {page > 1 && (
            <a
              className="secondary-button"
              href={`?q=${encodeURIComponent(params.q ?? "")}&status=${status ?? ""}&page=${page - 1}`}
            >
              Previous
            </a>
          )}
          <span>Page {page}</span>
          {result.hasNext && (
            <a
              className="secondary-button"
              href={`?q=${encodeURIComponent(params.q ?? "")}&status=${status ?? ""}&page=${page + 1}`}
            >
              Next
            </a>
          )}
        </nav>
      </section>
    </AppShell>
  );
}
