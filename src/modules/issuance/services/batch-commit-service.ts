import "server-only";

import { randomUUID } from "node:crypto";

import { Prisma } from "@prisma/client";
import { z } from "zod";

import {
  batchCommitSummarySchema,
  batchPreviewSummarySchema,
  parseStoredBatchRows,
  type BatchCommitSummary,
  type BatchMapping,
  type BatchPreviewRow,
} from "@/modules/issuance/batch-types";
import { AuthorizationError, requireRole } from "@/modules/identity/policies/authorization";
import type { Actor } from "@/modules/identity/types";
import { prisma } from "@/platform/db/prisma";

import { BatchNotFoundError, BatchUnavailableError } from "./batch-preview-service";
import { assertStoredBatchRowsMatchReview, parseStoredBatchFingerprint } from "./batch-validation";
import { selectCurrentIssuancesByStudentId } from "./current-issuance-selector";
import {
  commitPreparedSignedIssuanceSetInTransaction,
  prepareSignedIssuance,
  prepareSignedIssuanceForTest,
  SignedIssuanceError,
  type BatchSignedIssuanceClaim,
  type PreparedSignedIssuance,
  type SignedIssuanceSigner,
} from "./signed-issuance-service";

const batchIdSchema = z.string().trim().min(1).max(191);
const maximumBatchAttempts = 3;
const defaultSignerBatchConcurrency = 4;
const batchClaimLeaseMilliseconds = 5 * 60 * 1_000;
const batchClaimHeartbeatMilliseconds = 60 * 1_000;
const signerBatchConcurrencySchema = z.coerce.number().int().min(1).max(16);
const batchCommitTestHookKey = Symbol.for("hau-soc-badging.batch-commit-test-hooks");

export const BATCH_SIGNING_UNAVAILABLE_MESSAGE = "Signing unavailable; no credentials were issued.";

export class BatchSigningError extends Error {
  constructor() {
    super(BATCH_SIGNING_UNAVAILABLE_MESSAGE);
    this.name = "BatchSigningError";
  }
}

type BatchCommitTestHooks = {
  beforeBatchClaim?: () => Promise<void>;
  beforeFinalCommit?: () => Promise<void>;
  beforeCurrentStateLocks?: () => Promise<void>;
  afterTuplePrecheck?: () => Promise<void>;
  afterCurrentStateLocks?: () => Promise<void>;
  onTupleConflictRetry?: () => void;
};

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
  signingClaimToken: string | null;
  signingClaimVersion: number;
  signingClaimExpiresAt: Date | null;
  expiresAt: Date;
  committedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type CurrentIssuer = {
  id: string;
  name: string;
  role: "FACULTY" | "ADMIN";
  status: "ACTIVE" | "SUSPENDED" | "DELETED";
};

type CurrentClass = {
  id: string;
  ownerUserId: string;
  status: "ACTIVE" | "ARCHIVED";
};

type CurrentBadgeTemplate = {
  id: string;
  classId: string;
  ownerUserId: string;
  status: "ACTIVE" | "ARCHIVED";
};

type CurrentStudent = {
  id: string;
  studentNumber: string;
  firstName: string;
  lastName: string;
  email: string;
};

type CurrentEnrollment = {
  classId: string;
  studentId: string;
  enrollmentStatus: "ACTIVE" | "REMOVED";
};

type ExistingIssuance = {
  id: string;
  publicId: string;
  studentId: string;
  status: "ACTIVE" | "REVOKED" | "EXPIRED";
  supersedesId: string | null;
  supersededById: string | null;
};

type BatchPreparationPlan = {
  record: BatchRecord;
  rows: BatchPreviewRow[];
  newRows: BatchPreviewRow[];
  claim: BatchSignedIssuanceClaim;
};

const batchSelect = {
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
  signingClaimToken: true,
  signingClaimVersion: true,
  signingClaimExpiresAt: true,
  expiresAt: true,
  committedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

const expectedMessages: Record<BatchPreviewRow["disposition"], string> = {
  READY: "Ready to issue.",
  ALREADY_ISSUED: "Badge already issued.",
  DUPLICATE_IN_FILE: "Duplicate student number in file.",
  STUDENT_NOT_FOUND: "Student number was not found.",
  NOT_ACTIVELY_ENROLLED: "Student is not actively enrolled.",
  EMAIL_MISMATCH: "Supplied email does not match student record.",
  INVALID: "",
};

function testHooks(): BatchCommitTestHooks | undefined {
  if (process.env.NODE_ENV !== "test") return undefined;
  return (globalThis as typeof globalThis & { [key: symbol]: unknown })[batchCommitTestHookKey] as
    BatchCommitTestHooks | undefined;
}

function hasExactP2002Target(
  error: unknown,
  allowedTargets: readonly (readonly string[] | string)[],
): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as {
    code?: unknown;
    message?: unknown;
    meta?: {
      target?: unknown;
      driverAdapterError?: { cause?: { constraint?: { index?: unknown } } };
    };
  };
  if (candidate.code !== "P2002") return false;

  const matches = (target: unknown) =>
    allowedTargets.some((allowed) => {
      if (typeof allowed === "string") return target === allowed;
      if (!Array.isArray(target) || target.length !== allowed.length) return false;
      return target.every((field, index) => field === allowed[index]);
    });

  return (
    matches(candidate.meta?.target) ||
    matches(candidate.meta?.driverAdapterError?.cause?.constraint?.index)
  );
}

function isTupleUniqueConflict(error: unknown): boolean {
  return hasExactP2002Target(error, [
    ["classId", "badgeTemplateId", "studentId"],
    ["class_id", "badge_template_id", "student_id"],
    ["badge_issuances_class_id_badge_template_id_student_id_key"],
    "BadgeIssuance_classId_badgeTemplateId_studentId_key",
    "badge_issuances_class_id_badge_template_id_student_id_key",
  ]);
}

function isTupleReservationConflict(error: unknown): boolean {
  return hasExactP2002Target(error, [
    ["classId", "badgeTemplateId", "studentId"],
    ["class_id", "badge_template_id", "student_id"],
    "issuance_tuple_reservations_tuple_key",
  ]);
}

function isMariaDbRecordChangedSinceRead(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as {
    code?: unknown;
    message?: unknown;
    meta?: {
      code?: unknown;
      driverAdapterError?: { cause?: { originalCode?: unknown } };
    };
  };
  return (
    (candidate.code === "P2010" &&
      String(candidate.meta?.code ?? candidate.meta?.driverAdapterError?.cause?.originalCode) ===
        "1020") ||
    (candidate.code === "P2039" &&
      typeof candidate.message === "string" &&
      candidate.message.includes("Database error. Code: `1020`."))
  );
}

function isRetryableMariaDbTransactionError(error: unknown): boolean {
  if (isMariaDbRecordChangedSinceRead(error)) return true;
  if (!error || typeof error !== "object") return false;
  const candidate = error as {
    code?: unknown;
    message?: unknown;
    meta?: {
      code?: unknown;
      driverAdapterError?: { cause?: { originalCode?: unknown } };
    };
  };
  if (candidate.code === "P2034") return true;
  if (
    candidate.code === "P2039" &&
    typeof candidate.message === "string" &&
    candidate.message.includes("Database error. Code: `1213`.")
  ) {
    return true;
  }
  return (
    candidate.code === "P2010" &&
    String(candidate.meta?.code ?? candidate.meta?.driverAdapterError?.cause?.originalCode) ===
      "1213"
  );
}

async function authoritativeLockingRead<T>(read: Promise<T>): Promise<T> {
  try {
    return await read;
  } catch (error) {
    if (isMariaDbRecordChangedSinceRead(error)) unavailable();
    throw error;
  }
}

function unavailable(): never {
  throw new BatchUnavailableError();
}

function parsedSnapshot(record: BatchRecord, committed: boolean) {
  try {
    const rows = parseStoredBatchRows(record.rowsJson);
    const fingerprintPayload = parseStoredBatchFingerprint({
      classId: record.classId,
      badgeTemplateId: record.badgeTemplateId,
      sourceFilename: record.sourceFilename,
      mappingJson: record.mappingJson,
      previewFingerprint: record.previewFingerprint,
    });
    assertStoredBatchRowsMatchReview(fingerprintPayload, rows, committed);
    return { mapping: fingerprintPayload.mapping, rows };
  } catch {
    return unavailable();
  }
}

function assertRowIntegrity(rows: BatchPreviewRow[]) {
  const seenCandidates = new Set<string>();
  for (const [index, row] of rows.entries()) {
    if (row.rowNumber !== index + 2) unavailable();
    if (row.disposition !== "INVALID" && row.message !== expectedMessages[row.disposition]) {
      unavailable();
    }

    const requiresStudent = [
      "READY",
      "ALREADY_ISSUED",
      "NOT_ACTIVELY_ENROLLED",
      "EMAIL_MISMATCH",
    ].includes(row.disposition);
    if (requiresStudent !== (row.studentId !== null)) unavailable();

    if (row.disposition === "READY" || row.disposition === "ALREADY_ISSUED") {
      if (!row.studentId || seenCandidates.has(row.studentId)) unavailable();
      seenCandidates.add(row.studentId);
    }
  }
}

function summaryFields(
  record: BatchRecord,
  mapping: { studentNumber: number; email?: number | null },
  rows: BatchPreviewRow[],
) {
  return {
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
    status: record.status,
    expiresAt: record.expiresAt.toISOString(),
    committedAt: record.committedAt?.toISOString() ?? null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    rows,
  };
}

function assertPreviewSnapshot(
  record: BatchRecord,
  mapping: BatchMapping,
  rows: BatchPreviewRow[],
) {
  const parsed = batchPreviewSummarySchema.safeParse({
    ...summaryFields(record, mapping, rows),
    status: "READY",
    committedAt: null,
    issuedCount: 0,
  });
  if (!parsed.success || record.issuedCount !== 0 || parsed.data.readyCount === 0) unavailable();
}

function toCommittedSummary(record: BatchRecord, alreadyCommitted: boolean): BatchCommitSummary {
  const { mapping, rows } = parsedSnapshot(record, true);
  assertRowIntegrity(rows);
  const parsed = batchCommitSummarySchema.safeParse({
    ...summaryFields(record, mapping, rows),
    alreadyCommitted,
  });
  if (!parsed.success) return unavailable();
  return parsed.data;
}

function signerBatchConcurrency(): number {
  const configured = process.env.SIGNER_BATCH_CONCURRENCY;
  if (configured === undefined || configured === "") return defaultSignerBatchConcurrency;
  const parsed = signerBatchConcurrencySchema.safeParse(configured);
  if (!parsed.success) return unavailable();
  return parsed.data;
}

async function mapWithBoundedConcurrency<T, U>(
  items: readonly T[],
  concurrency: number,
  mapper: (item: T) => Promise<U>,
): Promise<U[]> {
  const results = new Array<U>(items.length);
  let nextIndex = 0;
  let firstError: unknown;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (firstError === undefined) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) return;
      try {
        results[index] = await mapper(items[index]!);
      } catch (error) {
        firstError ??= error;
      }
    }
  });
  await Promise.all(workers);
  if (firstError !== undefined) throw firstError;
  return results;
}

async function loadCurrentBatchState(
  tx: Prisma.TransactionClient,
  faculty: Actor,
  batchId: string,
) {
  const record = (await tx.issuanceBatch.findFirst({
    where: { id: batchId, facultyUserId: faculty.id },
    select: batchSelect,
  })) as BatchRecord | null;
  if (!record) throw new BatchNotFoundError();

  const [issuer] = await authoritativeLockingRead(
    tx.$queryRaw<CurrentIssuer[]>(Prisma.sql`
      SELECT id, name, role, status
      FROM users
      WHERE id = ${faculty.id}
      LOCK IN SHARE MODE
    `),
  );
  if (!issuer || issuer.role !== "FACULTY" || issuer.status !== "ACTIVE") {
    throw new AuthorizationError("Issuing Faculty account is no longer active");
  }

  const [classRecord] = await authoritativeLockingRead(
    tx.$queryRaw<CurrentClass[]>(Prisma.sql`
      SELECT id, owner_user_id AS ownerUserId, status
      FROM classes
      WHERE id = ${record.classId}
      LOCK IN SHARE MODE
    `),
  );
  if (!classRecord || classRecord.ownerUserId !== faculty.id || classRecord.status !== "ACTIVE") {
    throw new BatchNotFoundError();
  }

  const [badgeTemplate] = await authoritativeLockingRead(
    tx.$queryRaw<CurrentBadgeTemplate[]>(Prisma.sql`
      SELECT id, class_id AS classId, owner_user_id AS ownerUserId, status
      FROM badge_templates
      WHERE id = ${record.badgeTemplateId}
      LOCK IN SHARE MODE
    `),
  );
  if (
    !badgeTemplate ||
    badgeTemplate.classId !== record.classId ||
    badgeTemplate.ownerUserId !== faculty.id ||
    badgeTemplate.status !== "ACTIVE"
  ) {
    throw new BatchNotFoundError();
  }

  return record;
}

async function validateReadyRows(
  tx: Prisma.TransactionClient,
  record: BatchRecord,
  rows: BatchPreviewRow[],
  withHooks: boolean,
) {
  const readyRows = rows.filter((row) => row.disposition === "READY");
  const readyStudentIds = readyRows.map((row) => row.studentId!);
  const candidateStudentIds = rows
    .filter((row) => row.disposition === "READY" || row.disposition === "ALREADY_ISSUED")
    .map((row) => row.studentId!);

  if (withHooks) await testHooks()?.beforeCurrentStateLocks?.();
  const students = await authoritativeLockingRead(
    tx.$queryRaw<CurrentStudent[]>(Prisma.sql`
      SELECT id, student_number AS studentNumber, first_name AS firstName,
        last_name AS lastName, email
      FROM students
      WHERE id IN (${Prisma.join([...readyStudentIds].sort())})
      ORDER BY id
      LOCK IN SHARE MODE
    `),
  );
  const enrollments = await authoritativeLockingRead(
    tx.$queryRaw<CurrentEnrollment[]>(Prisma.sql`
      SELECT class_id AS classId, student_id AS studentId,
        enrollment_status AS enrollmentStatus
      FROM class_students
      WHERE class_id = ${record.classId}
        AND student_id IN (${Prisma.join([...readyStudentIds].sort())})
      ORDER BY student_id
      LOCK IN SHARE MODE
    `),
  );
  if (withHooks) await testHooks()?.afterCurrentStateLocks?.();

  const studentsById = new Map(students.map((student) => [student.id, student]));
  const enrollmentsByStudentId = new Map(
    enrollments.map((enrollment) => [enrollment.studentId, enrollment]),
  );
  for (const row of readyRows) {
    const student = studentsById.get(row.studentId!);
    const enrollment = enrollmentsByStudentId.get(row.studentId!);
    if (
      !student ||
      !enrollment ||
      enrollment.enrollmentStatus !== "ACTIVE" ||
      student.studentNumber.trim().toLowerCase() !== row.studentNumber.toLowerCase() ||
      (row.emailSupplied !== null &&
        student.email.trim().toLowerCase() !== row.emailSupplied.toLowerCase())
    ) {
      unavailable();
    }
  }

  const existingIssuances = (await tx.badgeIssuance.findMany({
    where: {
      classId: record.classId,
      badgeTemplateId: record.badgeTemplateId,
      studentId: { in: candidateStudentIds },
    },
    select: {
      id: true,
      publicId: true,
      studentId: true,
      status: true,
      supersedesId: true,
      supersededById: true,
    },
  })) as ExistingIssuance[];
  const existingByStudentId = selectCurrentIssuancesByStudentId(existingIssuances);
  for (const row of rows) {
    if (row.disposition === "ALREADY_ISSUED" && !existingByStudentId.has(row.studentId!)) {
      unavailable();
    }
  }
  return { existingByStudentId, readyRows };
}

async function loadPreparationPlan(
  tx: Prisma.TransactionClient,
  faculty: Actor,
  batchId: string,
): Promise<BatchCommitSummary | BatchPreparationPlan> {
  const record = await loadCurrentBatchState(tx, faculty, batchId);
  if (record.status === "COMMITTED") return toCommittedSummary(record, true);
  const claimedAt = new Date();
  const reclaimingExpiredClaim =
    record.status === "SIGNING" &&
    record.signingClaimExpiresAt !== null &&
    record.signingClaimExpiresAt <= claimedAt;
  if ((record.status !== "READY" && !reclaimingExpiredClaim) || record.expiresAt <= claimedAt) {
    unavailable();
  }
  const { mapping, rows } = parsedSnapshot(record, false);
  assertRowIntegrity(rows);
  assertPreviewSnapshot(record, mapping, rows);
  const { existingByStudentId, readyRows } = await validateReadyRows(tx, record, rows, false);
  const claim: BatchSignedIssuanceClaim = {
    batchId: record.id,
    previewFingerprint: record.previewFingerprint,
    claimVersion: record.signingClaimVersion + 1,
    claimToken: randomUUID(),
  };
  const claimExpiresAt = new Date(claimedAt.getTime() + batchClaimLeaseMilliseconds);
  const claimed = await tx.issuanceBatch.updateMany({
    where: {
      id: record.id,
      facultyUserId: faculty.id,
      previewFingerprint: record.previewFingerprint,
      signingClaimVersion: record.signingClaimVersion,
      expiresAt: { gt: claimedAt },
      ...(record.status === "READY"
        ? { status: "READY" as const }
        : {
            status: "SIGNING" as const,
            signingClaimToken: record.signingClaimToken,
            signingClaimExpiresAt: { lte: claimedAt },
          }),
    },
    data: {
      status: "SIGNING",
      signingClaimToken: claim.claimToken,
      signingClaimVersion: { increment: 1 },
      signingClaimExpiresAt: claimExpiresAt,
    },
  });
  if (claimed.count !== 1) unavailable();
  await tx.issuanceTupleReservation.deleteMany({ where: { batchId: record.id } });
  const newRows = readyRows.filter((row) => !existingByStudentId.has(row.studentId!));
  if (newRows.length > 0) {
    await tx.issuanceTupleReservation.createMany({
      data: newRows.map((row) => ({
        classId: record.classId,
        badgeTemplateId: record.badgeTemplateId,
        studentId: row.studentId!,
        facultyUserId: faculty.id,
        claimToken: claim.claimToken,
        batchId: record.id,
        batchPreviewFingerprint: record.previewFingerprint,
        batchClaimVersion: claim.claimVersion,
        expiresAt: claimExpiresAt,
      })),
    });
  }
  return {
    record: {
      ...record,
      status: "SIGNING",
      signingClaimToken: claim.claimToken,
      signingClaimVersion: claim.claimVersion,
      signingClaimExpiresAt: claimExpiresAt,
    },
    rows,
    newRows,
    claim,
  };
}

async function releaseBatchClaim(claim: BatchSignedIssuanceClaim): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.issuanceTupleReservation.deleteMany({
      where: { batchId: claim.batchId, claimToken: claim.claimToken },
    });
    const released = await tx.issuanceBatch.updateMany({
      where: {
        id: claim.batchId,
        status: "SIGNING",
        previewFingerprint: claim.previewFingerprint,
        signingClaimToken: claim.claimToken,
        signingClaimVersion: claim.claimVersion,
      },
      data: {
        status: "READY",
        signingClaimToken: null,
        signingClaimExpiresAt: null,
      },
    });
    if (released.count !== 1) unavailable();
  });
}

function startBatchClaimHeartbeat(
  claim: BatchSignedIssuanceClaim,
  expectedReservationCount: number,
) {
  let heartbeatError: unknown;
  let pending = Promise.resolve();
  const renew = async () => {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + batchClaimLeaseMilliseconds);
    await prisma.$transaction(async (tx) => {
      const batch = await tx.issuanceBatch.updateMany({
        where: {
          id: claim.batchId,
          status: "SIGNING",
          previewFingerprint: claim.previewFingerprint,
          signingClaimToken: claim.claimToken,
          signingClaimVersion: claim.claimVersion,
          signingClaimExpiresAt: { gt: now },
        },
        data: { signingClaimExpiresAt: expiresAt },
      });
      if (batch.count !== 1) unavailable();
      const reservations = await tx.issuanceTupleReservation.updateMany({
        where: { batchId: claim.batchId, claimToken: claim.claimToken },
        data: { expiresAt },
      });
      if (reservations.count !== expectedReservationCount) unavailable();
    });
  };
  const timer = setInterval(() => {
    pending = pending.then(renew).catch((error: unknown) => {
      heartbeatError = error;
    });
  }, batchClaimHeartbeatMilliseconds);
  timer.unref?.();
  return {
    assertOwned() {
      if (heartbeatError) unavailable();
    },
    async stop() {
      clearInterval(timer);
      await pending;
      if (heartbeatError) unavailable();
    },
  };
}

async function commitAttempt(
  tx: Prisma.TransactionClient,
  faculty: Actor,
  batchId: string,
  claim: BatchSignedIssuanceClaim,
  preparedSet: readonly PreparedSignedIssuance[],
): Promise<BatchCommitSummary> {
  const committedAt = new Date();
  await testHooks()?.beforeFinalCommit?.();
  const claimed = await tx.issuanceBatch.updateMany({
    where: {
      id: batchId,
      facultyUserId: faculty.id,
      status: "SIGNING",
      previewFingerprint: claim.previewFingerprint,
      signingClaimToken: claim.claimToken,
      signingClaimVersion: claim.claimVersion,
      signingClaimExpiresAt: { gt: committedAt },
      expiresAt: { gt: committedAt },
    },
    data: {
      signingClaimExpiresAt: new Date(committedAt.getTime() + batchClaimLeaseMilliseconds),
    },
  });
  if (claimed.count !== 1) unavailable();
  const record = await loadCurrentBatchState(tx, faculty, batchId);
  if (
    record.status !== "SIGNING" ||
    record.previewFingerprint !== claim.previewFingerprint ||
    record.signingClaimToken !== claim.claimToken ||
    record.signingClaimVersion !== claim.claimVersion
  ) {
    unavailable();
  }

  const { mapping, rows } = parsedSnapshot(record, false);
  assertRowIntegrity(rows);
  assertPreviewSnapshot(record, mapping, rows);
  const { existingByStudentId, readyRows } = await validateReadyRows(tx, record, rows, true);
  await testHooks()?.afterTuplePrecheck?.();

  const readyStudentIds = new Set(readyRows.map((row) => row.studentId!));
  const preparedByStudentId = new Map<string, PreparedSignedIssuance>();
  for (const prepared of preparedSet) {
    if (
      prepared.classId !== record.classId ||
      prepared.badgeTemplateId !== record.badgeTemplateId ||
      prepared.tupleClaim.batchId !== record.id ||
      prepared.tupleClaim.batchPreviewFingerprint !== record.previewFingerprint ||
      prepared.tupleClaim.batchClaimVersion !== claim.claimVersion ||
      prepared.tupleClaim.claimToken !== claim.claimToken ||
      !readyStudentIds.has(prepared.studentId) ||
      preparedByStudentId.has(prepared.studentId)
    ) {
      unavailable();
    }
    preparedByStudentId.set(prepared.studentId, prepared);
  }
  if ([...preparedByStudentId].some(([studentId]) => existingByStudentId.has(studentId))) {
    unavailable();
  }
  const rowsToCommit = readyRows.filter((row) => !existingByStudentId.has(row.studentId!));
  const artifactsToCommit = rowsToCommit.map((row) => {
    const prepared = preparedByStudentId.get(row.studentId!);
    if (!prepared) return unavailable();
    return prepared;
  });
  const committed = artifactsToCommit.length
    ? await commitPreparedSignedIssuanceSetInTransaction(tx, faculty, artifactsToCommit)
    : [];
  if (committed.some((result) => result.alreadyIssued)) unavailable();
  const committedByStudentId = new Map(
    rowsToCommit.map((row, index) => [row.studentId!, committed[index]!] as const),
  );

  const finalizedRows = rows.map((row): BatchPreviewRow => {
    if (row.disposition !== "READY" && row.disposition !== "ALREADY_ISSUED") return row;
    const existing = existingByStudentId.get(row.studentId!);
    const result = committedByStudentId.get(row.studentId!);
    if (existing) {
      return {
        ...row,
        disposition: "ALREADY_ISSUED",
        message: "Badge already issued.",
        issuanceId: existing.id,
        publicId: existing.publicId,
      };
    }
    if (result?.alreadyIssued) {
      return {
        ...row,
        disposition: "ALREADY_ISSUED",
        message: "Badge already issued.",
        issuanceId: result.issuanceId,
        publicId: result.publicId,
      };
    }
    if (!result) return unavailable();
    return { ...row, issuanceId: result.issuanceId, publicId: result.publicId };
  });
  const issuedCount = finalizedRows.filter((row) => row.disposition === "READY").length;
  const alreadyIssuedCount = finalizedRows.filter(
    (row) => row.disposition === "ALREADY_ISSUED",
  ).length;
  const invalidCount = finalizedRows.length - issuedCount - alreadyIssuedCount;
  const updated = (await tx.issuanceBatch.update({
    where: { id: record.id },
    data: {
      rowsJson: finalizedRows,
      readyCount: issuedCount,
      alreadyIssuedCount,
      invalidCount,
      issuedCount,
      status: "COMMITTED",
      committedAt,
      signingClaimToken: null,
      signingClaimExpiresAt: null,
    },
    select: batchSelect,
  })) as BatchRecord;
  await tx.auditLog.create({
    data: {
      actorUserId: faculty.id,
      action: "badge.batch_committed",
      entityType: "IssuanceBatch",
      entityId: record.id,
      contextJson: {
        batchId: record.id,
        classId: record.classId,
        badgeTemplateId: record.badgeTemplateId,
        issuedCount,
        alreadyIssuedCount,
        invalidCount,
        totalRows: record.totalRows,
      },
    },
  });
  return toCommittedSummary(updated, false);
}

async function commitBatchPreviewWithSigner(
  actor: Actor | null | undefined,
  rawBatchId: string,
  signer?: SignedIssuanceSigner,
): Promise<BatchCommitSummary> {
  const faculty = requireRole(actor, "FACULTY");
  const parsedId = batchIdSchema.safeParse(rawBatchId);
  if (!parsedId.success) throw new BatchNotFoundError();

  await testHooks()?.beforeBatchClaim?.();
  let plan: BatchCommitSummary | BatchPreparationPlan;
  try {
    plan = await prisma.$transaction((tx) => loadPreparationPlan(tx, faculty, parsedId.data));
  } catch (error) {
    if (isTupleReservationConflict(error) || isRetryableMariaDbTransactionError(error)) {
      unavailable();
    }
    throw error;
  }
  if ("alreadyCommitted" in plan) return plan;
  const heartbeat = startBatchClaimHeartbeat(plan.claim, plan.newRows.length);
  let preparedSet: PreparedSignedIssuance[];
  try {
    preparedSet = plan.newRows.length
      ? await mapWithBoundedConcurrency(plan.newRows, signerBatchConcurrency(), (row) => {
          const input = {
            actor: faculty,
            classId: plan.record.classId,
            badgeTemplateId: plan.record.badgeTemplateId,
            studentId: row.studentId!,
            batchClaim: plan.claim,
          };
          return signer
            ? prepareSignedIssuanceForTest(input, signer)
            : prepareSignedIssuance(input);
        })
      : [];
    heartbeat.assertOwned();
  } catch (error) {
    await heartbeat.stop().catch(() => undefined);
    await releaseBatchClaim(plan.claim).catch(() => undefined);
    if (error instanceof SignedIssuanceError) throw new BatchSigningError();
    throw error;
  }

  let tupleConflict: unknown;
  try {
    for (let attempt = 0; attempt < maximumBatchAttempts; attempt += 1) {
      try {
        heartbeat.assertOwned();
        return await prisma.$transaction((tx) =>
          commitAttempt(tx, faculty, parsedId.data, plan.claim, preparedSet),
        );
      } catch (error) {
        if (error instanceof SignedIssuanceError) unavailable();
        if (
          (isTupleUniqueConflict(error) || isRetryableMariaDbTransactionError(error)) &&
          attempt + 1 < maximumBatchAttempts
        ) {
          tupleConflict = error;
          testHooks()?.onTupleConflictRetry?.();
          continue;
        }
        throw error;
      }
    }
    throw tupleConflict;
  } catch (error) {
    await heartbeat.stop().catch(() => undefined);
    await releaseBatchClaim(plan.claim).catch(() => undefined);
    throw error;
  } finally {
    await heartbeat.stop().catch(() => undefined);
  }
}

export function commitBatchPreview(
  actor: Actor | null | undefined,
  rawBatchId: string,
): Promise<BatchCommitSummary> {
  return commitBatchPreviewWithSigner(actor, rawBatchId);
}

export function commitBatchPreviewForTest(
  actor: Actor | null | undefined,
  rawBatchId: string,
  signer: SignedIssuanceSigner,
): Promise<BatchCommitSummary> {
  if (process.env.NODE_ENV !== "test") throw new Error("Test signer injection is unavailable");
  return commitBatchPreviewWithSigner(actor, rawBatchId, signer);
}
