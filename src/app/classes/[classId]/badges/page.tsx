import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { getCurrentActor } from "@/modules/identity/services/current-actor";
import { getClassWorkspace } from "@/modules/rosters/services/roster-service";
import { getClassTabs } from "@/components/layout/navigation";
import { listBadges } from "@/modules/badges/services/badge-service";
import {
  createBadgeAction,
  duplicateBadgeAction,
  editBadgeAction,
  statusBadgeAction,
} from "./actions";
export const dynamic = "force-dynamic";
type BadgeFieldItem = {
  name: string;
  description: string;
  criteria: string;
  expiresAfterDays: number | null;
  metadataJson: unknown;
};
const BadgeFields = ({ item }: { item?: BadgeFieldItem }) => {
  const meta = item?.metadataJson as
    { skills?: string[]; alignment?: { name?: string; url?: string } } | undefined;
  return (
    <>
      <label className="field">
        Name
        <input name="name" defaultValue={item?.name} required />
      </label>
      <label className="field">
        Description
        <input name="description" defaultValue={item?.description} minLength={10} required />
      </label>
      <label className="field full">
        Criteria
        <input name="criteria" defaultValue={item?.criteria} minLength={10} required />
      </label>
      <label className="field">
        Skills, Comma-Separated
        <input
          name="skills"
          defaultValue={Array.isArray(meta?.skills) ? meta.skills.join(", ") : ""}
        />
      </label>
      <label className="field">
        Alignment Name
        <input name="alignmentName" defaultValue={meta?.alignment?.name ?? ""} />
      </label>
      <label className="field">
        Alignment URL
        <input name="alignmentUrl" type="url" defaultValue={meta?.alignment?.url ?? ""} />
      </label>
      <label className="field">
        Expiration Days (Optional)
        <input
          name="expiresAfterDays"
          type="number"
          min="1"
          max="3650"
          defaultValue={item?.expiresAfterDays ?? ""}
        />
      </label>
      <label className="field">
        Badge Artwork {item && "(Optional Replacement)"}
        <input name="image" type="file" accept="image/png,image/jpeg,image/webp" required={!item} />
      </label>
    </>
  );
};
export default async function BadgesPage({
  params,
  searchParams,
}: {
  params: Promise<{ classId: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const actor = await getCurrentActor();
  if (!actor) redirect("/login");
  const classId = (await params).classId;
  const q = await searchParams;
  const status = q.status === "ACTIVE" || q.status === "ARCHIVED" ? q.status : undefined;
  const [item, badges] = await Promise.all([
    getClassWorkspace(actor, classId),
    listBadges(actor, classId, q.q ?? "", status),
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
            <p>Achievement templates and criteria</p>
          </div>
        </div>
        <nav aria-label="Class Navigation" className="class-tabs">
          {getClassTabs(classId, "badges").map((tab) => (
            <Link className={tab.active ? "active" : undefined} href={tab.href} key={tab.href}>
              {tab.label}
            </Link>
          ))}
        </nav>
        {q.notice && <p className="notice">Badge template created successfully.</p>}
        {actor.role === "FACULTY" && (
          <details className="panel">
            <summary className="panel-summary">Create Badge Template</summary>
            <form action={createBadgeAction} className="form-grid">
              <input type="hidden" name="classId" value={classId} />
              <BadgeFields />
              <button className="primary-button form-submit">Create Badge</button>
            </form>
          </details>
        )}
        <form className="filters">
          <input name="q" defaultValue={q.q} placeholder="Search badge templates" />
          <select name="status" defaultValue={status ?? ""}>
            <option value="">All Statuses</option>
            <option>ACTIVE</option>
            <option>ARCHIVED</option>
          </select>
          <button className="secondary-button">Filter</button>
        </form>
        <div className="badge-grid">
          {badges.items.map((b) => (
            <article className="badge-card" key={b.id}>
              <Image
                src={`/api/media/${b.imagePath}`}
                alt={`${b.name} badge artwork`}
                width={160}
                height={160}
                unoptimized
              />
              <div>
                <span className={`status ${b.status.toLowerCase()}`}>{b.status}</span>
                <h2>{b.name}</h2>
                <p>{b.description}</p>
                <strong>Criteria</strong>
                <p>{b.criteria}</p>
              </div>
              {actor.role === "FACULTY" && (
                <details>
                  <summary>Edit Template</summary>
                  <form action={editBadgeAction} className="form-grid">
                    <input type="hidden" name="classId" value={classId} />
                    <input type="hidden" name="badgeId" value={b.id} />
                    <BadgeFields item={b} />
                    <button className="secondary-button">Save Badge</button>
                  </form>
                  <div className="inline-actions">
                    <form action={duplicateBadgeAction}>
                      <input type="hidden" name="classId" value={classId} />
                      <input type="hidden" name="badgeId" value={b.id} />
                      <button className="secondary-button">Duplicate</button>
                    </form>
                    <form action={statusBadgeAction}>
                      <input type="hidden" name="classId" value={classId} />
                      <input type="hidden" name="badgeId" value={b.id} />
                      <input
                        type="hidden"
                        name="status"
                        value={b.status === "ACTIVE" ? "ARCHIVED" : "ACTIVE"}
                      />
                      <button
                        className={b.status === "ACTIVE" ? "danger-button" : "secondary-button"}
                      >
                        {b.status === "ACTIVE" ? "Archive" : "Reopen"}
                      </button>
                    </form>
                  </div>
                </details>
              )}
            </article>
          ))}
          {!badges.items.length && (
            <div className="empty-state">No badge templates match these filters.</div>
          )}
        </div>
      </section>
    </AppShell>
  );
}
