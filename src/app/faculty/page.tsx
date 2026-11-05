import { redirect } from "next/navigation";

import { AppShell } from "@/components/layout/app-shell";
import { DepartmentSelect } from "@/components/faculty/department-select";
import { FacultyRowActions } from "@/components/faculty/faculty-row-actions";
import { DataTable } from "@/components/ui/data-table";
import { requireRole } from "@/modules/identity/policies/authorization";
import { getCurrentActor } from "@/modules/identity/services/current-actor";
import {
  facultyPageSizes,
  listFaculty,
  type FacultyListSort,
  type FacultyListStatus,
  type FacultyPageSize,
} from "@/modules/faculty/services/faculty-service";
import { listDepartments } from "@/modules/departments/services/department-service";
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

const statusLabels: Record<FacultyListStatus, string> = {
  ACTIVE: "Active",
  INACTIVE: "Inactive",
  SUSPENDED: "Suspended",
  DELETED: "Deleted",
};

const noticeMessages: Record<string, string> = {
  created: "Faculty account created successfully.",
  updated: "Faculty account updated successfully.",
  deleted: "Faculty account deleted. Historical records were preserved.",
  activated: "Faculty account activated.",
  deactivated: "Faculty account deactivated.",
  suspended: "Faculty account suspended.",
  "access-reset": "Faculty access was reset successfully.",
};

const returnKeys = ["q", "status", "sort", "page", "pageSize"] as const;

function parseStatus(value: string | undefined): FacultyListStatus | undefined {
  return value === "ACTIVE" || value === "INACTIVE" || value === "SUSPENDED" ? value : undefined;
}

function parseSort(value: string | undefined): FacultyListSort {
  return value === "employeeId" || value === "status" ? value : "name";
}

function parsePageSize(value: string | undefined): FacultyPageSize {
  const parsed = Number(value);
  return facultyPageSizes.includes(parsed as FacultyPageSize) ? (parsed as FacultyPageSize) : 10;
}

function HiddenQuery({ params }: { params: Record<string, string | undefined> }) {
  return (
    <>
      {returnKeys.map((key) =>
        params[key] ? <input key={key} name={key} type="hidden" value={params[key]} /> : null,
      )}
    </>
  );
}

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
  const status = parseStatus(params.status);
  const sort = parseSort(params.sort);
  const pageSize = parsePageSize(params.pageSize);
  const page = Math.max(1, Number(params.page) || 1);
  const [result, departments] = await Promise.all([
    listFaculty(actor, params.q ?? "", status, page, { sort, pageSize }),
    listDepartments(actor, true),
  ]);
  const faculty = result.items;
  const query = {
    q: params.q ?? "",
    status: status ?? "",
    sort,
    page: String(result.page),
    pageSize: String(result.pageSize),
  };
  const actionQuery = Object.fromEntries(Object.entries(query).filter(([, value]) => value !== ""));
  const pageHref = (nextPage: number) => {
    const next = new URLSearchParams();
    if (params.q) next.set("q", params.q);
    if (status) next.set("status", status);
    next.set("sort", sort);
    next.set("pageSize", String(result.pageSize));
    next.set("page", String(nextPage));
    return `/faculty?${next.toString()}`;
  };
  const hasFilters = Boolean(params.q || status || params.sort || params.pageSize);
  const notice = params.notice
    ? params.notice.startsWith("department-")
      ? `Department ${params.notice.replace("department-", "")} successfully.`
      : noticeMessages[params.notice]
    : null;

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
        {params.error ? (
          <p className="form-error" role="alert">
            {params.error}
          </p>
        ) : null}
        {notice ? (
          <p className="notice" role="status">
            {notice}
          </p>
        ) : null}

        <details className="panel" open={params.create === "1" ? true : undefined}>
          <summary className="panel-summary">Create Faculty Account</summary>
          <form action={createFacultyAction} className="form-grid">
            <HiddenQuery params={params} />
            <label className="field">
              Full Name
              <input maxLength={191} minLength={2} name="name" required />
            </label>
            <label className="field">
              Email
              <input name="email" required type="email" />
            </label>
            <label className="field">
              Employee ID
              <input maxLength={100} name="employeeId" />
            </label>
            <label className="field">
              Temporary Password
              <input
                autoComplete="new-password"
                maxLength={200}
                minLength={14}
                name="temporaryPassword"
                required
                type="password"
              />
            </label>
            <label className="field">
              Department
              <DepartmentSelect departments={departments} />
            </label>
            <label className="field">
              Title
              <input maxLength={191} name="title" />
            </label>
            <button className="primary-button form-submit">Create Faculty</button>
          </form>
        </details>

        <details className="panel">
          <summary className="panel-summary">Manage Departments</summary>
          <form action={createDepartmentAction} className="inline-actions department-create">
            <label className="field">
              Department Name
              <input minLength={2} name="name" required />
            </label>
            <button className="primary-button form-submit">Add Department</button>
          </form>
          <div className="department-list">
            {departments.map((department) => (
              <div className="department-row" key={department.id}>
                <form action={renameDepartmentAction} className="inline-actions">
                  <input name="departmentId" type="hidden" value={department.id} />
                  <label className="field">
                    <span className="sr-only">Rename {department.name}</span>
                    <input defaultValue={department.name} minLength={2} name="name" required />
                  </label>
                  <button className="secondary-button">Rename</button>
                </form>
                <span className={`status ${department.status.toLowerCase()}`}>
                  {department.status}
                </span>
                <form action={statusDepartmentAction}>
                  <input name="departmentId" type="hidden" value={department.id} />
                  <input
                    name="status"
                    type="hidden"
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

        <DataTable
          caption="Faculty accounts"
          columns={[
            {
              key: "name",
              header: "Full Name",
              render: (item) => <span className="faculty-name">{item.name}</span>,
            },
            {
              key: "email",
              header: "Email",
              render: (item) => <span className="faculty-email">{item.email}</span>,
            },
            {
              key: "employeeId",
              header: "Employee ID",
              render: (item) => item.facultyProfile?.employeeId || <span className="muted">—</span>,
            },
            {
              key: "department",
              header: "Department",
              render: (item) =>
                item.facultyProfile?.department?.name || <span className="muted">—</span>,
            },
            {
              key: "title",
              header: "Title",
              render: (item) => item.facultyProfile?.title || <span className="muted">—</span>,
            },
            {
              key: "status",
              header: "Account Status",
              render: (item) => (
                <span className={`status ${item.status.toLowerCase()}`}>
                  {statusLabels[item.status]}
                </span>
              ),
            },
            {
              key: "actions",
              header: "Actions",
              className: "faculty-actions-cell",
              render: (item) =>
                item.status === "DELETED" ? (
                  <span className="muted">Removed</span>
                ) : (
                  <FacultyRowActions
                    actions={{
                      edit: editFacultyAction,
                      status: statusFacultyAction,
                      reset: resetFacultyAction,
                      delete: deleteFacultyAction,
                    }}
                    departments={departments}
                    editOpen={params.edit === item.id}
                    faculty={{
                      id: item.id,
                      name: item.name,
                      email: item.email,
                      employeeId: item.facultyProfile?.employeeId ?? null,
                      departmentId: item.facultyProfile?.departmentId ?? null,
                      title: item.facultyProfile?.title ?? null,
                      bio: item.facultyProfile?.bio ?? null,
                      status: item.status,
                    }}
                    query={actionQuery}
                  />
                ),
            },
          ]}
          emptyMessage="No faculty accounts match these filters."
          label="Faculty accounts"
          nextHref={result.hasNext ? pageHref(result.page + 1) : undefined}
          pagination={{
            page: result.page,
            pageSize: result.pageSize,
            total: result.total,
            totalPages: result.pageCount,
            hasNext: result.hasNext,
            hasPrevious: result.hasPrevious,
          }}
          previousHref={result.hasPrevious ? pageHref(result.page - 1) : undefined}
          recordLabel="faculty account"
          rows={faculty}
          rowKey={(item) => item.id}
          toolbar={
            <form className="filters faculty-toolbar" role="search">
              <input
                aria-label="Search faculty"
                defaultValue={params.q}
                name="q"
                placeholder="Search name, email, or employee ID"
              />
              <select aria-label="Account status" defaultValue={status ?? ""} name="status">
                <option value="">All Statuses</option>
                <option value="ACTIVE">Active</option>
                <option value="INACTIVE">Inactive</option>
                <option value="SUSPENDED">Suspended</option>
              </select>
              <select aria-label="Sort by" defaultValue={sort} name="sort">
                <option value="name">Name</option>
                <option value="employeeId">Employee ID</option>
                <option value="status">Status</option>
              </select>
              <select aria-label="Rows per page" defaultValue={String(pageSize)} name="pageSize">
                {facultyPageSizes.map((size) => (
                  <option key={size} value={size}>
                    {size} per page
                  </option>
                ))}
              </select>
              <button className="secondary-button">Apply</button>
              {hasFilters ? (
                <a className="text-button" href="/faculty">
                  Reset
                </a>
              ) : null}
            </form>
          }
        />

        <p className="muted faculty-footnote">
          Deleted faculty accounts are retained for audit and credential history and are hidden from
          this table.
        </p>
      </section>
    </AppShell>
  );
}
