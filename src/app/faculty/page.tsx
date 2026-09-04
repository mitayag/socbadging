import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { requireRole } from "@/modules/identity/policies/authorization";
import { getCurrentActor } from "@/modules/identity/services/current-actor";
import { listFaculty } from "@/modules/faculty/services/faculty-service";
import { listDepartments } from "@/modules/departments/services/department-service";
import { DepartmentSelect } from "@/components/faculty/department-select";
import { DeleteFacultyControl } from "@/components/faculty/delete-faculty-control";
import {
  createDepartmentAction,
  renameDepartmentAction,
  statusDepartmentAction,
} from "./department-actions";
import {
  createFacultyAction,
  deleteFacultyAction,
  editFacultyAction,
  resetFacultyAction,
  statusFacultyAction,
} from "./actions";

export const dynamic = "force-dynamic";
export default async function FacultyPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const actor = await getCurrentActor();
  if (!actor) redirect("/login");
  if (actor.role !== "ADMIN") redirect("/dashboard");
  requireRole(actor, "ADMIN");
  const params = await searchParams;
  const status =
    params.status === "ACTIVE" || params.status === "SUSPENDED" || params.status === "DELETED"
      ? params.status
      : undefined;
  const page = Math.max(1, Number(params.page) || 1);
  const [result, departments] = await Promise.all([
    listFaculty(actor, params.q ?? "", status, page),
    listDepartments(actor, true),
  ]);
  const faculty = result.items;
  return (
    <AppShell actor={actor} title="Faculty Management">
      <section className="workspace-page">
        <div className="page-heading">
          <div>
            <span className="eyebrow">Administration</span>
            <h1>Faculty Management</h1>
            <p>Create accounts, maintain faculty details, and control access.</p>
          </div>
        </div>
        {params.notice && (
          <p className="notice" role="status">
            {params.notice.startsWith("department-")
              ? `Department ${params.notice.replace("department-", "")} successfully.`
              : `Faculty account ${params.notice} successfully.`}
          </p>
        )}
        <details className="panel">
          <summary className="panel-summary">Manage Departments</summary>
          <form action={createDepartmentAction} className="inline-actions department-create">
            <label className="field">
              Department Name
              <input name="name" required minLength={2} />
            </label>
            <button className="primary-button form-submit">Add Department</button>
          </form>
          <div className="department-list">
            {departments.map((department) => (
              <div className="department-row" key={department.id}>
                <form action={renameDepartmentAction} className="inline-actions">
                  <input type="hidden" name="departmentId" value={department.id} />
                  <label className="field">
                    <span className="sr-only">Rename {department.name}</span>
                    <input name="name" defaultValue={department.name} required minLength={2} />
                  </label>
                  <button className="secondary-button">Rename</button>
                </form>
                <span className={`status ${department.status.toLowerCase()}`}>
                  {department.status}
                </span>
                <form action={statusDepartmentAction}>
                  <input type="hidden" name="departmentId" value={department.id} />
                  <input
                    type="hidden"
                    name="status"
                    value={department.status === "ACTIVE" ? "ARCHIVED" : "ACTIVE"}
                  />
                  <button
                    className={
                      department.status === "ACTIVE" ? "danger-button" : "secondary-button"
                    }
                  >
                    {department.status === "ACTIVE" ? "Archive" : "Reopen"}
                  </button>
                </form>
              </div>
            ))}
            {!departments.length && <p className="muted">No departments have been added yet.</p>}
          </div>
        </details>
        <details className="panel">
          <summary className="panel-summary">Create Faculty Account</summary>
          <form action={createFacultyAction} className="form-grid">
            <label className="field">
              Full Name
              <input name="name" required minLength={2} />
            </label>
            <label className="field">
              Email
              <input name="email" type="email" required />
            </label>
            <label className="field">
              Employee ID
              <input name="employeeId" />
            </label>
            <label className="field">
              Temporary Password
              <input name="temporaryPassword" type="password" required minLength={14} />
            </label>
            <label className="field">
              Department
              <DepartmentSelect departments={departments} />
            </label>
            <label className="field">
              Title
              <input name="title" />
            </label>
            <button className="primary-button form-submit">Create Faculty</button>
          </form>
        </details>
        <form className="filters">
          <input
            name="q"
            defaultValue={params.q}
            placeholder="Search name, email, or employee ID"
          />
          <select name="status" defaultValue={status ?? ""}>
            <option value="">All Statuses</option>
            <option>ACTIVE</option>
            <option>SUSPENDED</option>
            <option>DELETED</option>
          </select>
          <button className="secondary-button">Filter</button>
        </form>
        <div className="record-list">
          {faculty.map((item) => (
            <details className="record" key={item.id}>
              <summary>
                <span>
                  <strong>{item.name}</strong>
                  <small>
                    {item.email} · {item.facultyProfile?.employeeId || "No employee ID"}
                  </small>
                </span>
                <span className={`status ${item.status.toLowerCase()}`}>
                  {item.status.charAt(0) + item.status.slice(1).toLowerCase()}
                </span>
              </summary>
              <div className="record-body">
                {item.status === "DELETED" ? (
                  <p className="muted">
                    Deleted {item.deletedAt?.toLocaleString("en-PH")}. Related classes and
                    historical records remain preserved.
                  </p>
                ) : (
                  <>
                    <form action={editFacultyAction} className="form-grid">
                      <input type="hidden" name="userId" value={item.id} />
                      <label className="field">
                        Full Name
                        <input name="name" defaultValue={item.name} required />
                      </label>
                      <label className="field">
                        Employee ID
                        <input
                          name="employeeId"
                          defaultValue={item.facultyProfile?.employeeId ?? ""}
                        />
                      </label>
                      <label className="field">
                        Department
                        <DepartmentSelect
                          departments={departments}
                          currentDepartmentId={item.facultyProfile?.departmentId}
                        />
                      </label>
                      <label className="field">
                        Title
                        <input name="title" defaultValue={item.facultyProfile?.title ?? ""} />
                      </label>
                      <label className="field full">
                        Bio
                        <input name="bio" defaultValue={item.facultyProfile?.bio ?? ""} />
                      </label>
                      <button className="secondary-button">Save Details</button>
                    </form>
                    <div className="inline-actions">
                      <form action={statusFacultyAction}>
                        <input type="hidden" name="userId" value={item.id} />
                        <input
                          type="hidden"
                          name="status"
                          value={item.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE"}
                        />
                        <button
                          className={
                            item.status === "ACTIVE" ? "danger-button" : "secondary-button"
                          }
                        >
                          {item.status === "ACTIVE" ? "Suspend" : "Activate"}
                        </button>
                      </form>
                      <form action={resetFacultyAction} className="reset-form">
                        <input type="hidden" name="userId" value={item.id} />
                        <input
                          name="temporaryPassword"
                          type="password"
                          minLength={14}
                          required
                          placeholder="New temporary password"
                        />
                        <button className="secondary-button">Reset Access</button>
                      </form>
                      <DeleteFacultyControl
                        userId={item.id}
                        facultyName={item.name}
                        action={deleteFacultyAction}
                      />
                    </div>
                  </>
                )}
              </div>
            </details>
          ))}
          {!faculty.length && (
            <div className="empty-state">No faculty accounts match these filters.</div>
          )}
        </div>
        <nav className="pagination" aria-label="Faculty pages">
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
