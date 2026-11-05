import Link from "next/link";
import { redirect } from "next/navigation";

import { AppShell } from "@/components/layout/app-shell";
import { getClassTabs } from "@/components/layout/navigation";
import { ImportWizard } from "@/components/rosters/import-wizard";
import { RosterRowActions } from "@/components/rosters/roster-row-actions";
import { DataTable } from "@/components/ui/data-table";
import { getCurrentActor } from "@/modules/identity/services/current-actor";
import {
  getClassWorkspace,
  listRoster,
  rosterPageSizes,
  type RosterPageSize,
  type RosterSort,
} from "@/modules/rosters/services/roster-service";
import {
  addStudentAction,
  commitImportAction,
  editStudentAction,
  enrollmentAction,
} from "./actions";
import {
  directStudentPasswordResetAction,
  sendStudentPasswordResetLinkAction,
} from "@/app/students/password-actions";

export const dynamic = "force-dynamic";

function parseSort(value: string | undefined): RosterSort {
  return value === "studentNumber" || value === "status" ? value : "name";
}

function parsePageSize(value: string | undefined): RosterPageSize {
  const parsed = Number(value);
  return rosterPageSizes.includes(parsed as RosterPageSize) ? (parsed as RosterPageSize) : 5;
}

export default async function StudentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ classId: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const actor = await getCurrentActor();
  if (!actor) redirect("/login");
  if (actor.role === "STUDENT") redirect("/student");
  const classId = (await params).classId;
  const query = await searchParams;
  const status = query.status === "ACTIVE" || query.status === "REMOVED" ? query.status : undefined;
  const sort = parseSort(query.sort);
  const pageSize = parsePageSize(query.pageSize);
  const page = Math.max(1, Number(query.page) || 1);
  const [item, roster] = await Promise.all([
    getClassWorkspace(actor, classId),
    listRoster(actor, classId, query.q ?? "", status, page, { pageSize, sort }),
  ]);
  const canManage = actor.role === "FACULTY";
  const hasFilters = Boolean(query.q || status || query.sort || query.pageSize);
  const actionQuery = Object.fromEntries(
    Object.entries({
      q: query.q ?? "",
      status: status ?? "",
      sort,
      page: String(roster.page),
      pageSize: String(roster.pageSize),
    }).filter(([, value]) => value !== ""),
  );
  const noticeMessages: Record<string, string> = {
    added: "Roster student added successfully.",
    updated: "Roster student updated successfully.",
    removed: "Roster student removed successfully.",
    restored: "Roster enrollment restored successfully.",
    imported: "Roster imported successfully.",
    "password-reset": "Student password reset. They must choose a new password at next sign-in.",
    "reset-link-sent":
      "Password reset link requested. Delivery is not confirmed until the mail provider accepts it.",
    "reset-link-created-email-unavailable":
      "Reset link created, but email delivery is unavailable. Try resending later.",
    "rate-limited": "Too many reset requests. Try again later.",
  };
  const notice = query.notice
    ? (noticeMessages[query.notice] ?? `Roster ${query.notice} successfully.`)
    : null;
  const pageHref = (nextPage: number) => {
    const next = new URLSearchParams();
    if (query.q) next.set("q", query.q);
    if (status) next.set("status", status);
    next.set("sort", sort);
    next.set("pageSize", String(roster.pageSize));
    next.set("page", String(nextPage));
    return `/classes/${encodeURIComponent(classId)}/students?${next.toString()}`;
  };

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
        {query.error ? (
          <p className="form-error" role="alert">
            {query.error}
          </p>
        ) : null}
        {notice ? (
          <p className="notice" role="status">
            {notice}
          </p>
        ) : null}
        {canManage ? (
          <>
            <details className="panel">
              <summary className="panel-summary">Add One Student</summary>
              <form action={addStudentAction} className="form-grid">
                <input name="classId" type="hidden" value={classId} />
                <label className="field">
                  Student Number
                  <input maxLength={100} name="studentNumber" required />
                </label>
                <label className="field">
                  First Name
                  <input maxLength={191} name="firstName" required />
                </label>
                <label className="field">
                  Last Name
                  <input maxLength={191} name="lastName" required />
                </label>
                <label className="field">
                  Email
                  <input name="email" required type="email" />
                </label>
                <button className="primary-button form-submit">Add Student</button>
              </form>
            </details>
            <details className="panel">
              <summary className="panel-summary">Import CSV or XLSX</summary>
              <ImportWizard classId={classId} commitAction={commitImportAction} />
            </details>
          </>
        ) : null}

        <DataTable
          caption="Class roster"
          columns={[
            { key: "number", header: "Student Number", render: (row) => row.student.studentNumber },
            {
              key: "name",
              header: "Full Name",
              render: (row) => (
                <span className="faculty-name">
                  {row.student.lastName}, {row.student.firstName}
                </span>
              ),
            },
            {
              key: "email",
              header: "Email",
              render: (row) => <span className="faculty-email">{row.student.email}</span>,
            },
            {
              key: "status",
              header: "Enrollment Status",
              render: (row) => (
                <span className={`status ${row.enrollmentStatus.toLowerCase()}`}>
                  {row.enrollmentStatus}
                </span>
              ),
            },
            {
              key: "actions",
              header: "Actions",
              className: "faculty-actions-cell",
              render: (row) => (
                <RosterRowActions
                  actions={{
                    edit: editStudentAction,
                    status: enrollmentAction,
                    resetPassword: directStudentPasswordResetAction,
                    sendResetLink: sendStudentPasswordResetLinkAction,
                  }}
                  canManage={canManage}
                  canResetPassword={row.student.account?.user.status === "ACTIVE"}
                  classId={classId}
                  enrollmentStatus={row.enrollmentStatus}
                  query={actionQuery}
                  student={{
                    id: row.student.id,
                    studentNumber: row.student.studentNumber,
                    firstName: row.student.firstName,
                    lastName: row.student.lastName,
                    email: row.student.email,
                  }}
                />
              ),
            },
          ]}
          emptyMessage="No students match these filters."
          label="Class roster"
          nextHref={roster.hasNext ? pageHref(roster.page + 1) : undefined}
          pagination={{
            page: roster.page,
            pageSize: roster.pageSize,
            total: roster.total,
            totalPages: roster.pageCount,
            hasNext: roster.hasNext,
            hasPrevious: roster.hasPrevious,
          }}
          previousHref={roster.hasPrevious ? pageHref(roster.page - 1) : undefined}
          recordLabel="student"
          rows={roster.items}
          rowKey={(row) => row.student.id}
          tableClassName="roster-table"
          toolbar={
            <form className="filters faculty-toolbar" role="search">
              <input
                aria-label="Search roster"
                defaultValue={query.q}
                name="q"
                placeholder="Search student number, name, or email"
              />
              <select aria-label="Enrollment status" defaultValue={status ?? ""} name="status">
                <option value="">All Enrollments</option>
                <option value="ACTIVE">Active</option>
                <option value="REMOVED">Removed</option>
              </select>
              <select aria-label="Sort by" defaultValue={sort} name="sort">
                <option value="name">Name</option>
                <option value="studentNumber">Student Number</option>
                <option value="status">Status</option>
              </select>
              <select aria-label="Rows per page" defaultValue={String(pageSize)} name="pageSize">
                {rosterPageSizes.map((size) => (
                  <option key={size} value={size}>
                    {size} per page
                  </option>
                ))}
              </select>
              <button className="secondary-button">Apply</button>
              <a
                className="secondary-button export-link"
                href={`/api/classes/${classId}/roster/export`}
              >
                Export CSV
              </a>
              {hasFilters ? (
                <a className="text-button" href={`/classes/${classId}/students`}>
                  Reset
                </a>
              ) : null}
            </form>
          }
        />
      </section>
    </AppShell>
  );
}
