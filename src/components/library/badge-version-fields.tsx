import type { BadgeDefinitionVersion } from "@prisma/client";

export function BadgeVersionFields({
  courses,
  item,
  requireImage,
}: {
  courses: Array<{ id: string; code: string; title: string }>;
  item?: Pick<
    BadgeDefinitionVersion,
    | "name"
    | "description"
    | "competencies"
    | "assessmentCriteria"
    | "gradingPeriod"
    | "issuingInstitution"
    | "validityDays"
    | "metadataJson"
  > & { courseId: string };
  requireImage: boolean;
}) {
  const skills =
    item?.metadataJson &&
    typeof item.metadataJson === "object" &&
    !Array.isArray(item.metadataJson) &&
    Array.isArray((item.metadataJson as { skills?: unknown }).skills)
      ? ((item.metadataJson as { skills: string[] }).skills ?? []).join(", ")
      : "";
  return (
    <>
      <label className="field">
        Associated Course
        <select defaultValue={item?.courseId ?? ""} name="courseId" required>
          <option value="">Select a course</option>
          {courses.map((course) => (
            <option key={course.id} value={course.id}>
              {course.code} · {course.title}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        Badge Name
        <input defaultValue={item?.name} maxLength={191} name="name" required />
      </label>
      <label className="field">
        Grading Period
        <input
          defaultValue={item?.gradingPeriod ?? ""}
          maxLength={100}
          name="gradingPeriod"
          placeholder="Prelim, Midterm, Final"
        />
      </label>
      <label className="field">
        Issuing Institution
        <input
          defaultValue={item?.issuingInstitution ?? "Holy Angel University — School of Computing"}
          maxLength={191}
          name="issuingInstitution"
          required
        />
      </label>
      <label className="field">
        Validity Period (Days)
        <input
          defaultValue={item?.validityDays ?? ""}
          max="3650"
          min="1"
          name="validityDays"
          type="number"
        />
      </label>
      <label className="field full">
        Description
        <textarea defaultValue={item?.description} maxLength={4000} name="description" required />
      </label>
      <label className="field full">
        Competencies
        <textarea defaultValue={item?.competencies} maxLength={8000} name="competencies" required />
      </label>
      <label className="field full">
        Assessment Criteria
        <textarea
          defaultValue={item?.assessmentCriteria}
          maxLength={8000}
          name="assessmentCriteria"
          required
        />
      </label>
      <label className="field full">
        Skills (comma-separated)
        <input defaultValue={skills} maxLength={1000} name="skills" />
      </label>
      <label className="field">
        Badge Artwork {item ? "(Optional replacement)" : ""}
        <input
          accept="image/png,image/jpeg,image/webp"
          name="image"
          required={requireImage}
          type="file"
        />
      </label>
    </>
  );
}
