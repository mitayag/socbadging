import { redirect } from "next/navigation";

import { ClassRowActions } from "@/components/classes/class-row-actions";
import { AppShell } from "@/components/layout/app-shell";
import { DataTable } from "@/components/ui/data-table";
import {
  classPageSizes,
  listClasses,
  type ClassPageSize,
  type ClassSort,
} from "@/modules/classes/services/class-service";
import { getCurrentActor } from "@/modules/identity/services/current-actor";
import { createClassAction, editClassAction, statusClassAction } from "./actions";

export const dynamic = "force-dynamic";

function parseSort(value: string | undefined): ClassSort {
  return value === "courseCode" || value === "title" || value === "status" ? value : "updated";
}

function parsePageSize(value: string | undefined): ClassPageSize {
  const parsed = Number(value);
  return classPageSizes.includes(parsed as ClassPageSize) ? (parsed as ClassPageSize) : 5;
}

const returnKeys = ["q", "status", "sort", "page", "pageSize"] as const;

function HiddenQuery({ params }: { params: Record<string, string | undefined> }) {
  return (
    <>
      {returnKeys.map((key) =>
        params[key] ? <input key={key} name={key} type="hidden" value={params[key]} /> : null,
      )}
    </>
  );
}

export default async function ClassesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const actor = await getCurrentActor();
  if (!actor) redirect("/login");
  if (actor.role === "STUDENT") redirect("/student");
  const params = await searchParams;
  const status =
    params.status === "ACTIVE" || params.status === "ARCHIVED" ? params.status : undefined;
  const sort = parseSort(params.sort);
  const pageSize = parsePageSize(params.pageSize);
  const page = Math.max(1, Number(params.page) || 1);
  const result = await listClasses(actor, params.q ?? "", status, page, { pageSize, sort });
  const hasFilters = Boolean(params.q || status || params.sort || params.pageSize);
  const pageHref = (nextPage: number) => {
    const next = new URLSearchParams();
    if (params.q) next.set("q", params.q);
    if (status) next.set("status", status);
    next.set("sort", sort);
    next.set("pageSize", String(result.pageSize));
    next.set("page", String(nextPage));
    return `/classes?${next.toString()}`;
  };
  const canManage = actor.role === "FACULTY";

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
        {params.notice ? (
          <p className="notice" role="status">
            Class {params.notice} successfully.
          </p>
        ) : null}
        {canManage ? (
          <details className="panel">
            <summary className="panel-summary">Create Class</summary>
            <form action={createClassAction} className="form-grid">
              <HiddenQuery params={params} />
              <label className="field">
                Course Code
                <input maxLength={100} name="courseCode" required />
              </label>
              <label className="field">
                Class Title
                <input maxLength={191} name="title" required />
              </label>
              <label className="field">
                Section
                <input maxLength={100} name="section" required />
              </label>
              <label className="field">
                Term
                <input maxLength={100} name="term" placeholder="First Semester" required />
              </label>
              <label className="field">
                Academic Year
                <input name="academicYear" pattern="\d{4}-\d{4}" placeholder="2026-2027" required />
              </label>
              <label className="field">
                Description
                <input maxLength={4000} name="description" />
              </label>
              <button className="primary-button form-submit">Create Class</button>
            </form>
          </details>
        ) : null}

        <DataTable
          caption="Classes"
          columns={[
            {
              key: "course",
              header: "Course",
              render: (item) => (
                <span>
                  <span className="faculty-name">
                    {item.courseCode} · {item.title}
                  </span>
                </span>
              ),
            },
            { key: "section", header: "Section", render: (item) => item.section },
            {
              key: "term",
              header: "Term / Academic Year",
              render: (item) => `${item.term} · ${item.academicYear}`,
            },
            {
              key: "owner",
              header: "Owner",
              render: (item) => item.owner.name,
            },
            {
              key: "status",
              header: "Status",
              render: (item) => (
                <span className={`status ${item.status.toLowerCase()}`}>{item.status}</span>
              ),
            },
            {
              key: "actions",
              header: "Actions",
              className: "faculty-actions-cell",
              render: (item) => (
                <ClassRowActions
                  actions={{ edit: editClassAction, status: statusClassAction }}
                  canManage={canManage}
                  classItem={{
                    id: item.id,
                    courseCode: item.courseCode,
                    title: item.title,
                    section: item.section,
                    term: item.term,
                    academicYear: item.academicYear,
                    description: item.description,
                    status: item.status,
                  }}
                />
              ),
            },
          ]}
          emptyMessage="No classes match these filters."
          label="Classes"
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
          recordLabel="class"
          rows={result.items}
          rowKey={(item) => item.id}
          tableClassName="class-table"
          toolbar={
            <form className="filters faculty-toolbar" role="search">
              <input
                aria-label="Search classes"
                defaultValue={params.q}
                name="q"
                placeholder="Search code, title, or section"
              />
              <select aria-label="Class status" defaultValue={status ?? ""} name="status">
                <option value="">All Statuses</option>
                <option value="ACTIVE">Active</option>
                <option value="ARCHIVED">Archived</option>
              </select>
              <select aria-label="Sort by" defaultValue={sort} name="sort">
                <option value="updated">Recently updated</option>
                <option value="courseCode">Course code</option>
                <option value="title">Title</option>
                <option value="status">Status</option>
              </select>
              <select aria-label="Rows per page" defaultValue={String(pageSize)} name="pageSize">
                {classPageSizes.map((size) => (
                  <option key={size} value={size}>
                    {size} per page
                  </option>
                ))}
              </select>
              <button className="secondary-button">Apply</button>
              {hasFilters ? (
                <a className="text-button" href="/classes">
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
