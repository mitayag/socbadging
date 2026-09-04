import "server-only";

import { z } from "zod";

import {
  batchDetailSchema,
  batchMappingSchema,
  batchPreviewSummarySchema,
  parseStoredBatchRows,
  type BatchDetail,
  type BatchMapping,
  type BatchPreviewSummary,
} from "@/modules/issuance/batch-types";
import {
  AuthorizationError,
  requireAuthenticated,
  requireRole,
} from "@/modules/identity/policies/authorization";
import type { Actor } from "@/modules/identity/types";
import {
  classifyBatchRows,
  assertStoredBatchRowsMatchReview,
  createStoredBatchFingerprint,
  mapBatchRows,
  normalizeBatchMapping,
  parseStoredBatchFingerprint,
} from "@/modules/issuance/services/batch-validation";
import { prisma } from "@/platform/db/prisma";

import { selectCurrentIssuancesByStudentId } from "./current-issuance-selector";

const pageSize = 20;
const previewLifetimeMs = 30 * 60 * 1000;
const maxPreviewRows = 5_000;
const maxPreviewColumnsPerRow = 100;
const maxPreviewCellCharacters = 10_000;
const maxPreviewCellPayloadBytes = 1 * 1024 * 1024;

const previewRowsSchema = z
  .array(z.array(z.string().max(maxPreviewCellCharacters)).max(maxPreviewColumnsPerRow))
  .min(1)
  .max(maxPreviewRows)
  .superRefine((rows, context) => {
    let payloadBytes = 0;
    for (const row of rows) {
      for (const cell of row) {
        payloadBytes += Buffer.byteLength(cell, "utf8");
        if (payloadBytes > maxPreviewCellPayloadBytes) {
          context.addIssue({
            code: "custom",
            message: "Batch preview rows exceed the supported payload size",
          });
          return;
        }
      }
    }
  });

const previewInputSchema = z
  .object({
    classId: z.string().trim().min(1).max(191),
    badgeTemplateId: z.string().trim().min(1).max(191),
    sourceFilename: z
      .string()
      .trim()
      .min(1)
      .max(255)
      .refine((value) => !/[\u0000-\u001F\u007F]/.test(value)),
    mapping: z.unknown(),
    rows: previewRowsSchema,
  })
  .strict();

const batchIdSchema = z.string().trim().min(1).max(191);

export class BatchNotFoundError extends Error {
  constructor() {
    super("Batch not found");
    this.name = "BatchNotFoundError";
  }
}

export class BatchUnavailableError extends Error {
  constructor() {
    super("Batch is unavailable");
    this.name = "BatchUnavailableError";
  }
}

export type BatchHistoryItem = {
  id: string;
  classId: string;
  badgeTemplateId: string;
  facultyUserId: string;
  sourceFilename: string;
  previewFingerprint: string;
  totalRows: number;
  readyCount: number;
  alreadyIssuedCount: number;
  invalidCount: number;
  issuedCount: number;
  status: "READY" | "SIGNING" | "COMMITTED" | "EXPIRED";
  expiresAt: string;
  committedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export const batchHistoryItemSchema: z.ZodType<BatchHistoryItem> = z
  .object({
    id: z.string().trim().min(1).max(191),
    classId: z.string().trim().min(1).max(191),
    badgeTemplateId: z.string().trim().min(1).max(191),
    facultyUserId: z.string().trim().min(1).max(191),
    sourceFilename: z.string().trim().min(1).max(255),
    previewFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    totalRows: z.number().int().nonnegative(),
    readyCount: z.number().int().nonnegative(),
    alreadyIssuedCount: z.number().int().nonnegative(),
    invalidCount: z.number().int().nonnegative(),
    issuedCount: z.number().int().nonnegative(),
    status: z.enum(["READY", "SIGNING", "COMMITTED", "EXPIRED"]),
    expiresAt: z.iso.datetime(),
    committedAt: z.iso.datetime().nullable(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

type BatchRecord = {
  id: string;
  classId: string;
  badgeTemplateId: string;
  facultyUserId: string;
  sourceFilename: string;
  mappingJson: unknown;
  rowsJson: unknown;
  previewFingerprint: string;
  totalRows: number;
  readyCount: number;
  alreadyIssuedCount: number;
  invalidCount: number;
  issuedCount: number;
  status: "READY" | "SIGNING" | "COMMITTED" | "EXPIRED";
  expiresAt: Date;
  committedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

const batchDetailSelect = {
  id: true,
  classId: true,
  badgeTemplateId: true,
  facultyUserId: true,
  sourceFilename: true,
  mappingJson: true,
  rowsJson: true,
  previewFingerprint: true,
  totalRows: true,
  readyCount: true,
  alreadyIssuedCount: true,
  invalidCount: true,
  issuedCount: true,
  status: true,
  expiresAt: true,
  committedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

const batchHistorySelect = {
  id: true,
  classId: true,
  badgeTemplateId: true,
  facultyUserId: true,
  sourceFilename: true,
  previewFingerprint: true,
  totalRows: true,
  readyCount: true,
  alreadyIssuedCount: true,
  invalidCount: true,
  issuedCount: true,
  status: true,
  expiresAt: true,
  committedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

function effectiveBatchStatus(record: Pick<BatchRecord, "status" | "expiresAt">) {
  return (record.status === "READY" || record.status === "SIGNING") &&
    record.expiresAt.getTime() <= Date.now()
    ? ("EXPIRED" as const)
    : record.status;
}

function safePreviewInput(value: unknown) {
  const parsed = previewInputSchema.safeParse(value);
  if (!parsed.success) throw new BatchUnavailableError();

  const widestRow = Math.max(...parsed.data.rows.map((row) => row.length));
  let mapping: BatchMapping;
  try {
    mapping = normalizeBatchMapping(parsed.data.mapping, widestRow);
  } catch {
    throw new BatchUnavailableError();
  }

  return { ...parsed.data, mapping };
}

function toDetail(record: BatchRecord): BatchDetail {
  try {
    const status = effectiveBatchStatus(record);
    const rows = parseStoredBatchRows(record.rowsJson);
    const fingerprintPayload = parseStoredBatchFingerprint({
      classId: record.classId,
      badgeTemplateId: record.badgeTemplateId,
      sourceFilename: record.sourceFilename,
      mappingJson: record.mappingJson,
      previewFingerprint: record.previewFingerprint,
    });
    const mapping = batchMappingSchema.parse(fingerprintPayload.mapping);
    assertStoredBatchRowsMatchReview(fingerprintPayload, rows, record.status === "COMMITTED");
    const detail = batchDetailSchema.safeParse({
      id: record.id,
      classId: record.classId,
      badgeTemplateId: record.badgeTemplateId,
      facultyUserId: record.facultyUserId,
      sourceFilename: record.sourceFilename,
      mapping,
      previewFingerprint: record.previewFingerprint,
      totalRows: record.totalRows,
      readyCount: record.readyCount,
      alreadyIssuedCount: record.alreadyIssuedCount,
      invalidCount: record.invalidCount,
      issuedCount: record.issuedCount,
      status,
      rows,
      expiresAt: record.expiresAt.toISOString(),
      committedAt: record.committedAt?.toISOString() ?? null,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    });
    if (!detail.success) throw new BatchUnavailableError();
    return detail.data;
  } catch (error) {
    if (error instanceof BatchUnavailableError) throw error;
    throw new BatchUnavailableError();
  }
}

function toHistoryItem(record: BatchRecord): BatchHistoryItem {
  const status = effectiveBatchStatus(record);
  const item = batchHistoryItemSchema.safeParse({
    id: record.id,
    classId: record.classId,
    badgeTemplateId: record.badgeTemplateId,
    facultyUserId: record.facultyUserId,
    sourceFilename: record.sourceFilename,
    previewFingerprint: record.previewFingerprint,
    totalRows: record.totalRows,
    readyCount: record.readyCount,
    alreadyIssuedCount: record.alreadyIssuedCount,
    invalidCount: record.invalidCount,
    issuedCount: record.issuedCount,
    status,
    expiresAt: record.expiresAt.toISOString(),
    committedAt: record.committedAt?.toISOString() ?? null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  });
  if (!item.success) throw new BatchUnavailableError();
  return item.data;
}

export async function createBatchPreview(
  actor: Actor | null | undefined,
  rawInput: unknown,
): Promise<BatchPreviewSummary> {
  const faculty = requireRole(actor, "FACULTY");
  const input = safePreviewInput(rawInput);

  return prisma.$transaction(async (tx) => {
    const databaseFaculty = await tx.user.findFirst({
      where: { id: faculty.id, role: "FACULTY", status: "ACTIVE" },
      select: { id: true, role: true, status: true },
    });
    if (
      !databaseFaculty ||
      databaseFaculty.role !== "FACULTY" ||
      databaseFaculty.status !== "ACTIVE"
    ) {
      throw new AuthorizationError("Issuing Faculty account is no longer active");
    }

    const ownedClass = await tx.class.findFirst({
      where: { id: input.classId, ownerUserId: faculty.id, status: "ACTIVE" },
      select: { id: true },
    });
    if (!ownedClass) throw new BatchNotFoundError();

    const badge = await tx.badgeTemplate.findFirst({
      where: {
        id: input.badgeTemplateId,
        classId: input.classId,
        ownerUserId: faculty.id,
        status: "ACTIVE",
      },
      select: { id: true },
    });
    if (!badge) throw new BatchNotFoundError();

    const mappedRows = mapBatchRows(input.rows, input.mapping);
    const studentNumberKeys = [
      ...new Set(mappedRows.map((row) => row.studentNumberKey ?? "").filter(Boolean)),
    ];
    const students = await tx.student.findMany({
      where: { studentNumber: { in: studentNumberKeys } },
      select: { id: true, studentNumber: true, email: true },
    });
    const knownStudents = new Map(
      students.map((student) => [
        student.studentNumber.trim().toLowerCase(),
        { id: student.id, email: student.email },
      ]),
    );
    const studentIds = students.map((student) => student.id);
    const [enrollments, issuances] = await Promise.all([
      tx.classStudent.findMany({
        where: {
          classId: input.classId,
          enrollmentStatus: "ACTIVE",
          studentId: { in: studentIds },
        },
        select: { studentId: true },
      }),
      tx.badgeIssuance.findMany({
        where: {
          classId: input.classId,
          badgeTemplateId: input.badgeTemplateId,
          studentId: { in: studentIds },
        },
        select: {
          id: true,
          publicId: true,
          studentId: true,
          status: true,
          supersedesId: true,
          supersededById: true,
        },
      }),
    ]);
    const classified = classifyBatchRows({
      rows: mappedRows,
      knownStudents,
      activeStudentIds: new Set(enrollments.map((enrollment) => enrollment.studentId)),
      existingIssuances: new Map(
        [...selectCurrentIssuancesByStudentId(issuances)].map(([studentId, issuance]) => [
          studentId,
          { issuanceId: issuance.id, publicId: issuance.publicId },
        ]),
      ),
    });
    const createdAt = new Date();
    const expiresAt = new Date(createdAt.getTime() + previewLifetimeMs);
    const storedFingerprint = createStoredBatchFingerprint({
      classId: input.classId,
      badgeTemplateId: input.badgeTemplateId,
      sourceFilename: input.sourceFilename,
      mapping: input.mapping,
      mappedRows,
      reviewedRows: classified.rows,
    });
    const batch = await tx.issuanceBatch.create({
      data: {
        classId: input.classId,
        badgeTemplateId: input.badgeTemplateId,
        facultyUserId: faculty.id,
        sourceFilename: input.sourceFilename,
        mappingJson: storedFingerprint.mappingJson,
        rowsJson: classified.rows,
        previewFingerprint: storedFingerprint.previewFingerprint,
        totalRows: classified.totalRows,
        readyCount: classified.readyCount,
        alreadyIssuedCount: classified.alreadyIssuedCount,
        invalidCount: classified.invalidCount,
        issuedCount: 0,
        status: "READY",
        createdAt,
        expiresAt,
      },
    });
    await tx.auditLog.create({
      data: {
        actorUserId: faculty.id,
        action: "badge.batch_previewed",
        entityType: "IssuanceBatch",
        entityId: batch.id,
        contextJson: {
          classId: input.classId,
          badgeTemplateId: input.badgeTemplateId,
          batchId: batch.id,
          totalRows: classified.totalRows,
          readyCount: classified.readyCount,
          alreadyIssuedCount: classified.alreadyIssuedCount,
          invalidCount: classified.invalidCount,
        },
      },
    });
    const summary = batchPreviewSummarySchema.safeParse(toDetail(batch as BatchRecord));
    if (!summary.success) throw new BatchUnavailableError();
    return summary.data;
  });
}

export async function authorizeBatchSelection(
  actor: Actor | null | undefined,
  rawClassId: string,
  rawBadgeTemplateId: string,
): Promise<void> {
  const faculty = requireRole(actor, "FACULTY");
  const classId = batchIdSchema.safeParse(rawClassId);
  const badgeTemplateId = batchIdSchema.safeParse(rawBadgeTemplateId);
  if (!classId.success || !badgeTemplateId.success) throw new BatchNotFoundError();

  const activeSelection = await prisma.badgeTemplate.findFirst({
    where: {
      id: badgeTemplateId.data,
      classId: classId.data,
      ownerUserId: faculty.id,
      status: "ACTIVE",
      class: { ownerUserId: faculty.id, status: "ACTIVE" },
      owner: { id: faculty.id, role: "FACULTY", status: "ACTIVE" },
    },
    select: { id: true },
  });
  if (!activeSelection) throw new BatchNotFoundError();
}

export async function authorizeBatchClass(
  actor: Actor | null | undefined,
  rawClassId: string,
): Promise<void> {
  const faculty = requireRole(actor, "FACULTY");
  const classId = batchIdSchema.safeParse(rawClassId);
  if (!classId.success) throw new BatchNotFoundError();
  const activeClass = await prisma.class.findFirst({
    where: {
      id: classId.data,
      ownerUserId: faculty.id,
      status: "ACTIVE",
      owner: { id: faculty.id, role: "FACULTY", status: "ACTIVE" },
    },
    select: { id: true },
  });
  if (!activeClass) throw new BatchNotFoundError();
}

export async function getBatchDetail(
  actor: Actor | null | undefined,
  batchId: string,
): Promise<BatchDetail> {
  const authenticated = requireAuthenticated(actor);
  const id = batchIdSchema.safeParse(batchId);
  if (!id.success) throw new BatchNotFoundError();
  const record = await prisma.issuanceBatch.findFirst({
    where: {
      id: id.data,
      ...(authenticated.role === "FACULTY" ? { class: { ownerUserId: authenticated.id } } : {}),
    },
    select: batchDetailSelect,
  });
  if (!record) throw new BatchNotFoundError();
  return toDetail(record as BatchRecord);
}

export async function listClassBatches(
  actor: Actor | null | undefined,
  classId: string,
): Promise<BatchHistoryItem[]> {
  const authenticated = requireAuthenticated(actor);
  const id = batchIdSchema.safeParse(classId);
  if (!id.success) return [];
  const records = await prisma.issuanceBatch.findMany({
    where: {
      classId: id.data,
      ...(authenticated.role === "FACULTY" ? { class: { ownerUserId: authenticated.id } } : {}),
    },
    select: batchHistorySelect,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: pageSize,
  });
  return records.map((record) => toHistoryItem(record as BatchRecord));
}
