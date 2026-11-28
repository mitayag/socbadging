/**
 * Stage 7 Release 1 — course catalog and badge library data promotion.
 *
 * Default mode is a read-only dry run. Pass --apply to write.
 * The script is idempotent: templates already linked to a library version are skipped.
 */
import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { Prisma, PrismaClient } from "@prisma/client";

type CoursePlan = {
  normalizedCode: string;
  code: string;
  title: string;
  classIds: string[];
  existingCourseId: string | null;
};

type TemplatePlan = {
  templateId: string;
  classId: string;
  className: string;
  name: string;
  courseId: string;
  courseCode: string;
  status: "ACTIVE" | "ARCHIVED";
  imagePath: string;
  criteria: string;
  action: "skip-linked" | "create-definition";
};

type DuplicateGroup = {
  key: string;
  reason: "same-name-and-course" | "same-artwork-and-criteria";
  definitionIds: string[];
  names: string[];
};

function normalizeCode(value: string) {
  return value.trim().replace(/\s+/g, " ").toUpperCase();
}

function normalizeName(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US");
}

function databaseUrl() {
  let value = "";
  try {
    value = readFileSync("/run/secrets/database_url", "utf8").trim();
  } catch {
    // fall through to the environment
  }
  if (!value) value = process.env.DATABASE_URL?.trim() ?? "";
  if (!value) throw new Error("DATABASE_URL or /run/secrets/database_url is required");
  return new URL(value);
}

function createClient() {
  const url = databaseUrl();
  const adapter = new PrismaMariaDb({
    host: url.hostname,
    port: Number(url.port || 3306),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.slice(1),
    connectionLimit: 1,
    connectTimeout: 10_000,
  });
  return new PrismaClient({ adapter });
}

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

async function main() {
  const apply = process.argv.includes("--apply");
  const prisma = createClient();
  const report: {
    mode: "dry-run" | "apply";
    generatedAt: string;
    courses: { created: number; existing: number; plans: CoursePlan[] };
    classes: { mapped: number; alreadyMapped: number };
    templates: { planned: number; created: number; skippedLinked: number; plans: TemplatePlan[] };
    duplicates: DuplicateGroup[];
    errors: string[];
  } = {
    mode: apply ? "apply" : "dry-run",
    generatedAt: new Date().toISOString(),
    courses: { created: 0, existing: 0, plans: [] },
    classes: { mapped: 0, alreadyMapped: 0 },
    templates: { planned: 0, created: 0, skippedLinked: 0, plans: [] },
    duplicates: [],
    errors: [],
  };

  try {
    const issuer = await prisma.systemSetting.findUnique({
      where: { id: "default" },
      select: { issuerName: true },
    });
    const issuingInstitution = issuer?.issuerName ?? "Holy Angel University — School of Computing";

    const classes = await prisma.class.findMany({
      select: {
        id: true,
        courseId: true,
        courseCode: true,
        title: true,
        section: true,
        academicYear: true,
      },
      orderBy: [{ courseCode: "asc" }, { section: "asc" }],
    });

    const plans = new Map<string, CoursePlan>();
    for (const item of classes) {
      const normalizedCode = normalizeCode(item.courseCode);
      if (!normalizedCode) continue;
      const existing = plans.get(normalizedCode);
      if (existing) {
        existing.classIds.push(item.id);
        if (!existing.title && item.title) existing.title = item.title;
      } else {
        plans.set(normalizedCode, {
          normalizedCode,
          code: item.courseCode.trim(),
          title: item.title,
          classIds: [item.id],
          existingCourseId: null,
        });
      }
    }

    const existingCourses = await prisma.course.findMany({
      where: { normalizedCode: { in: [...plans.keys()] } },
      select: { id: true, normalizedCode: true },
    });
    const existingByCode = new Map(
      existingCourses.map((course) => [course.normalizedCode, course.id]),
    );

    for (const plan of plans.values()) {
      const existingId = existingByCode.get(plan.normalizedCode) ?? null;
      plan.existingCourseId = existingId;
      if (existingId) report.courses.existing += 1;
      else report.courses.created += 1;
      report.courses.plans.push(plan);
      if (!apply) continue;
      const courseId =
        existingId ??
        (
          await prisma.course.create({
            data: {
              code: plan.code,
              normalizedCode: plan.normalizedCode,
              title: plan.title,
            },
            select: { id: true },
          })
        ).id;
      plan.existingCourseId = courseId;
    }

    const classById = new Map(classes.map((item) => [item.id, item]));
    for (const plan of report.courses.plans) {
      for (const classId of plan.classIds) {
        const item = classById.get(classId);
        if (!item) continue;
        if (item.courseId) {
          report.classes.alreadyMapped += 1;
          continue;
        }
        report.classes.mapped += 1;
        if (apply && plan.existingCourseId) {
          await prisma.class.update({
            where: { id: classId },
            data: { courseId: plan.existingCourseId },
          });
        }
      }
    }

    const templates = await prisma.badgeTemplate.findMany({
      select: {
        id: true,
        classId: true,
        ownerUserId: true,
        name: true,
        description: true,
        criteria: true,
        imagePath: true,
        status: true,
        expiresAfterDays: true,
        metadataJson: true,
        sharedDefinitionVersionId: true,
        class: { select: { courseCode: true, title: true, section: true } },
      },
      orderBy: [{ classId: "asc" }, { name: "asc" }],
    });

    for (const template of templates) {
      if (template.sharedDefinitionVersionId) {
        report.templates.skippedLinked += 1;
        report.templates.plans.push({
          templateId: template.id,
          classId: template.classId,
          className: `${template.class.courseCode} · ${template.class.section}`,
          name: template.name,
          courseId: "",
          courseCode: template.class.courseCode,
          status: template.status,
          imagePath: template.imagePath,
          criteria: template.criteria,
          action: "skip-linked",
        });
        continue;
      }
      const plan = report.courses.plans.find(
        (item) => item.normalizedCode === normalizeCode(template.class.courseCode),
      );
      const classRecord = classById.get(template.classId);
      let courseId = classRecord?.courseId ?? plan?.existingCourseId ?? null;
      if (!courseId && !apply && plan) courseId = `dry-run:${plan.normalizedCode}`;
      if (!courseId) {
        report.errors.push(`No course mapping available for badge template ${template.id}`);
        continue;
      }
      report.templates.planned += 1;
      report.templates.plans.push({
        templateId: template.id,
        classId: template.classId,
        className: `${template.class.courseCode} · ${template.class.section}`,
        name: template.name,
        courseId,
        courseCode: template.class.courseCode,
        status: template.status,
        imagePath: template.imagePath,
        criteria: template.criteria,
        action: "create-definition",
      });
      if (!apply) continue;

      await prisma.$transaction(async (tx) => {
        const definition = await tx.badgeDefinition.create({
          data: {
            courseId,
            name: template.name,
            createdByUserId: template.ownerUserId,
            status: template.status === "ACTIVE" ? "APPROVED" : "ARCHIVED",
          },
        });
        const version = await tx.badgeDefinitionVersion.create({
          data: {
            badgeDefinitionId: definition.id,
            version: 1,
            name: template.name,
            description: template.description,
            competencies:
              template.metadataJson &&
              typeof template.metadataJson === "object" &&
              !Array.isArray(template.metadataJson) &&
              Array.isArray((template.metadataJson as { skills?: unknown }).skills) &&
              (template.metadataJson as { skills: string[] }).skills.length
                ? (template.metadataJson as { skills: string[] }).skills.join(", ")
                : "Legacy badge; competencies were not recorded in the previous workflow.",
            assessmentCriteria: template.criteria,
            gradingPeriod: null,
            issuingInstitution,
            validityDays: template.expiresAfterDays,
            imagePath: template.imagePath,
            criteria: template.criteria,
            metadataJson: template.metadataJson === null ? Prisma.JsonNull : template.metadataJson,
            status: template.status === "ACTIVE" ? "APPROVED" : "ARCHIVED",
            createdByUserId: template.ownerUserId,
            approvedByUserId: null,
            approvedAt: null,
          },
        });
        await tx.badgeDefinitionReview.create({
          data: {
            badgeDefinitionVersionId: version.id,
            actorUserId: template.ownerUserId,
            decision: "VERSION_CREATED",
            note: "Backfilled from an existing class badge template. Approval provenance was not recorded by the legacy workflow.",
          },
        });
        await tx.badgeTemplate.update({
          where: { id: template.id },
          data: { sharedDefinitionVersionId: version.id },
        });
        await tx.classBadgeAssignment.create({
          data: {
            classId: template.classId,
            badgeDefinitionId: definition.id,
            badgeDefinitionVersionId: version.id,
            badgeTemplateId: template.id,
            assignedByUserId: template.ownerUserId,
            status: template.status === "ACTIVE" ? "ACTIVE" : "ARCHIVED",
            archivedAt: template.status === "ACTIVE" ? null : new Date(),
          },
        });
        await tx.auditLog.create({
          data: {
            actorUserId: template.ownerUserId,
            action: "badge.library_backfilled",
            entityType: "BadgeTemplate",
            entityId: template.id,
            contextJson: {
              badgeDefinitionId: definition.id,
              badgeDefinitionVersionId: version.id,
              courseId,
            },
          },
        });
      });
      report.templates.created += 1;
    }

    const storedDefinitions = await prisma.badgeDefinition.findMany({
      select: {
        id: true,
        name: true,
        courseId: true,
        versions: {
          orderBy: { version: "desc" },
          take: 1,
          select: { imagePath: true, criteria: true },
        },
      },
    });
    const plannedDefinitions = apply
      ? []
      : report.templates.plans
          .filter((plan) => plan.action === "create-definition")
          .map((plan) => ({
            id: `planned:${plan.templateId}`,
            name: plan.name,
            courseId: plan.courseId,
            versions: [{ imagePath: plan.imagePath, criteria: plan.criteria }],
          }));
    const definitions = [...storedDefinitions, ...plannedDefinitions];
    const nameGroups = new Map<string, typeof definitions>();
    const artworkGroups = new Map<string, typeof definitions>();
    for (const definition of definitions) {
      const nameKey = `${definition.courseId}:${normalizeName(definition.name)}`;
      nameGroups.set(nameKey, [...(nameGroups.get(nameKey) ?? []), definition]);
      const latest = definition.versions[0];
      if (latest) {
        const artworkKey = `${latest.imagePath}:${normalizeName(latest.criteria)}`;
        if (latest.imagePath && latest.criteria) {
          artworkGroups.set(artworkKey, [...(artworkGroups.get(artworkKey) ?? []), definition]);
        }
      }
    }
    for (const [key, group] of nameGroups) {
      if (group.length > 1 && group[0]) {
        report.duplicates.push({
          key,
          reason: "same-name-and-course",
          definitionIds: group.map((item) => item.id),
          names: group.map((item) => item.name),
        });
      }
    }
    for (const [key, group] of artworkGroups) {
      if (group.length > 1 && group[0]) {
        report.duplicates.push({
          key,
          reason: "same-artwork-and-criteria",
          definitionIds: group.map((item) => item.id),
          names: group.map((item) => item.name),
        });
      }
    }
  } finally {
    await prisma.$disconnect();
  }

  const directory = join(process.cwd(), "reports");
  await mkdir(directory, { recursive: true });
  const base = join(directory, `stage7-release1-migration-${stamp()}`);
  await writeFile(`${base}.json`, `${JSON.stringify(report, null, 2)}\n`);
  const lines = [
    `# Stage 7 Release 1 Migration ${report.mode === "apply" ? "Apply" : "Dry Run"}`,
    "",
    `Generated: ${report.generatedAt}`,
    "",
    "## Summary",
    "",
    `- Courses: ${report.courses.created} to create, ${report.courses.existing} already present`,
    `- Classes mapped to a course: ${report.classes.mapped} (${report.classes.alreadyMapped} already mapped)`,
    `- Badge definitions: ${report.templates.planned} planned, ${report.templates.created} created, ${report.templates.skippedLinked} already linked`,
    `- Duplicate groups for review: ${report.duplicates.length}`,
    `- Errors: ${report.errors.length}`,
    "",
    "## Courses",
    "",
    "| Code | Title | Classes | Existing |",
    "| --- | --- | --- | --- |",
    ...report.courses.plans.map(
      (plan) =>
        `| ${plan.code} | ${plan.title} | ${plan.classIds.length} | ${plan.existingCourseId ?? "new"} |`,
    ),
    "",
    "## Duplicate candidates",
    "",
    ...(report.duplicates.length
      ? report.duplicates.map(
          (group) =>
            `- ${group.reason}: ${group.names.join(", ")} (${group.definitionIds.join(", ")})`,
        )
      : ["None detected."]),
    "",
    "## Errors",
    "",
    ...(report.errors.length ? report.errors.map((error) => `- ${error}`) : ["None."]),
    "",
    "No existing badge, issuance, signature, public ID, revocation, notification or audit record was modified.",
  ];
  await writeFile(`${base}.md`, `${lines.join("\n")}\n`);
  process.stdout.write(`${JSON.stringify({ mode: report.mode, report: `${base}.json` })}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
