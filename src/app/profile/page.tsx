import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { requireRole } from "@/modules/identity/policies/authorization";
import { getCurrentActor } from "@/modules/identity/services/current-actor";
import { prisma } from "@/platform/db/prisma";
import { updateProfileAction } from "./actions";
import { listDepartments } from "@/modules/departments/services/department-service";
import { DepartmentSelect } from "@/components/faculty/department-select";
export const dynamic = "force-dynamic";
export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const actor = await getCurrentActor();
  if (!actor) redirect("/login");
  if (actor.role !== "FACULTY") redirect("/dashboard");
  requireRole(actor, "FACULTY");
  const params = await searchParams;
  const [user, activeDepartments] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id: actor.id },
      include: { facultyProfile: { include: { department: true } } },
    }),
    listDepartments(actor),
  ]);
  const currentDepartment = user.facultyProfile?.department;
  const departments =
    currentDepartment && !activeDepartments.some((item) => item.id === currentDepartment.id)
      ? [...activeDepartments, currentDepartment]
      : activeDepartments;
  return (
    <AppShell actor={actor} title="My Profile">
      <section className="workspace-page narrow">
        <div className="page-heading">
          <div>
            <span className="eyebrow">Faculty Profile</span>
            <h1>Your Professional Details</h1>
            <p>Keep your School of Computing profile current.</p>
          </div>
        </div>
        {params.notice && (
          <p className="notice" role="status">
            Profile updated successfully.
          </p>
        )}
        <div className="panel">
          <form action={updateProfileAction} className="form-grid">
            <label className="field">
              Full Name
              <input name="name" defaultValue={user.name} required />
            </label>
            <label className="field">
              Email
              <input value={user.email} disabled aria-describedby="email-help" />
              <small id="email-help" className="muted">
                Contact an administrator to change your sign-in email.
              </small>
            </label>
            <label className="field">
              Employee ID
              <input name="employeeId" defaultValue={user.facultyProfile?.employeeId ?? ""} />
            </label>
            <label className="field">
              Department
              <DepartmentSelect
                departments={departments}
                currentDepartmentId={user.facultyProfile?.departmentId}
              />
            </label>
            <label className="field">
              Title
              <input name="title" defaultValue={user.facultyProfile?.title ?? ""} />
            </label>
            <label className="field full">
              Bio
              <input name="bio" defaultValue={user.facultyProfile?.bio ?? ""} />
            </label>
            <button className="primary-button form-submit">Save Profile</button>
          </form>
        </div>
      </section>
    </AppShell>
  );
}
