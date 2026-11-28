import Link from "next/link";
import { redirect } from "next/navigation";

import { AppShell } from "@/components/layout/app-shell";
import { BadgeVersionFields } from "@/components/library/badge-version-fields";
import { DataTable } from "@/components/ui/data-table";
import {
  badgeLibraryPageSizes,
  getLibrarySummary,
  listBadgeDefinitions,
  type BadgeLibraryPageSize,
  type BadgeLibraryScope,
  type BadgeLibrarySort,
} from "@/modules/badge-library/services/badge-library-service";
import { listCourseOptions } from "@/modules/catalog/services/course-service";
import { getCurrentActor } from "@/modules/identity/services/current-actor";
import { createBadgeDefinitionAction } from "./actions";

export const dynamic = "force-dynamic";

const noticeMessages: Record<string, string> = {
  created: "Badge definition created.",
  submitted: "Badge proposal submitted for approval.",
  reviewed: "Approval decision recorded.",
  archived: "Badge definition archived.",
  "version-created": "New badge version created.",
  assigned: "Badge assigned to the class.",
};

const statusLabels: Record<string, string> = {
  DRAFT: "Draft",
  PENDING_APPROVAL: "Pending Approval",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  ARCHIVED: "Archived",
};

function parseScope(value: string | undefined, isAdmin: boolean): BadgeLibraryScope {
  if (value === "mine") return "mine";
  if (value === "queue" && isAdmin) return "queue";
  return "library";
}

function parseSort(value: string | undefined): BadgeLibrarySort {
  return value === "name" || value === "course" || value === "status" ? value : "updated";
}

function parsePageSize(value: string | undefined): BadgeLibraryPageSize {
  const parsed = Number(value);
  return badgeLibraryPageSizes.includes(parsed as BadgeLibraryPageSize)
    ? (parsed as BadgeLibraryPageSize)
    : 10;
}

function parseStatus(
  value: string | undefined,
): "DRAFT" | "PENDING_APPROVAL" | "APPROVED" | "REJECTED" | "ARCHIVED" | undefined {
  return value === "DRAFT" ||
    value === "PENDING_APPROVAL" ||
    value === "APPROVED" ||
    value === "REJECTED" ||
    value === "ARCHIVED"
    ? value
    : undefined;
}

export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const actor = await getCurrentActor();
  if (!actor) redirect("/login");
  if (actor.role === "STUDENT") redirect("/student");
  const params = await searchParams;
  const isAdmin = actor.role === "ADMIN";
  const scope = parseScope(params.scope, isAdmin);
  const status = parseStatus(params.status);
  const sort = parseSort(params.sort);
  const pageSize = parsePageSize(params.pageSize);
  const page = Math.max(1, Number(params.page) || 1);
  const [result, courses, summary] = await Promise.all([
    listBadgeDefinitions(actor, {
      query: params.q ?? "",
      courseId: params.courseId || undefined,
      status,
      scope,
      sort,
      page,
      pageSize,
    }),
    listCourseOptions(actor),
    getLibrarySummary(actor),
  ]);
  const pageHref = (nextPage: number) => {
    const next = new URLSearchParams();
    if (params.q) next.set("q", params.q);
    if (params.courseId) next.set("courseId", params.courseId);
    if (status) next.set("status", status);
    next.set("scope", scope);
    next.set("sort", sort);
    next.set("pageSize", String(result.pageSize));
    next.set("page", String(nextPage));
    return `/library?${next.toString()}`;
  };
  const heading =
    scope === "queue"
      ? "Badge Approval Queue"
      : scope === "mine"
        ? "My Badge Proposals"
        : "Shared Badge Library";

  return (
    <AppShell actor={actor} title="Badge Library">
      <section className="workspace-page">
        <div className="page-heading">
          <div>
            <span className="eyebrow">Centralized Badge Management</span>
            <h1>{heading}</h1>
            <p>
              {isAdmin
                ? "Create and govern institutional badge definitions, review faculty proposals and manage versions."
                : "Browse approved badges, submit proposals and assign approved badges to your classes."}
            </p>
          </div>
        </div>
        {params.notice && noticeMessages[params.notice] ? (
          <p className="notice" role="status">
            {noticeMessages[params.notice]}
          </p>
        ) : null}
        {params.error ? (
          <p className="notice error" role="alert">
            {params.error}
          </p>
        ) : null}

        <nav aria-label="Badge library views" className="class-tabs">
          <Link
            className={scope === "library" ? "active" : undefined}
            href="/library?scope=library"
          >
            Shared Library ({summary.approved})
          </Link>
          <Link className={scope === "mine" ? "active" : undefined} href="/library?scope=mine">
            My Proposals ({summary.drafts + summary.rejected})
          </Link>
          {isAdmin ? (
            <Link className={scope === "queue" ? "active" : undefined} href="/library?scope=queue">
              Approval Queue ({summary.queue})
            </Link>
          ) : null}
        </nav>

        {courses.length ? (
          <details className="panel">
            <summary className="panel-summary">
              {isAdmin ? "Create Badge Definition" : "Propose a Badge"}
            </summary>
            <form action={createBadgeDefinitionAction} className="form-grid">
              <BadgeVersionFields courses={courses} requireImage />
              <button className="primary-button form-submit">
                {isAdmin ? "Create Badge" : "Create Proposal"}
              </button>
            </form>
          </details>
        ) : (
          <p className="notice">
            No active courses exist yet. An administrator must add a course to the catalog before
            badges can be proposed.
          </p>
        )}

        <form className="filters">
          <input name="q" defaultValue={params.q} placeholder="Search badge or course" />
          <select name="courseId" defaultValue={params.courseId ?? ""}>
            <option value="">All Courses</option>
            {courses.map((course) => (
              <option key={course.id} value={course.id}>
                {course.code}
              </option>
            ))}
          </select>
          <select name="status" defaultValue={status ?? ""}>
            <option value="">All Statuses</option>
            {Object.entries(statusLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <select name="sort" defaultValue={sort}>
            <option value="updated">Sort: Recently Updated</option>
            <option value="name">Sort: Name</option>
            <option value="course">Sort: Course</option>
            <option value="status">Sort: Status</option>
          </select>
          <select name="pageSize" defaultValue={String(pageSize)}>
            {badgeLibraryPageSizes.map((size) => (
              <option key={size} value={size}>
                {size} per page
              </option>
            ))}
          </select>
          <input name="scope" type="hidden" value={scope} />
          <button className="secondary-button">Filter</button>
        </form>

        <DataTable
          caption="Centralized badge library"
          columns={[
            {
              key: "name",
              header: "Badge",
              render: (row) => (
                <div>
                  <strong>{row.name}</strong>
                  <p className="muted">
                    {row.latestApproved
                      ? `Approved v${row.latestApproved.version}`
                      : row.latestVersion
                        ? `v${row.latestVersion.version} · ${statusLabels[row.latestVersion.status]}`
                        : "No versions"}
                  </p>
                </div>
              ),
            },
            {
              key: "course",
              header: "Course",
              render: (row) => (
                <span>
                  <strong>{row.course.code}</strong>
                  <br />
                  <span className="muted">{row.course.title}</span>
                </span>
              ),
            },
            {
              key: "status",
              header: "Status",
              render: (row) => (
                <span className={`status ${row.status.toLowerCase()}`}>
                  {statusLabels[row.status] ?? row.status}
                </span>
              ),
            },
            {
              key: "pending",
              header: "Pending",
              render: (row) =>
                row.pendingVersions.length ? (
                  <span className="status pending_approval">
                    {row.pendingVersions.length} version(s)
                  </span>
                ) : (
                  <span className="muted">—</span>
                ),
            },
            {
              key: "usage",
              header: "Assignments",
              render: (row) => row._count.assignments,
            },
            {
              key: "creator",
              header: "Creator",
              render: (row) => row.createdBy.name,
            },
            {
              key: "actions",
              header: "Actions",
              render: (row) => (
                <Link className="secondary-button" href={`/library/${row.id}`}>
                  {isAdmin && row.pendingVersions.length ? "Review" : "Open"}
                </Link>
              ),
            },
          ]}
          emptyMessage="No badge definitions match these filters."
          label="Badge library"
          nextHref={result.hasNext ? pageHref(result.page + 1) : undefined}
          pagination={{ ...result, totalPages: result.pageCount }}
          previousHref={result.hasPrevious ? pageHref(result.page - 1) : undefined}
          recordLabel="badge"
          rowKey={(row) => row.id}
          rows={result.items}
        />
      </section>
    </AppShell>
  );
}
