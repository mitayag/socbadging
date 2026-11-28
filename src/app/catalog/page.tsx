import { redirect } from "next/navigation";

import { AppShell } from "@/components/layout/app-shell";
import { ConfirmDialogButton } from "@/components/ui/confirm-dialog-button";
import { DataTable } from "@/components/ui/data-table";
import {
  coursePageSizes,
  listClassOptions,
  listCourses,
  listCourseOptions,
  type CoursePageSize,
  type CourseSort,
} from "@/modules/catalog/services/course-service";
import { getCurrentActor } from "@/modules/identity/services/current-actor";
import {
  createCourseAction,
  mapClassAction,
  statusCourseAction,
  updateCourseAction,
} from "./actions";

export const dynamic = "force-dynamic";

const noticeMessages: Record<string, string> = {
  created: "Course created successfully.",
  updated: "Course updated successfully.",
  archived: "Course archived. Existing classes and credentials were preserved.",
  reopened: "Course reopened.",
  mapped: "Class mapped to the standardized course.",
};

function parseSort(value: string | undefined): CourseSort {
  return value === "title" || value === "status" || value === "updated" ? value : "code";
}

function parsePageSize(value: string | undefined): CoursePageSize {
  const parsed = Number(value);
  return coursePageSizes.includes(parsed as CoursePageSize) ? (parsed as CoursePageSize) : 10;
}

function CourseFields({
  item,
}: {
  item?: {
    code: string;
    title: string;
    description: string | null;
    programsJson: unknown;
  };
}) {
  const programs = Array.isArray(item?.programsJson)
    ? (item.programsJson as string[]).join(", ")
    : "";
  return (
    <>
      <label className="field">
        Course Code
        <input defaultValue={item?.code} maxLength={100} name="code" required />
      </label>
      <label className="field">
        Course Title
        <input defaultValue={item?.title} maxLength={191} name="title" required />
      </label>
      <label className="field full">
        Description
        <input defaultValue={item?.description ?? ""} maxLength={4000} name="description" />
      </label>
      <label className="field full">
        Academic Programs (comma-separated)
        <input
          defaultValue={programs}
          maxLength={1000}
          name="programs"
          placeholder="BS Computer Science, BS Information Technology"
        />
      </label>
    </>
  );
}

export default async function CatalogPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const actor = await getCurrentActor();
  if (!actor) redirect("/login");
  if (actor.role !== "ADMIN") redirect("/dashboard");
  const params = await searchParams;
  const status =
    params.status === "ACTIVE" || params.status === "ARCHIVED" ? params.status : undefined;
  const sort = parseSort(params.sort);
  const pageSize = parsePageSize(params.pageSize);
  const page = Math.max(1, Number(params.page) || 1);
  const [result, courseOptions, classOptions] = await Promise.all([
    listCourses(actor, {
      query: params.q ?? "",
      status,
      program: params.program ?? "",
      sort,
      page,
      pageSize,
    }),
    listCourseOptions(actor, true),
    listClassOptions(actor),
  ]);
  const pageHref = (nextPage: number) => {
    const next = new URLSearchParams();
    if (params.q) next.set("q", params.q);
    if (params.program) next.set("program", params.program);
    if (status) next.set("status", status);
    next.set("sort", sort);
    next.set("pageSize", String(result.pageSize));
    next.set("page", String(nextPage));
    return `/catalog?${next.toString()}`;
  };

  return (
    <AppShell actor={actor} title="Course Catalog">
      <section className="workspace-page">
        <div className="page-heading">
          <div>
            <span className="eyebrow">Institutional Catalog</span>
            <h1>Course Catalog</h1>
            <p>
              Standardize courses so multiple faculty and class sections reference the same course
              and approved badges.
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

        <details className="panel">
          <summary className="panel-summary">Create Course</summary>
          <form action={createCourseAction} className="form-grid">
            <CourseFields />
            <button className="primary-button form-submit">Create Course</button>
          </form>
        </details>

        <details className="panel">
          <summary className="panel-summary">Map a Class to a Course</summary>
          <form action={mapClassAction} className="form-grid">
            <label className="field">
              Class
              <select name="classId" required>
                {classOptions.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.courseCode} · {item.title} · {item.section}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Standardized Course
              <select name="courseId" required>
                {courseOptions
                  .filter((course) => course.status === "ACTIVE")
                  .map((course) => (
                    <option key={course.id} value={course.id}>
                      {course.code} · {course.title}
                    </option>
                  ))}
              </select>
            </label>
            <button className="secondary-button form-submit">Map Class</button>
          </form>
        </details>

        <form className="filters">
          <input name="q" defaultValue={params.q} placeholder="Search code, title, description" />
          <input name="program" defaultValue={params.program} placeholder="Program" />
          <select name="status" defaultValue={status ?? ""}>
            <option value="">All Statuses</option>
            <option>ACTIVE</option>
            <option>ARCHIVED</option>
          </select>
          <select name="sort" defaultValue={sort}>
            <option value="code">Sort: Code</option>
            <option value="title">Sort: Title</option>
            <option value="status">Sort: Status</option>
            <option value="updated">Sort: Recently Updated</option>
          </select>
          <select name="pageSize" defaultValue={String(pageSize)}>
            {coursePageSizes.map((size) => (
              <option key={size} value={size}>
                {size} per page
              </option>
            ))}
          </select>
          <button className="secondary-button">Filter</button>
        </form>

        <DataTable
          caption="Standardized course catalog"
          columns={[
            { key: "code", header: "Code", render: (row) => <strong>{row.code}</strong> },
            {
              key: "title",
              header: "Title",
              render: (row) => (
                <div>
                  <span>{row.title}</span>
                  {row.description ? <p className="muted">{row.description}</p> : null}
                </div>
              ),
            },
            {
              key: "programs",
              header: "Programs",
              render: (row) =>
                Array.isArray(row.programsJson) && row.programsJson.length ? (
                  (row.programsJson as string[]).join(", ")
                ) : (
                  <span className="muted">Unassigned</span>
                ),
            },
            {
              key: "usage",
              header: "Usage",
              render: (row) => (
                <span className="muted">
                  {row._count.classes} classes · {row._count.badgeDefinitions} badges
                </span>
              ),
            },
            {
              key: "status",
              header: "Status",
              render: (row) => (
                <span className={`status ${row.status.toLowerCase()}`}>{row.status}</span>
              ),
            },
            {
              key: "actions",
              header: "Actions",
              render: (row) => (
                <div className="faculty-actions">
                  <details>
                    <summary className="text-button">Edit</summary>
                    <form action={updateCourseAction} className="form-grid">
                      <input name="courseId" type="hidden" value={row.id} />
                      <CourseFields item={row} />
                      <button className="secondary-button form-submit">Save Course</button>
                    </form>
                  </details>
                  {row.status === "ACTIVE" ? (
                    <ConfirmDialogButton
                      action={statusCourseAction}
                      confirmLabel="Archive Course"
                      description="Archiving keeps the course and all historical records. New class mappings and badge proposals will be blocked."
                      fields={{ courseId: row.id, status: "ARCHIVED" }}
                      title={`Archive ${row.code}?`}
                      triggerLabel="Archive"
                    />
                  ) : (
                    <form action={statusCourseAction}>
                      <input name="courseId" type="hidden" value={row.id} />
                      <input name="status" type="hidden" value="ACTIVE" />
                      <button className="secondary-button">Reopen</button>
                    </form>
                  )}
                </div>
              ),
            },
          ]}
          emptyMessage="No courses match these filters."
          label="Course catalog"
          nextHref={result.hasNext ? pageHref(result.page + 1) : undefined}
          pagination={{ ...result, totalPages: result.pageCount }}
          previousHref={result.hasPrevious ? pageHref(result.page - 1) : undefined}
          recordLabel="course"
          rowKey={(row) => row.id}
          rows={result.items}
        />
      </section>
    </AppShell>
  );
}
