import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";

import { Prisma } from "@prisma/client";
import { z } from "zod";

import {
  AuthorizationError,
  requireClassOwner,
  requireRole,
} from "@/modules/identity/policies/authorization";
import type { Actor } from "@/modules/identity/types";
import type { IssuanceResult } from "@/modules/issuance/types";
import { buildOpenBadgeCredential } from "@/modules/open-badges/credential-builder";
import {
  CanonicalResourceUrlSchema,
  SignedOpenBadgeCredentialSchema,
  type SignedOpenBadgeCredential,
} from "@/modules/open-badges/credential-schema";
import { enqueueIssuedNotification } from "@/modules/notifications/services/notification-outbox";
import { getIssuerPresentation } from "@/modules/settings/services/system-settings-service";
import {
  signCredential as signCredentialWithClient,
  SignerClientError,
  verifyCredential as verifyCredentialWithClient,
} from "@/modules/signing/signer-client";
import { prisma } from "@/platform/db/prisma";

import {
  buildCredentialSnapshots,
  calculateExpiresAt,
  generatePublicId,
  type CredentialSnapshots,
} from "./credential-snapshot";
import { reserveUnassignedStatusAllocation } from "./status-allocation-service";
import {
  AchievementSnapshotSchema,
  IssuerSnapshotSchema,
  OpenBadgeCredentialSnapshotSchema,
  RecipientSnapshotSchema,
} from "./snapshot-schemas";
import { selectCurrentIssuance } from "./current-issuance-selector";

const identifierSchema = z
  .string()
  .trim()
  .min(1)
  .max(191)
  .regex(/^[A-Za-z0-9_-]+$/);

const issueBadgeInputSchema = z
  .object({
    classId: identifierSchema,
    badgeTemplateId: identifierSchema,
    studentId: identifierSchema,
  })
  .strict();

const batchSignedIssuanceClaimSchema = z
  .object({
    batchId: identifierSchema,
    previewFingerprint: z.string().regex(/^[0-9a-f]{64}$/),
    claimVersion: z.number().int().positive(),
    claimToken: z.uuid(),
  })
  .strict();

const serializerVersion = 1;
const maximumPublicIdAttempts = 3;
const maximumCommitAttempts = 3;
const minimumSignedStatusListCapacity = 131_072;
const issuanceClaimLeaseMilliseconds = 5 * 60 * 1_000;
const tupleReservationPollAttempts = 80;
const tupleReservationPollMilliseconds = 25;
const issuanceTestHookKey = Symbol.for("hau-soc-badging.issuance-test-hooks");
declare const preparedIssuanceBrand: unique symbol;

const credentialSnapshotsSchema = z
  .object({
    recipient: RecipientSnapshotSchema,
    achievement: AchievementSnapshotSchema,
    issuer: IssuerSnapshotSchema,
    credential: OpenBadgeCredentialSnapshotSchema,
  })
  .strict();

const preparedSignedIssuanceSchema = z
  .object({
    actorId: identifierSchema,
    classId: identifierSchema,
    badgeTemplateId: identifierSchema,
    studentId: identifierSchema,
    publicId: z.string().regex(/^[A-Za-z0-9_-]{32}$/),
    issuedAt: z.iso.datetime({ offset: false }),
    snapshots: credentialSnapshotsSchema,
    signedDocument: SignedOpenBadgeCredentialSchema,
    signingKey: z
      .object({
        id: identifierSchema,
        verificationMethodUrl: CanonicalResourceUrlSchema,
        controllerUrl: CanonicalResourceUrlSchema,
        algorithm: z.literal("Ed25519"),
        cryptosuite: z.literal("eddsa-rdfc-2022"),
      })
      .strict(),
    signingKeyId: identifierSchema,
    serializerVersion: z.literal(serializerVersion),
    statusReservation: z
      .object({
        listId: identifierSchema,
        index: z.number().int().nonnegative().safe(),
        statusUrl: CanonicalResourceUrlSchema,
      })
      .strict(),
    tupleClaim: z
      .object({
        claimToken: z.uuid(),
        expiresAt: z.iso.datetime({ offset: false }),
        batchId: identifierSchema.nullable(),
        batchPreviewFingerprint: z
          .string()
          .regex(/^[0-9a-f]{64}$/)
          .nullable(),
        batchClaimVersion: z.number().int().positive().nullable(),
      })
      .strict(),
    correlationId: z.uuid(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.signingKeyId !== value.signingKey.id) {
      context.addIssue({
        code: "custom",
        path: ["signingKeyId"],
        message: "Signing key identifiers must match",
      });
    }
  });

const preparedArtifactSeals = new WeakMap<object, string>();

export const SIGNER_UNAVAILABLE_MESSAGE =
  "Credential signing is temporarily unavailable. No badge was issued. Try again.";

type IssuanceTestHooks = {
  beforeActorLock?: (tx: Prisma.TransactionClient) => Promise<void>;
  afterTuplePrecheck?: () => Promise<void>;
  onCommitRetry?: () => void;
  onTupleConflictRecovery?: () => void;
};

type BadgeMetadata = {
  skills: string[];
  alignment?: Array<{ targetName: string; targetUrl: string }>;
};

type IssuanceClass = {
  id: string;
  ownerUserId: string;
  status: "ACTIVE" | "ARCHIVED";
  courseCode: string;
  title: string;
  section: string;
  term: string;
  academicYear: string;
};

type IssuanceBadgeTemplate = {
  id: string;
  classId: string;
  ownerUserId: string;
  status: "ACTIVE" | "ARCHIVED";
  name: string;
  description: string;
  criteria: string;
  imagePath: string;
  metadataJson: Prisma.JsonValue | null;
  expiresAfterDays: number | null;
  updatedAt: Date;
};

type IssuanceStudent = {
  id: string;
  studentNumber: string;
  firstName: string;
  lastName: string;
  email: string;
};

type IssuanceEnrollment = {
  classId: string;
  studentId: string;
  enrollmentStatus: "ACTIVE" | "REMOVED";
  student: IssuanceStudent;
};

type IssuanceIssuer = {
  id: string;
  name: string;
  role: "FACULTY" | "ADMIN";
  status: "ACTIVE" | "SUSPENDED" | "DELETED";
  deletedAt?: Date | null;
};

type IssuerSettings = {
  issuerName: string | null;
  issuerUrl: string | null;
  issuerLogoPath: string | null;
  supportContact: string | null;
  sharingEnabled: boolean | number;
};

type IssuanceSigningKey = {
  id: string;
  verificationMethodUrl: string;
  controllerUrl: string;
  algorithm: string;
  cryptosuite: string;
  status: "ACTIVE" | "RETIRED" | "COMPROMISED";
  compromisedAt: Date | null;
};

type LockedStatusList = {
  id: string;
  publicUrl: string;
  purpose: string;
  capacity: number;
  nextIndex: number;
};

type ExistingIssuance = {
  id: string;
  publicId: string;
  status: "ACTIVE" | "REVOKED" | "EXPIRED";
  supersedesId: string | null;
  supersededById: string | null;
};

type LockedTupleClaim = {
  claimToken: string;
  facultyUserId: string;
  batchId: string | null;
  batchPreviewFingerprint: string | null;
  batchClaimVersion: number | null;
};

export type SignedIssuanceSigner = {
  signCredential(document: unknown, correlationId: string): Promise<unknown>;
  verifyCredential(
    document: unknown,
    correlationId: string,
  ): Promise<{
    outcome: "VERIFIED" | "INVALID_PROOF" | "VERIFICATION_UNAVAILABLE";
    keyId?: string;
  }>;
};

export type PrepareSignedIssuanceInput = {
  actor: Actor;
  classId: string;
  badgeTemplateId: string;
  studentId: string;
  batchClaim?: BatchSignedIssuanceClaim;
};

export type BatchSignedIssuanceClaim = {
  batchId: string;
  previewFingerprint: string;
  claimVersion: number;
  claimToken: string;
};

export type PreparedSignedIssuance = Readonly<z.output<typeof preparedSignedIssuanceSchema>> & {
  readonly [preparedIssuanceBrand]: true;
};

export class SignedIssuanceError extends Error {
  constructor(
    public readonly retryable: boolean,
    public readonly correlationId: string,
  ) {
    super(
      retryable
        ? SIGNER_UNAVAILABLE_MESSAGE
        : `Credential signing could not be validated. No badge was issued. Reference: ${correlationId}.`,
    );
    this.name = "SignedIssuanceError";
  }
}

class ExistingIssuanceError extends Error {
  constructor(public readonly issuance: ExistingIssuance) {
    super("Credential was already issued");
    this.name = "ExistingIssuanceError";
  }
}

class IssuanceTupleReservedError extends Error {
  constructor() {
    super("Issuance tuple is already reserved");
    this.name = "IssuanceTupleReservedError";
  }
}

const defaultSigner: SignedIssuanceSigner = {
  signCredential: signCredentialWithClient,
  verifyCredential: verifyCredentialWithClient,
};

const classSelect = {
  id: true,
  ownerUserId: true,
  status: true,
  courseCode: true,
  title: true,
  section: true,
  term: true,
  academicYear: true,
} as const;

const badgeSelect = {
  id: true,
  classId: true,
  ownerUserId: true,
  status: true,
  name: true,
  description: true,
  criteria: true,
  imagePath: true,
  metadataJson: true,
  expiresAfterDays: true,
  updatedAt: true,
} as const;

const issuerSettingSelect = {
  issuerName: true,
  issuerUrl: true,
  issuerLogoPath: true,
  supportContact: true,
  sharingEnabled: true,
} as const;

function invalidIssuance(correlationId: string): SignedIssuanceError {
  return new SignedIssuanceError(false, correlationId);
}

function testHooks(): IssuanceTestHooks | undefined {
  if (process.env.NODE_ENV !== "test") return undefined;
  return (globalThis as typeof globalThis & { [key: symbol]: unknown })[issuanceTestHookKey] as
    IssuanceTestHooks | undefined;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const item of Object.values(value)) deepFreeze(item);
  }
  return value;
}

function preparedArtifactDigest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function sealPreparedArtifact(
  rawArtifact: z.input<typeof preparedSignedIssuanceSchema>,
): PreparedSignedIssuance {
  const artifact = deepFreeze(preparedSignedIssuanceSchema.parse(rawArtifact));
  preparedArtifactSeals.set(artifact, preparedArtifactDigest(artifact));
  return artifact as PreparedSignedIssuance;
}

function readPreparedArtifact(rawArtifact: unknown): PreparedSignedIssuance {
  const parsed = preparedSignedIssuanceSchema.safeParse(rawArtifact);
  if (!parsed.success || !rawArtifact || typeof rawArtifact !== "object") {
    throw invalidIssuance(randomUUID());
  }
  const seal = preparedArtifactSeals.get(rawArtifact);
  if (!seal || seal !== preparedArtifactDigest(rawArtifact)) {
    throw invalidIssuance(randomUUID());
  }
  return rawArtifact as PreparedSignedIssuance;
}

function isRetryableMariaDbTransactionError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as {
    code?: unknown;
    message?: unknown;
    meta?: {
      code?: unknown;
      driverAdapterError?: { cause?: { code?: unknown; originalCode?: unknown } };
    };
  };
  if (candidate.code === "P2034") return true;
  if (
    candidate.code === "P2039" &&
    typeof candidate.message === "string" &&
    /Database error\. Code: `(1020|1213)`\./.test(candidate.message)
  ) {
    return true;
  }
  if (candidate.code !== "P2010") return false;
  const databaseCode = String(
    candidate.meta?.code ??
      candidate.meta?.driverAdapterError?.cause?.originalCode ??
      candidate.meta?.driverAdapterError?.cause?.code,
  );
  return databaseCode === "1020" || databaseCode === "1213";
}

function requireCurrentFaculty(actor: Actor, issuer: IssuanceIssuer | null): IssuanceIssuer {
  if (
    !issuer ||
    issuer.id !== actor.id ||
    issuer.role !== "FACULTY" ||
    issuer.status !== "ACTIVE" ||
    issuer.deletedAt != null
  ) {
    throw new AuthorizationError("Authorized account is no longer active");
  }
  return issuer;
}

function readBadgeMetadata(value: Prisma.JsonValue | null): BadgeMetadata {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { skills: [] };
  const metadata = value as { skills?: unknown; alignment?: unknown };
  const skills = Array.isArray(metadata.skills)
    ? metadata.skills.filter((skill): skill is string => typeof skill === "string")
    : [];
  const alignmentSource = Array.isArray(metadata.alignment)
    ? metadata.alignment
    : metadata.alignment
      ? [metadata.alignment]
      : [];
  const alignment = alignmentSource.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const candidate = item as {
      name?: unknown;
      targetName?: unknown;
      targetUrl?: unknown;
      url?: unknown;
    };
    const targetName =
      typeof candidate.targetName === "string" ? candidate.targetName : candidate.name;
    const targetUrl = typeof candidate.targetUrl === "string" ? candidate.targetUrl : candidate.url;
    return typeof targetName === "string" && typeof targetUrl === "string"
      ? [{ targetName, targetUrl }]
      : [];
  });
  return alignment.length ? { skills, alignment } : { skills };
}

function assertCurrentSource(
  actor: Actor,
  classRecord: IssuanceClass | null,
  issuer: IssuanceIssuer | null,
  badgeTemplate: IssuanceBadgeTemplate | null,
  enrollment: IssuanceEnrollment | null,
): void {
  if (!classRecord) throw new Error("Class not found");
  requireClassOwner(actor, classRecord.ownerUserId);
  if (classRecord.status !== "ACTIVE") throw new Error("Class is not active");
  if (
    !issuer ||
    issuer.role !== "FACULTY" ||
    issuer.status !== "ACTIVE" ||
    issuer.deletedAt != null
  ) {
    throw new Error("Issuing Faculty account is no longer active");
  }
  if (!badgeTemplate) throw new Error("Badge template not found");
  if (badgeTemplate.classId !== classRecord.id) {
    throw new Error("Badge template is not available for this class");
  }
  if (badgeTemplate.ownerUserId !== actor.id) {
    throw new Error("Badge template is not owned by this Faculty member");
  }
  if (badgeTemplate.status !== "ACTIVE") throw new Error("Badge template is not active");
  if (!enrollment || enrollment.enrollmentStatus !== "ACTIVE") {
    throw new Error("Student is not actively enrolled in this class");
  }
}

function buildSnapshots(input: {
  publicId: string;
  issuedAt: Date;
  classRecord: IssuanceClass;
  badgeTemplate: IssuanceBadgeTemplate;
  enrollment: IssuanceEnrollment;
  issuer: IssuanceIssuer;
  settings: IssuerSettings | null;
}): CredentialSnapshots {
  const metadata = readBadgeMetadata(input.badgeTemplate.metadataJson);
  return buildCredentialSnapshots({
    publicId: input.publicId,
    issuedAt: input.issuedAt,
    expiresAt: calculateExpiresAt(input.issuedAt, input.badgeTemplate.expiresAfterDays),
    recipient: {
      studentId: input.enrollment.student.id,
      studentNumber: input.enrollment.student.studentNumber,
      displayName: `${input.enrollment.student.firstName} ${input.enrollment.student.lastName}`,
      firstName: input.enrollment.student.firstName,
      lastName: input.enrollment.student.lastName,
      email: input.enrollment.student.email,
    },
    achievement: {
      badgeTemplateId: input.badgeTemplate.id,
      name: input.badgeTemplate.name,
      description: input.badgeTemplate.description,
      criteria: input.badgeTemplate.criteria,
      imagePath: input.badgeTemplate.imagePath,
      skills: metadata.skills,
      ...(metadata.alignment ? { alignment: metadata.alignment } : {}),
      templateUpdatedAt: input.badgeTemplate.updatedAt,
      class: {
        id: input.classRecord.id,
        courseCode: input.classRecord.courseCode,
        title: input.classRecord.title,
        section: input.classRecord.section,
        term: input.classRecord.term,
        academicYear: input.classRecord.academicYear,
      },
      expiresAfterDays: input.badgeTemplate.expiresAfterDays,
    },
    issuer: { issuerUserId: input.issuer.id, issuerUserName: input.issuer.name },
    issuerPresentation: getIssuerPresentation(
      input.settings
        ? {
            ...input.settings,
            sharingEnabled:
              input.settings.sharingEnabled === true || input.settings.sharingEnabled === 1,
          }
        : null,
    ),
  });
}

function hasExactP2002Target(
  error: unknown,
  allowedTargets: readonly (readonly string[] | string)[],
): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as {
    code?: unknown;
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

function isPublicIdUniqueConflict(error: unknown): boolean {
  return hasExactP2002Target(error, [
    ["publicId"],
    ["public_id"],
    "BadgeIssuance_publicId_key",
    "public_id",
    "badge_issuances_public_id_key",
  ]);
}

function isIssuanceTupleReservationConflict(error: unknown): boolean {
  return hasExactP2002Target(error, [
    ["classId", "badgeTemplateId", "studentId"],
    ["class_id", "badge_template_id", "student_id"],
    "issuance_tuple_reservations_tuple_key",
  ]);
}

async function loadPreparationSource(
  tx: Prisma.TransactionClient,
  actor: Actor,
  input: z.output<typeof issueBadgeInputSchema>,
  batchClaim: BatchSignedIssuanceClaim | null,
) {
  const classRecord = await tx.class.findUnique({
    where: { id: input.classId },
    select: classSelect,
  });
  if (!classRecord) throw new Error("Class not found");
  requireClassOwner(actor, classRecord.ownerUserId);
  if (classRecord.status !== "ACTIVE") throw new Error("Class is not active");

  const issuer = await tx.user.findUnique({
    where: { id: actor.id, role: "FACULTY", status: "ACTIVE" },
    select: { id: true, name: true, role: true, status: true, deletedAt: true },
  });
  const badgeTemplate = await tx.badgeTemplate.findUnique({
    where: { id: input.badgeTemplateId },
    select: badgeSelect,
  });
  const enrollment = await tx.classStudent.findUnique({
    where: { classId_studentId: { classId: input.classId, studentId: input.studentId } },
    include: { student: true },
  });
  assertCurrentSource(actor, classRecord, issuer, badgeTemplate, enrollment);
  if (!issuer || !badgeTemplate || !enrollment) {
    throw new Error("Issuance source is unavailable");
  }

  const existingBeforeReservation = selectCurrentIssuance(
    await tx.badgeIssuance.findMany({
      where: {
        classId: input.classId,
        badgeTemplateId: input.badgeTemplateId,
        studentId: input.studentId,
      },
      select: {
        id: true,
        publicId: true,
        status: true,
        supersedesId: true,
        supersededById: true,
      },
    }),
  );
  if (existingBeforeReservation) throw new ExistingIssuanceError(existingBeforeReservation);

  const settings = await tx.systemSetting.findUnique({
    where: { id: "default" },
    select: issuerSettingSelect,
  });
  const signingKeys = await tx.signingKey.findMany({
    where: { status: "ACTIVE", compromisedAt: null },
    orderBy: [{ activatedAt: "desc" }, { id: "asc" }],
    take: 2,
    select: {
      id: true,
      verificationMethodUrl: true,
      controllerUrl: true,
      algorithm: true,
      cryptosuite: true,
      status: true,
      compromisedAt: true,
    },
  });
  if (signingKeys.length !== 1 || !signingKeys[0])
    throw new Error("One active signing key is required");
  const signingKey = signingKeys[0];
  if (signingKey.algorithm !== "Ed25519" || signingKey.cryptosuite !== "eddsa-rdfc-2022") {
    throw new Error("Active signing key is unsupported");
  }
  const now = new Date();
  let tupleClaim;
  if (batchClaim) {
    const reserved = await tx.issuanceTupleReservation.findUnique({
      where: {
        classId_badgeTemplateId_studentId: {
          classId: input.classId,
          badgeTemplateId: input.badgeTemplateId,
          studentId: input.studentId,
        },
      },
    });
    if (
      !reserved ||
      reserved.facultyUserId !== actor.id ||
      reserved.claimToken !== batchClaim.claimToken ||
      reserved.batchId !== batchClaim.batchId ||
      reserved.batchPreviewFingerprint !== batchClaim.previewFingerprint ||
      reserved.batchClaimVersion !== batchClaim.claimVersion ||
      reserved.expiresAt <= now
    ) {
      throw new Error("Issuance tuple reservation is unavailable");
    }
    tupleClaim = reserved;
  } else {
    await tx.issuanceTupleReservation.deleteMany({
      where: {
        classId: input.classId,
        badgeTemplateId: input.badgeTemplateId,
        studentId: input.studentId,
        expiresAt: { lte: now },
      },
    });
    tupleClaim = await tx.issuanceTupleReservation.create({
      data: {
        classId: input.classId,
        badgeTemplateId: input.badgeTemplateId,
        studentId: input.studentId,
        facultyUserId: actor.id,
        claimToken: randomUUID(),
        expiresAt: new Date(now.getTime() + issuanceClaimLeaseMilliseconds),
      },
    });
  }
  const existing = selectCurrentIssuance(
    await tx.$queryRaw<ExistingIssuance[]>(Prisma.sql`
    SELECT id, public_id AS publicId, status,
      supersedes_id AS supersedesId, superseded_by_id AS supersededById
    FROM badge_issuances
    WHERE class_id = ${input.classId}
      AND badge_template_id = ${input.badgeTemplateId}
      AND student_id = ${input.studentId}
    FOR UPDATE
  `),
  );
  if (existing) throw new ExistingIssuanceError(existing);
  return { classRecord, issuer, badgeTemplate, enrollment, settings, signingKey, tupleClaim };
}

async function prepareSignedIssuanceWithSigner(
  rawInput: PrepareSignedIssuanceInput,
  signer: SignedIssuanceSigner,
): Promise<PreparedSignedIssuance> {
  const actor = requireRole(rawInput.actor, "FACULTY");
  const input = issueBadgeInputSchema.parse({
    classId: rawInput.classId,
    badgeTemplateId: rawInput.badgeTemplateId,
    studentId: rawInput.studentId,
  });
  const batchClaim = rawInput.batchClaim
    ? batchSignedIssuanceClaimSchema.parse(rawInput.batchClaim)
    : null;
  const correlationId = randomUUID();
  const issuedAt = new Date();
  const publicId = generatePublicId();
  let preparedSource: Awaited<ReturnType<typeof loadPreparationSource>> | undefined;
  for (let attempt = 0; attempt < maximumCommitAttempts; attempt += 1) {
    try {
      preparedSource = await prisma.$transaction((tx) =>
        loadPreparationSource(tx, actor, input, batchClaim),
      );
      break;
    } catch (error) {
      if (isIssuanceTupleReservationConflict(error)) throw new IssuanceTupleReservedError();
      if (isRetryableMariaDbTransactionError(error)) {
        if (attempt + 1 < maximumCommitAttempts) continue;
        if (!batchClaim) throw new IssuanceTupleReservedError();
      }
      throw error;
    }
  }
  if (!preparedSource) throw new Error("Issuance source is unavailable");

  try {
    // This separate short transaction makes the status-list locking read its first data access.
    // MariaDB repeatable-read can otherwise raise error 1020 after a concurrent cursor advance.
    const statusReservation = await prisma.$transaction((tx) =>
      reserveUnassignedStatusAllocation(tx),
    );
    const { snapshots, unsigned } = (() => {
      try {
        const currentSnapshots = buildSnapshots({
          publicId,
          issuedAt,
          classRecord: preparedSource.classRecord,
          badgeTemplate: preparedSource.badgeTemplate,
          enrollment: preparedSource.enrollment,
          issuer: preparedSource.issuer,
          settings: preparedSource.settings,
        });
        return {
          snapshots: currentSnapshots,
          unsigned: buildOpenBadgeCredential({
            snapshot: currentSnapshots.credential,
            recipientEmail: currentSnapshots.recipient.email,
            signingKey: preparedSource.signingKey,
            statusAllocation: statusReservation,
          }),
        };
      } catch {
        throw invalidIssuance(correlationId);
      }
    })();

    let signed: SignedOpenBadgeCredential;
    try {
      signed = SignedOpenBadgeCredentialSchema.parse(
        await signer.signCredential(deepFreeze(structuredClone(unsigned)), correlationId),
      );
      const { proof, ...signedPayload } = signed;
      if (
        !isDeepStrictEqual(signedPayload, unsigned) ||
        proof.verificationMethod !== preparedSource.signingKey.verificationMethodUrl
      ) {
        throw invalidIssuance(correlationId);
      }
      const verification = await signer.verifyCredential(signed, correlationId);
      if (verification.outcome === "VERIFICATION_UNAVAILABLE") {
        throw new SignedIssuanceError(true, correlationId);
      }
      if (
        verification.outcome !== "VERIFIED" ||
        verification.keyId !== preparedSource.signingKey.verificationMethodUrl
      ) {
        throw invalidIssuance(correlationId);
      }
    } catch (error) {
      if (error instanceof SignedIssuanceError) throw error;
      if (error instanceof SignerClientError && error.code !== "SIGNER_UNAVAILABLE") {
        throw invalidIssuance(correlationId);
      }
      if (error instanceof z.ZodError) throw invalidIssuance(correlationId);
      throw new SignedIssuanceError(true, correlationId);
    }

    return sealPreparedArtifact({
      actorId: actor.id,
      classId: input.classId,
      badgeTemplateId: input.badgeTemplateId,
      studentId: input.studentId,
      publicId,
      issuedAt: issuedAt.toISOString(),
      snapshots: structuredClone(snapshots),
      signedDocument: structuredClone(signed),
      signingKey: {
        id: preparedSource.signingKey.id,
        verificationMethodUrl: preparedSource.signingKey.verificationMethodUrl,
        controllerUrl: preparedSource.signingKey.controllerUrl,
        algorithm: "Ed25519",
        cryptosuite: "eddsa-rdfc-2022",
      },
      signingKeyId: preparedSource.signingKey.id,
      serializerVersion,
      statusReservation: structuredClone(statusReservation),
      tupleClaim: {
        claimToken: preparedSource.tupleClaim.claimToken,
        expiresAt: preparedSource.tupleClaim.expiresAt.toISOString(),
        batchId: preparedSource.tupleClaim.batchId,
        batchPreviewFingerprint: preparedSource.tupleClaim.batchPreviewFingerprint,
        batchClaimVersion: preparedSource.tupleClaim.batchClaimVersion,
      },
      correlationId,
    });
  } catch (error) {
    if (!batchClaim) {
      await prisma.issuanceTupleReservation.deleteMany({
        where: { claimToken: preparedSource.tupleClaim.claimToken },
      });
    }
    throw error;
  }
}

export function prepareSignedIssuance(
  rawInput: PrepareSignedIssuanceInput,
): Promise<PreparedSignedIssuance> {
  return prepareSignedIssuanceWithSigner(rawInput, defaultSigner);
}

export function prepareSignedIssuanceForTest(
  rawInput: PrepareSignedIssuanceInput,
  signer: SignedIssuanceSigner,
): Promise<PreparedSignedIssuance> {
  if (process.env.NODE_ENV !== "test") throw new Error("Test signer injection is unavailable");
  return prepareSignedIssuanceWithSigner(rawInput, signer);
}

async function lockCommitSource(
  tx: Prisma.TransactionClient,
  actor: Actor,
  prepared: PreparedSignedIssuance,
) {
  // Global issuance lock order: actor -> issuance tuple -> class -> badge -> enrollment/student ->
  // settings -> status list -> active signing-key set -> status allocation. The shared suffix
  // matches status-list regeneration (list -> key -> allocation), while the prefix matches
  // revocation (actor -> issuance -> class).
  await testHooks()?.beforeActorLock?.(tx);
  const [lockedIssuer] = await tx.$queryRaw<IssuanceIssuer[]>(Prisma.sql`
    SELECT id, name, role, status, deleted_at AS deletedAt
    FROM users WHERE id = ${actor.id} FOR UPDATE
  `);
  const issuer = requireCurrentFaculty(actor, lockedIssuer ?? null);

  const [tupleClaim] = await tx.$queryRaw<LockedTupleClaim[]>(Prisma.sql`
    SELECT claim_token AS claimToken, faculty_user_id AS facultyUserId,
      batch_id AS batchId, batch_preview_fingerprint AS batchPreviewFingerprint,
      batch_claim_version AS batchClaimVersion
    FROM issuance_tuple_reservations
    WHERE class_id = ${prepared.classId}
      AND badge_template_id = ${prepared.badgeTemplateId}
      AND student_id = ${prepared.studentId}
      AND expires_at > CURRENT_TIMESTAMP(3)
    FOR UPDATE
  `);
  if (
    !tupleClaim ||
    tupleClaim.claimToken !== prepared.tupleClaim.claimToken ||
    tupleClaim.facultyUserId !== actor.id ||
    tupleClaim.batchId !== prepared.tupleClaim.batchId ||
    tupleClaim.batchPreviewFingerprint !== prepared.tupleClaim.batchPreviewFingerprint ||
    tupleClaim.batchClaimVersion !== prepared.tupleClaim.batchClaimVersion
  ) {
    throw invalidIssuance(prepared.correlationId);
  }

  const existing = selectCurrentIssuance(
    await tx.$queryRaw<ExistingIssuance[]>(Prisma.sql`
    SELECT id, public_id AS publicId, status,
      supersedes_id AS supersedesId, superseded_by_id AS supersededById
    FROM badge_issuances
    WHERE class_id = ${prepared.classId}
      AND badge_template_id = ${prepared.badgeTemplateId}
      AND student_id = ${prepared.studentId}
    FOR UPDATE
  `),
  );

  const [classRecord] = await tx.$queryRaw<IssuanceClass[]>(Prisma.sql`
    SELECT id, owner_user_id AS ownerUserId, status, course_code AS courseCode, title,
      section, term, academic_year AS academicYear
    FROM classes WHERE id = ${prepared.classId} FOR UPDATE
  `);
  if (!classRecord) throw invalidIssuance(prepared.correlationId);
  requireClassOwner(actor, classRecord.ownerUserId);
  if (classRecord.status !== "ACTIVE") throw invalidIssuance(prepared.correlationId);

  const [badgeTemplate] = await tx.$queryRaw<IssuanceBadgeTemplate[]>(Prisma.sql`
    SELECT id, class_id AS classId, owner_user_id AS ownerUserId, status, name, description,
      criteria, image_path AS imagePath, metadata_json AS metadataJson,
      expires_after_days AS expiresAfterDays, updated_at AS updatedAt
    FROM badge_templates WHERE id = ${prepared.badgeTemplateId} FOR UPDATE
  `);
  if (!badgeTemplate || badgeTemplate.classId !== classRecord.id) {
    throw invalidIssuance(prepared.correlationId);
  }
  requireClassOwner(actor, badgeTemplate.ownerUserId);
  if (badgeTemplate.status !== "ACTIVE") throw invalidIssuance(prepared.correlationId);

  const [lockedEnrollment] = await tx.$queryRaw<
    Array<{
      classId: string;
      studentId: string;
      enrollmentStatus: "ACTIVE" | "REMOVED";
      studentNumber: string;
      firstName: string;
      lastName: string;
      email: string;
    }>
  >(Prisma.sql`
    SELECT cs.class_id AS classId, cs.student_id AS studentId,
      cs.enrollment_status AS enrollmentStatus, s.student_number AS studentNumber,
      s.first_name AS firstName, s.last_name AS lastName, s.email
    FROM class_students cs
    INNER JOIN students s ON s.id = cs.student_id
    WHERE cs.class_id = ${prepared.classId} AND cs.student_id = ${prepared.studentId}
    FOR UPDATE
  `);
  const enrollment = lockedEnrollment
    ? {
        classId: lockedEnrollment.classId,
        studentId: lockedEnrollment.studentId,
        enrollmentStatus: lockedEnrollment.enrollmentStatus,
        student: {
          id: lockedEnrollment.studentId,
          studentNumber: lockedEnrollment.studentNumber,
          firstName: lockedEnrollment.firstName,
          lastName: lockedEnrollment.lastName,
          email: lockedEnrollment.email,
        },
      }
    : null;
  if (!enrollment || enrollment.enrollmentStatus !== "ACTIVE") {
    throw invalidIssuance(prepared.correlationId);
  }

  await tx.$executeRaw(Prisma.sql`
    INSERT INTO system_settings (id, sharing_enabled, created_at, updated_at)
    VALUES ('default', TRUE, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))
    ON DUPLICATE KEY UPDATE id = id
  `);
  const [settings] = await tx.$queryRaw<IssuerSettings[]>(Prisma.sql`
    SELECT issuer_name AS issuerName, issuer_url AS issuerUrl,
      issuer_logo_path AS issuerLogoPath, support_contact AS supportContact,
      sharing_enabled AS sharingEnabled
    FROM system_settings WHERE id = 'default' FOR UPDATE
  `);
  if (!settings) throw invalidIssuance(prepared.correlationId);
  return { classRecord, issuer, badgeTemplate, enrollment, settings, existing: existing ?? null };
}

async function lockAndValidateCommitInvariants(
  tx: Prisma.TransactionClient,
  prepared: PreparedSignedIssuance,
  source: Awaited<ReturnType<typeof lockCommitSource>>,
) {
  const [statusList] = await tx.$queryRaw<LockedStatusList[]>(Prisma.sql`
    SELECT id, public_url AS publicUrl, purpose, capacity, next_index AS nextIndex
    FROM credential_status_lists
    WHERE id = ${prepared.statusReservation.listId}
    FOR UPDATE
  `);
  if (
    !statusList ||
    statusList.publicUrl !== prepared.statusReservation.statusUrl ||
    statusList.purpose !== "revocation" ||
    statusList.capacity < minimumSignedStatusListCapacity ||
    prepared.statusReservation.index < 0 ||
    prepared.statusReservation.index >= statusList.capacity ||
    prepared.statusReservation.index >= statusList.nextIndex
  ) {
    throw invalidIssuance(prepared.correlationId);
  }

  const signingKeys = await tx.$queryRaw<IssuanceSigningKey[]>(Prisma.sql`
    SELECT id, verification_method_url AS verificationMethodUrl,
      controller_url AS controllerUrl, algorithm, cryptosuite, status,
      compromised_at AS compromisedAt
    FROM signing_keys
    WHERE status = 'ACTIVE' AND compromised_at IS NULL
    ORDER BY activated_at DESC, id ASC
    LIMIT 2
    FOR UPDATE
  `);
  const signingKey = signingKeys[0];
  if (
    signingKeys.length !== 1 ||
    !signingKey ||
    signingKey.id !== prepared.signingKeyId ||
    signingKey.verificationMethodUrl !== prepared.signingKey.verificationMethodUrl ||
    signingKey.controllerUrl !== prepared.signingKey.controllerUrl ||
    signingKey.algorithm !== "Ed25519" ||
    signingKey.cryptosuite !== "eddsa-rdfc-2022" ||
    signingKey.status !== "ACTIVE" ||
    signingKey.compromisedAt !== null
  ) {
    throw invalidIssuance(prepared.correlationId);
  }

  const occupied = await tx.credentialStatusAllocation.findUnique({
    where: {
      statusListId_index: {
        statusListId: prepared.statusReservation.listId,
        index: prepared.statusReservation.index,
      },
    },
    select: { id: true },
  });
  if (occupied) throw invalidIssuance(prepared.correlationId);

  try {
    const issuedAt = new Date(prepared.issuedAt);
    const currentSnapshots = buildSnapshots({
      publicId: prepared.publicId,
      issuedAt,
      classRecord: source.classRecord,
      badgeTemplate: source.badgeTemplate,
      enrollment: source.enrollment,
      issuer: source.issuer,
      settings: source.settings,
    });
    if (!isDeepStrictEqual(currentSnapshots, prepared.snapshots)) {
      throw invalidIssuance(prepared.correlationId);
    }
    const expectedUnsigned = buildOpenBadgeCredential({
      snapshot: currentSnapshots.credential,
      recipientEmail: currentSnapshots.recipient.email,
      signingKey,
      statusAllocation: prepared.statusReservation,
    });
    const signed = SignedOpenBadgeCredentialSchema.parse(prepared.signedDocument);
    const { proof, ...signedPayload } = signed;
    if (
      proof.verificationMethod !== signingKey.verificationMethodUrl ||
      !isDeepStrictEqual(signedPayload, expectedUnsigned)
    ) {
      throw invalidIssuance(prepared.correlationId);
    }
    const expiresAt = currentSnapshots.credential.validUntil
      ? new Date(currentSnapshots.credential.validUntil)
      : null;
    return { currentSnapshots, expiresAt, signed };
  } catch {
    throw invalidIssuance(prepared.correlationId);
  }
}

async function commitPreparedAttempt(
  tx: Prisma.TransactionClient,
  actor: Actor,
  prepared: PreparedSignedIssuance,
): Promise<IssuanceResult> {
  const source = await lockCommitSource(tx, actor, prepared);
  if (source.existing) {
    await tx.issuanceTupleReservation.deleteMany({
      where: { claimToken: prepared.tupleClaim.claimToken },
    });
    return {
      issuanceId: source.existing.id,
      publicId: source.existing.publicId,
      alreadyIssued: true,
    };
  }

  await testHooks()?.afterTuplePrecheck?.();
  const { currentSnapshots, expiresAt, signed } = await lockAndValidateCommitInvariants(
    tx,
    prepared,
    source,
  );
  const issuedAt = new Date(prepared.issuedAt);
  const created = await tx.badgeIssuance.create({
    data: {
      classId: prepared.classId,
      badgeTemplateId: prepared.badgeTemplateId,
      studentId: prepared.studentId,
      issuerUserId: actor.id,
      status: "ACTIVE",
      publicId: prepared.publicId,
      issuedAt,
      expiresAt,
      recipientSnapshotJson: currentSnapshots.recipient as Prisma.InputJsonValue,
      achievementSnapshotJson: currentSnapshots.achievement as Prisma.InputJsonValue,
      issuerSnapshotJson: currentSnapshots.issuer as Prisma.InputJsonValue,
      credentialJson: currentSnapshots.credential as Prisma.InputJsonValue,
      signedCredentialJson: signed as Prisma.InputJsonValue,
      signingKeyId: prepared.signingKeyId,
      serializerVersion,
      snapshotVersion: 1,
    },
    select: { id: true, publicId: true },
  });
  await tx.credentialStatusAllocation.create({
    data: {
      issuanceId: created.id,
      statusListId: prepared.statusReservation.listId,
      index: prepared.statusReservation.index,
    },
  });
  await tx.auditLog.create({
    data: {
      actorUserId: actor.id,
      action: "badge.issued",
      entityType: "BadgeIssuance",
      entityId: created.id,
      contextJson: {
        classId: prepared.classId,
        badgeTemplateId: prepared.badgeTemplateId,
        studentId: prepared.studentId,
        issuanceId: created.id,
        publicId: created.publicId,
        signingKeyId: prepared.signingKeyId,
        serializerVersion,
        statusListId: prepared.statusReservation.listId,
        statusListIndex: prepared.statusReservation.index,
      },
    },
  });
  await enqueueIssuedNotification(tx, {
    issuanceId: created.id,
    recipientEmail: currentSnapshots.recipient.email,
    recipientFirstName: currentSnapshots.recipient.firstName,
    badgeName: currentSnapshots.achievement.name,
    issuerName: currentSnapshots.issuer.name,
    verificationUrl: signed.id,
    occurredAt: issuedAt,
    ...(source.settings.supportContact ? { supportContact: source.settings.supportContact } : {}),
  });
  const released = await tx.issuanceTupleReservation.deleteMany({
    where: { claimToken: prepared.tupleClaim.claimToken },
  });
  if (released.count !== 1) throw invalidIssuance(prepared.correlationId);
  return { issuanceId: created.id, publicId: created.publicId, alreadyIssued: false };
}

export async function commitPreparedSignedIssuanceSetInTransaction(
  tx: Prisma.TransactionClient,
  rawActor: Actor,
  rawPreparedSet: readonly PreparedSignedIssuance[],
): Promise<IssuanceResult[]> {
  const actor = requireRole(rawActor, "FACULTY");
  const preparedSet = rawPreparedSet.map((prepared) => readPreparedArtifact(prepared));
  for (const prepared of preparedSet) {
    if (prepared.actorId !== actor.id) throw invalidIssuance(prepared.correlationId);
  }
  const batchPrepared = preparedSet.filter((prepared) => prepared.tupleClaim.batchId !== null);
  if (batchPrepared.length > 0) {
    const expected = batchPrepared[0]!.tupleClaim;
    if (
      batchPrepared.length !== preparedSet.length ||
      batchPrepared.some(
        (prepared) =>
          prepared.tupleClaim.batchId !== expected.batchId ||
          prepared.tupleClaim.batchPreviewFingerprint !== expected.batchPreviewFingerprint ||
          prepared.tupleClaim.batchClaimVersion !== expected.batchClaimVersion ||
          prepared.tupleClaim.claimToken !== expected.claimToken,
      )
    ) {
      throw invalidIssuance(batchPrepared[0]!.correlationId);
    }
  }

  const results: IssuanceResult[] = [];
  for (const prepared of preparedSet) {
    results.push(await commitPreparedAttempt(tx, actor, prepared));
  }
  if (batchPrepared.length > 0 && results.some((result) => result.alreadyIssued)) {
    throw invalidIssuance(batchPrepared[0]!.correlationId);
  }
  return results;
}

async function recoverTupleConflict(
  actor: Actor,
  prepared: PreparedSignedIssuance,
): Promise<IssuanceResult | null> {
  testHooks()?.onTupleConflictRecovery?.();
  for (let attempt = 0; attempt < maximumCommitAttempts; attempt += 1) {
    try {
      return await prisma.$transaction(async (tx) => {
        const source = await lockCommitSource(tx, actor, prepared);
        if (!source.existing) return null;
        return {
          issuanceId: source.existing.id,
          publicId: source.existing.publicId,
          alreadyIssued: true,
        };
      });
    } catch (error) {
      if (!isRetryableMariaDbTransactionError(error)) throw error;
      if (attempt + 1 >= maximumCommitAttempts) {
        throw invalidIssuance(prepared.correlationId);
      }
      testHooks()?.onCommitRetry?.();
    }
  }
  return null;
}

export async function commitPreparedSignedIssuance(
  rawActor: Actor,
  rawPrepared: PreparedSignedIssuance,
): Promise<IssuanceResult> {
  const actor = requireRole(rawActor, "FACULTY");
  const prepared = readPreparedArtifact(rawPrepared);
  if (prepared.actorId !== actor.id) throw invalidIssuance(prepared.correlationId);

  for (let attempt = 0; attempt < maximumCommitAttempts; attempt += 1) {
    try {
      return await prisma.$transaction((tx) => commitPreparedAttempt(tx, actor, prepared));
    } catch (error) {
      if (isTupleUniqueConflict(error)) {
        const raced = await recoverTupleConflict(actor, prepared);
        if (raced) return raced;
        throw error;
      }
      if (!isRetryableMariaDbTransactionError(error)) throw error;
      if (attempt + 1 >= maximumCommitAttempts) {
        throw invalidIssuance(prepared.correlationId);
      }
      testHooks()?.onCommitRetry?.();
    }
  }
  throw invalidIssuance(prepared.correlationId);
}

async function issueSignedBadgeWithSigner(
  actor: Actor,
  rawInput: { classId: string; badgeTemplateId: string; studentId: string },
  signer: SignedIssuanceSigner,
): Promise<IssuanceResult> {
  const faculty = requireRole(actor, "FACULTY");
  const input = issueBadgeInputSchema.parse(rawInput);
  for (let attempt = 0; attempt < maximumPublicIdAttempts; attempt += 1) {
    let prepared: PreparedSignedIssuance;
    try {
      prepared = await prepareSignedIssuanceWithSigner({ actor: faculty, ...input }, signer);
    } catch (error) {
      if (error instanceof ExistingIssuanceError) {
        return {
          issuanceId: error.issuance.id,
          publicId: error.issuance.publicId,
          alreadyIssued: true,
        };
      }
      if (error instanceof IssuanceTupleReservedError) {
        for (let poll = 0; poll < tupleReservationPollAttempts; poll += 1) {
          const existing = selectCurrentIssuance(
            await prisma.badgeIssuance.findMany({
              where: {
                classId: input.classId,
                badgeTemplateId: input.badgeTemplateId,
                studentId: input.studentId,
              },
              select: {
                id: true,
                publicId: true,
                status: true,
                supersedesId: true,
                supersededById: true,
              },
            }),
          );
          if (existing) {
            return {
              issuanceId: existing.id,
              publicId: existing.publicId,
              alreadyIssued: true,
            };
          }
          await new Promise((resolve) => setTimeout(resolve, tupleReservationPollMilliseconds));
        }
      }
      throw error;
    }
    try {
      return await commitPreparedSignedIssuance(faculty, prepared);
    } catch (error) {
      if (isPublicIdUniqueConflict(error) && attempt + 1 < maximumPublicIdAttempts) {
        await prisma.issuanceTupleReservation.deleteMany({
          where: {
            claimToken: prepared.tupleClaim.claimToken,
            batchId: null,
            facultyUserId: faculty.id,
          },
        });
        continue;
      }
      throw error;
    }
  }
  throw new Error("Credential public identifier could not be allocated");
}

export function issueSignedBadge(
  actor: Actor,
  rawInput: { classId: string; badgeTemplateId: string; studentId: string },
): Promise<IssuanceResult> {
  return issueSignedBadgeWithSigner(actor, rawInput, defaultSigner);
}

export function issueSignedBadgeForTest(
  actor: Actor,
  rawInput: { classId: string; badgeTemplateId: string; studentId: string },
  signer: SignedIssuanceSigner,
): Promise<IssuanceResult> {
  if (process.env.NODE_ENV !== "test") throw new Error("Test signer injection is unavailable");
  return issueSignedBadgeWithSigner(actor, rawInput, signer);
}
