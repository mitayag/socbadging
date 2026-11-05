import { redirect } from "next/navigation";

import { AppShell } from "@/components/layout/app-shell";
import { StudentRowActions } from "@/components/student/student-row-actions";
import { DataTable } from "@/components/ui/data-table";
import { getCurrentActor } from "@/modules/identity/services/current-actor";
import {
  listStudentAccounts,
  studentAccountPageSizes,
  type StudentAccountListStatus,
  type StudentAccountPageSize,
  type StudentAccountSort,
} from "@/modules/student/services/student-account-service";
import {
  createStudentAction,
  deleteStudentAction,
  editStudentAction,
  inviteStudentAction,
  resendStudentInvitationAction,
  setStudentStatusAction,
} from "./actions";
import {
  directStudentPasswordResetAction,
  sendStudentPasswordResetLinkAction,
} from "./password-actions";

export const dynamic = "force-dynamic";

const statusLabels: Record<StudentAccountListStatus, string> = {
  NOT_ACTIVATED: "Not Activated",
  INVITED: "Invited",
  ACTIVE: "Active",
  SUSPENDED: "Suspended",
  DEACTIVATED: "Deactivated",
};

const noticeMessages: Record<string, string> = {
  created: "Student record created successfully.",
  "created-invited": "Student record created and activation email sent.",
  "created-invite-pending":
    "Student record created, but the activation email could not be sent. Resend the invitation later.",
  updated: "Student details updated successfully.",
  deleted: "Student portal account deleted. The student record and issued badges were preserved.",
  invited: "Student activation email sent.",
  resent: "Student invitation resent.",
  reactivated: "Student portal account reactivated.",
  suspended: "Student portal account suspended.",
  "password-reset": "Student password reset. They must choose a new password at next sign-in.",
  "reset-link-sent":
    "Password reset link requested. Delivery is not confirmed until the mail provider accepts it.",
  "reset-link-created-email-unavailable":
    "Reset link created, but email delivery is unavailable. Try resending later.",
  "rate-limited": "Too many account email requests. Try again later.",
  "email-unavailable": "Email delivery is unavailable. The invitation was created; resend later.",
  "account-error": "The student account action could not be completed.",
};

const returnKeys = ["q", "status", "sort", "page", "pageSize"] as const;

function parseStatus(value: string | undefined): StudentAccountListStatus | undefined {
  return value === "NOT_ACTIVATED" ||
    value === "INVITED" ||
    value === "ACTIVE" ||
    value === "SUSPENDED" ||
    value === "DEACTIVATED"
    ? value
    : undefined;
}

function parseSort(value: string | undefined): StudentAccountSort {
  return value === "studentNumber" || value === "status" ? value : "name";
}

function parsePageSize(value: string | undefined): StudentAccountPageSize {
  const parsed = Number(value);
  return studentAccountPageSizes.includes(parsed as StudentAccountPageSize)
    ? (parsed as StudentAccountPageSize)
    : 5;
}

function portalStatus(student: {
  accountStatus: "NOT_ACTIVATED" | "INVITED" | "ACTIVE" | "INACTIVE" | "SUSPENDED" | "DELETED";
}) {
  if (student.accountStatus === "INACTIVE" || student.accountStatus === "DELETED") {
    return { label: "Deactivated", tone: "deleted" };
  }
  return {
    label: statusLabels[student.accountStatus],
    tone: student.accountStatus.toLowerCase(),
  };
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

export default async function StudentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const actor = await getCurrentActor();
  if (!actor) redirect("/login");
  if (actor.role !== "ADMIN") redirect("/dashboard");
  const params = await searchParams;
  const status = parseStatus(params.status);
  const sort = parseSort(params.sort);
  const pageSize = parsePageSize(params.pageSize);
  const page = Math.max(1, Number(params.page) || 1);
  const result = await listStudentAccounts(actor, {
    query: params.q ?? "",
    status,
    sort,
    page,
    pageSize,
  });
  const query = {
    q: params.q ?? "",
    status: status ?? "",
    sort,
    page: String(result.page),
    pageSize: String(result.pageSize),
  };
  const actionQuery = Object.fromEntries(Object.entries(query).filter(([, value]) => value !== ""));
  const hasFilters = Boolean(params.q || status || params.sort || params.pageSize);
  const notice = params.notice ? noticeMessages[params.notice] : null;
  const pageHref = (nextPage: number) => {
    const next = new URLSearchParams();
    if (params.q) next.set("q", params.q);
    if (status) next.set("status", status);
    next.set("sort", sort);
    next.set("pageSize", String(result.pageSize));
    next.set("page", String(nextPage));
    return `/students?${next.toString()}`;
  };

  return (
    <AppShell actor={actor} title="Student Accounts">
      <section className="workspace-page">
        <div className="page-heading">
          <span className="eyebrow">Administration</span>
          <h1>Student Accounts</h1>
          <p>Manage student records, portal access, and activation invitations.</p>
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
          <summary className="panel-summary">Add Student</summary>
          <form action={createStudentAction} className="form-grid">
            <HiddenQuery params={params} />
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
            <label className="field full checkbox-field">
              <input name="sendInvitation" type="checkbox" />
              <span>Send activation email after creating</span>
            </label>
            <button className="primary-button form-submit">Create Student</button>
          </form>
        </details>

        <DataTable
          caption="Student accounts"
          columns={[
            { key: "number", header: "Student Number", render: (student) => student.studentNumber },
            {
              key: "name",
              header: "Full Name",
              render: (student) => (
                <span className="faculty-name">
                  {student.firstName} {student.lastName}
                </span>
              ),
            },
            {
              key: "email",
              header: "Email",
              render: (student) => <span className="faculty-email">{student.email}</span>,
            },
            {
              key: "status",
              header: "Portal Status",
              render: (student) => {
                const portal = portalStatus(student);
                return <span className={`status ${portal.tone}`}>{portal.label}</span>;
              },
            },
            {
              key: "actions",
              header: "Actions",
              className: "faculty-actions-cell",
              render: (student) => (
                <StudentRowActions
                  actions={{
                    edit: editStudentAction,
                    status: setStudentStatusAction,
                    delete: deleteStudentAction,
                    invite: inviteStudentAction,
                    resend: resendStudentInvitationAction,
                    resetPassword: directStudentPasswordResetAction,
                    sendResetLink: sendStudentPasswordResetLinkAction,
                  }}
                  editOpen={params.edit === student.studentId}
                  query={actionQuery}
                  student={{
                    studentId: student.studentId,
                    studentNumber: student.studentNumber,
                    firstName: student.firstName,
                    lastName: student.lastName,
                    email: student.email,
                    accountStatus: student.accountStatus,
                  }}
                />
              ),
            },
          ]}
          emptyMessage="No student records match these filters."
          label="Student accounts"
          nextHref={result.hasNext ? pageHref(result.page + 1) : undefined}
          pagination={{
            page: result.page,
            pageSize: result.pageSize,
            total: result.total,
            totalPages: result.totalPages,
            hasNext: result.hasNext,
            hasPrevious: result.hasPrevious,
          }}
          previousHref={result.hasPrevious ? pageHref(result.page - 1) : undefined}
          recordLabel="student"
          rows={result.items}
          rowKey={(student) => student.studentId}
          tableClassName="student-table"
          toolbar={
            <form className="filters faculty-toolbar" role="search">
              <input
                aria-label="Search students"
                defaultValue={params.q}
                name="q"
                placeholder="Search student number, name, or email"
              />
              <select aria-label="Portal status" defaultValue={status ?? ""} name="status">
                <option value="">All Statuses</option>
                <option value="NOT_ACTIVATED">Not Activated</option>
                <option value="INVITED">Invited</option>
                <option value="ACTIVE">Active</option>
                <option value="SUSPENDED">Suspended</option>
                <option value="DEACTIVATED">Deactivated</option>
              </select>
              <select aria-label="Sort by" defaultValue={sort} name="sort">
                <option value="name">Name</option>
                <option value="studentNumber">Student Number</option>
                <option value="status">Status</option>
              </select>
              <select aria-label="Rows per page" defaultValue={String(pageSize)} name="pageSize">
                {studentAccountPageSizes.map((size) => (
                  <option key={size} value={size}>
                    {size} per page
                  </option>
                ))}
              </select>
              <button className="secondary-button">Apply</button>
              {hasFilters ? (
                <a className="text-button" href="/students">
                  Reset
                </a>
              ) : null}
            </form>
          }
        />

        <p className="muted faculty-footnote">
          Deleting a portal account deactivates sign-in only. Student records, class assignments,
          and issued badges are preserved.
        </p>
      </section>
    </AppShell>
  );
}
