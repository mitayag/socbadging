import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { AuthorizationError } from "@/modules/identity/policies/authorization";
import type { Actor } from "@/modules/identity/types";
import { SignerClientError } from "@/modules/signing/signer-client";

const mocks = vi.hoisted(() => ({
  auditCreate: vi.fn(),
  badgeFindUnique: vi.fn(),
  classFindUnique: vi.fn(),
  enrollmentFindUnique: vi.fn(),
  executeRaw: vi.fn(),
  generatePublicId: vi.fn(),
  issuanceCreate: vi.fn(),
  issuanceFindMany: vi.fn(),
  notificationCreate: vi.fn(),
  lockedIssuanceFind: vi.fn(),
  queryRaw: vi.fn(),
  reserveStatus: vi.fn(),
  signingKeyFindMany: vi.fn(),
  statusAllocationCreate: vi.fn(),
  statusAllocationFindUnique: vi.fn(),
  systemSettingFindUnique: vi.fn(),
  transaction: vi.fn(),
  tupleReservationCreate: vi.fn(),
  tupleReservationDeleteMany: vi.fn(),
  tupleReservationFindUnique: vi.fn(),
  userFindUnique: vi.fn(),
}));

vi.mock("@/platform/db/prisma", () => ({
  prisma: {
    $transaction: mocks.transaction,
    badgeIssuance: { findMany: mocks.issuanceFindMany },
    issuanceTupleReservation: { deleteMany: mocks.tupleReservationDeleteMany },
  },
}));

vi.mock("./status-allocation-service", () => ({
  reserveUnassignedStatusAllocation: mocks.reserveStatus,
}));

vi.mock("./credential-snapshot", async (importOriginal) => {
  const original = await importOriginal<typeof import("./credential-snapshot")>();
  return { ...original, generatePublicId: mocks.generatePublicId };
});

import {
  SIGNER_UNAVAILABLE_MESSAGE,
  SignedIssuanceError,
  commitPreparedSignedIssuance,
  commitPreparedSignedIssuanceSetInTransaction,
  issueSignedBadgeForTest as issueSignedBadge,
  prepareSignedIssuanceForTest as prepareSignedIssuance,
  type PreparedSignedIssuance,
  type SignedIssuanceSigner,
} from "./signed-issuance-service";

const previousAppUrl = process.env.APP_URL;
process.env.APP_URL = "https://badges.example.test";

const faculty: Actor = {
  id: "faculty-1",
  name: "Stale Session Name",
  email: "faculty@example.test",
  role: "FACULTY",
};
const administrator: Actor = {
  id: "admin-1",
  name: "Administrator",
  email: "admin@example.test",
  role: "ADMIN",
};
const request = { classId: "class-1", badgeTemplateId: "badge-1", studentId: "student-1" };
const key = {
  id: "key-1",
  verificationMethodUrl: "https://badges.example.test/api/issuers/hau-soc/keys/key-1",
  controllerUrl: "https://badges.example.test/api/issuers/hau-soc",
  algorithm: "Ed25519",
  cryptosuite: "eddsa-rdfc-2022",
  status: "ACTIVE",
  compromisedAt: null,
};
const statusReservation = {
  listId: "status-list-1",
  index: 8,
  statusUrl: "https://badges.example.test/api/status-lists/status-list-1",
};
const classRecord = {
  id: "class-1",
  ownerUserId: "faculty-1",
  status: "ACTIVE",
  courseCode: "CS 401",
  title: "Secure Systems",
  section: "A",
  term: "First Semester",
  academicYear: "2026-2027",
};
const badgeTemplate = {
  id: "badge-1",
  classId: "class-1",
  ownerUserId: "faculty-1",
  status: "ACTIVE",
  name: "Secure Systems Foundations",
  description: "Recognizes secure systems fundamentals.",
  criteria: "Complete the secure systems assessment.",
  imagePath: "badges/secure-systems.png",
  metadataJson: { skills: ["Security", "Linux"] },
  expiresAfterDays: 30,
  updatedAt: new Date("2026-08-10T12:00:00.000Z"),
};
const enrollment = {
  classId: "class-1",
  studentId: "student-1",
  enrollmentStatus: "ACTIVE",
  student: {
    id: "student-1",
    studentNumber: "PRIVATE-STUDENT-NUMBER",
    firstName: "PrivateFirst",
    lastName: "PrivateLast",
    email: "private-recipient@example.test",
  },
};
const lockedEnrollment = {
  classId: enrollment.classId,
  studentId: enrollment.studentId,
  enrollmentStatus: enrollment.enrollmentStatus,
  studentNumber: enrollment.student.studentNumber,
  firstName: enrollment.student.firstName,
  lastName: enrollment.student.lastName,
  email: enrollment.student.email,
};
const issuer = {
  id: "faculty-1",
  name: "Database Faculty",
  role: "FACULTY",
  status: "ACTIVE",
};
const settings = {
  issuerName: "HAU School of Computing",
  issuerUrl: key.controllerUrl,
  issuerLogoPath: "/images/hausoclogo.png",
  supportContact: null,
  sharingEnabled: true,
};

const originalIssuance = {
  id: "issuance-original",
  publicId: "public-original",
  status: "ACTIVE",
  supersedesId: null,
  supersededById: "issuance-replacement",
};

const replacementIssuance = {
  id: "issuance-replacement",
  publicId: "public-replacement",
  status: "ACTIVE",
  supersedesId: "issuance-original",
  supersededById: null,
};

type SqlQuery = { strings?: readonly string[] };

async function currentTupleClaim() {
  const created = mocks.tupleReservationCreate.mock.results.at(-1)?.value;
  return created ? [await created] : [];
}

const tupleConflict = {
  code: "P2002",
  meta: { target: ["classId", "badgeTemplateId", "studentId"] },
};

function expectNoVisibleWrites() {
  expect(mocks.issuanceCreate).not.toHaveBeenCalled();
  expect(mocks.statusAllocationCreate).not.toHaveBeenCalled();
  expect(mocks.auditCreate).not.toHaveBeenCalled();
  expect(mocks.notificationCreate).not.toHaveBeenCalled();
}

async function expectSafeInvalidArtifact(value: unknown, forbiddenText?: string) {
  const error = await commitPreparedSignedIssuance(faculty, value as PreparedSignedIssuance).catch(
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(SignedIssuanceError);
  expect(error).toMatchObject({ retryable: false });
  expect((error as Error).message).toMatch(
    /^Credential signing could not be validated\. No badge was issued\. Reference: [0-9a-f-]{36}\.$/,
  );
  if (forbiddenText) expect((error as Error).message).not.toContain(forbiddenText);
  expectNoVisibleWrites();
  return error as SignedIssuanceError;
}

function createSigner(
  overrides: Partial<SignedIssuanceSigner> = {},
): SignedIssuanceSigner & { payloads: unknown[] } {
  const payloads: unknown[] = [];
  return {
    payloads,
    signCredential: vi.fn(async (document: unknown) => {
      payloads.push(document);
      return {
        ...(document as Record<string, unknown>),
        proof: {
          type: "DataIntegrityProof",
          cryptosuite: "eddsa-rdfc-2022",
          proofPurpose: "assertionMethod",
          verificationMethod: key.verificationMethodUrl,
          created: "2026-08-25T01:02:04.000Z",
          proofValue: "z3FXQqBNXUtsjQ",
        },
      } as never;
    }),
    verifyCredential: vi.fn(async () => ({
      outcome: "VERIFIED" as const,
      keyId: key.verificationMethodUrl,
    })),
    ...overrides,
  };
}

function configureTransactionFixture() {
  let transactionDepth = 0;
  const tx = {
    $executeRaw: mocks.executeRaw,
    $queryRaw: mocks.queryRaw,
    auditLog: { create: mocks.auditCreate },
    badgeIssuance: { create: mocks.issuanceCreate, findMany: mocks.issuanceFindMany },
    badgeTemplate: { findUnique: mocks.badgeFindUnique },
    class: { findUnique: mocks.classFindUnique },
    classStudent: { findUnique: mocks.enrollmentFindUnique },
    credentialStatusAllocation: {
      create: mocks.statusAllocationCreate,
      findUnique: mocks.statusAllocationFindUnique,
    },
    notificationDelivery: { create: mocks.notificationCreate },
    signingKey: { findMany: mocks.signingKeyFindMany },
    systemSetting: { findUnique: mocks.systemSettingFindUnique },
    issuanceTupleReservation: {
      create: mocks.tupleReservationCreate,
      deleteMany: mocks.tupleReservationDeleteMany,
      findUnique: mocks.tupleReservationFindUnique,
    },
    user: { findUnique: mocks.userFindUnique },
  };
  mocks.transaction.mockImplementation(
    async (callback: (client: typeof tx) => Promise<unknown>) => {
      transactionDepth += 1;
      try {
        return await callback(tx);
      } finally {
        transactionDepth -= 1;
      }
    },
  );
  return { inTransaction: () => transactionDepth > 0 };
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-08-25T01:02:03.456Z"));
  configureTransactionFixture();
  mocks.classFindUnique.mockResolvedValue(classRecord);
  mocks.badgeFindUnique.mockResolvedValue(badgeTemplate);
  mocks.enrollmentFindUnique.mockResolvedValue(enrollment);
  mocks.userFindUnique.mockResolvedValue(issuer);
  mocks.systemSettingFindUnique.mockResolvedValue(settings);
  mocks.issuanceFindMany.mockResolvedValue([]);
  mocks.lockedIssuanceFind.mockResolvedValue([]);
  mocks.signingKeyFindMany.mockResolvedValue([key]);
  mocks.reserveStatus.mockResolvedValue(statusReservation);
  mocks.generatePublicId.mockReturnValue("signed-public-id-000000000000000");
  mocks.issuanceCreate.mockResolvedValue({
    id: "issuance-1",
    publicId: "signed-public-id-000000000000000",
  });
  mocks.auditCreate.mockResolvedValue({ id: "audit-1" });
  mocks.notificationCreate.mockResolvedValue({ id: "notification-1" });
  mocks.statusAllocationCreate.mockResolvedValue({ id: "allocation-1" });
  mocks.statusAllocationFindUnique.mockResolvedValue(null);
  mocks.executeRaw.mockResolvedValue(1);
  mocks.tupleReservationDeleteMany.mockResolvedValue({ count: 1 });
  mocks.tupleReservationCreate.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
    Promise.resolve({
      id: "tuple-reservation-1",
      batchId: null,
      batchPreviewFingerprint: null,
      batchClaimVersion: null,
      ...data,
    }),
  );
  mocks.tupleReservationFindUnique.mockResolvedValue(null);
  mocks.queryRaw.mockImplementation(async (query: SqlQuery) => {
    const sql = query.strings?.join(" ") ?? "";
    if (sql.includes("FROM classes")) return [classRecord];
    if (sql.includes("FROM users")) return [issuer];
    if (sql.includes("FROM badge_templates")) return [badgeTemplate];
    if (sql.includes("FROM class_students")) return [lockedEnrollment];
    if (sql.includes("FROM system_settings")) return [settings];
    if (sql.includes("FROM badge_issuances")) return mocks.lockedIssuanceFind();
    if (sql.includes("FROM signing_keys")) return [key];
    if (sql.includes("FROM issuance_tuple_reservations")) return currentTupleClaim();
    if (sql.includes("FROM credential_status_lists")) {
      return [
        {
          id: statusReservation.listId,
          publicUrl: statusReservation.statusUrl,
          purpose: "revocation",
          capacity: 131_072,
          nextIndex: 9,
        },
      ];
    }
    throw new Error(`Unexpected locking query: ${sql}`);
  });
});

afterAll(() => {
  vi.useRealTimers();
  if (previousAppUrl === undefined) delete process.env.APP_URL;
  else process.env.APP_URL = previousAppUrl;
});

describe("prepareSignedIssuance", () => {
  it("signs and verifies the privacy-minimized canonical payload outside a transaction", async () => {
    const boundary = configureTransactionFixture();
    const signer = createSigner({
      signCredential: vi.fn(async (document: unknown) => {
        expect(boundary.inTransaction()).toBe(false);
        const serialized = JSON.stringify(document);
        expect(serialized).not.toContain("private-recipient@example.test");
        expect(serialized).not.toContain("PRIVATE-STUDENT-NUMBER");
        expect(serialized).not.toContain("PrivateFirst");
        expect(serialized).not.toContain("PrivateLast");
        return {
          ...(document as Record<string, unknown>),
          proof: {
            type: "DataIntegrityProof",
            cryptosuite: "eddsa-rdfc-2022",
            proofPurpose: "assertionMethod",
            verificationMethod: key.verificationMethodUrl,
            proofValue: "z3FXQqBNXUtsjQ",
          },
        } as never;
      }),
      verifyCredential: vi.fn(async () => {
        expect(boundary.inTransaction()).toBe(false);
        return { outcome: "VERIFIED" as const, keyId: key.verificationMethodUrl };
      }),
    });

    const prepared = await prepareSignedIssuance({ actor: faculty, ...request }, signer);

    expect(prepared).toMatchObject({
      publicId: "signed-public-id-000000000000000",
      signingKeyId: "key-1",
      serializerVersion: 1,
      statusReservation,
      snapshots: { recipient: { email: "private-recipient@example.test" } },
      signedDocument: {
        credentialStatus: { statusListIndex: "8" },
        proof: { verificationMethod: key.verificationMethodUrl },
      },
    });
    expect(Object.isFrozen(prepared)).toBe(true);
    expect(Object.isFrozen(prepared.signedDocument)).toBe(true);
    expect(signer.verifyCredential).toHaveBeenCalledOnce();
  });

  it("maps signer timeout to the exact retryable message and creates no visible record", async () => {
    const signer = createSigner({
      signCredential: vi.fn(async () => {
        throw new SignerClientError("SIGNER_UNAVAILABLE");
      }),
    });

    await expect(
      prepareSignedIssuance({ actor: faculty, ...request }, signer),
    ).rejects.toMatchObject({ message: SIGNER_UNAVAILABLE_MESSAGE, retryable: true });

    expect(mocks.issuanceCreate).not.toHaveBeenCalled();
    expect(mocks.auditCreate).not.toHaveBeenCalled();
    expect(mocks.notificationCreate).not.toHaveBeenCalled();
    expect(mocks.statusAllocationCreate).not.toHaveBeenCalled();
  });

  it("maps an invalid proof to a non-retryable safe correlation without exposing signer codes", async () => {
    const signer = createSigner({
      verifyCredential: vi.fn(async () => ({
        outcome: "INVALID_PROOF" as const,
        keyId: key.verificationMethodUrl,
      })),
    });

    const error = await prepareSignedIssuance({ actor: faculty, ...request }, signer).catch(
      (caught: unknown) => caught,
    );

    expect(error).toBeInstanceOf(SignedIssuanceError);
    expect(error).toMatchObject({ retryable: false });
    expect((error as Error).message).toMatch(
      /^Credential signing could not be validated\. No badge was issued\. Reference: [0-9a-f-]{36}\.$/,
    );
    expect((error as Error).message).not.toContain("INVALID_PROOF");
    expect(mocks.issuanceCreate).not.toHaveBeenCalled();
    expect(mocks.auditCreate).not.toHaveBeenCalled();
    expect(mocks.notificationCreate).not.toHaveBeenCalled();
  });

  it("maps an invalid canonical payload to a non-retryable safe correlation", async () => {
    mocks.systemSettingFindUnique.mockResolvedValueOnce({
      ...settings,
      issuerUrl: "https://different-issuer.example.test/",
    });
    const signer = createSigner();

    const error = await prepareSignedIssuance({ actor: faculty, ...request }, signer).catch(
      (caught: unknown) => caught,
    );

    expect(error).toBeInstanceOf(SignedIssuanceError);
    expect(error).toMatchObject({ retryable: false });
    expect((error as Error).message).toMatch(
      /^Credential signing could not be validated\. No badge was issued\. Reference: [0-9a-f-]{36}\.$/,
    );
    expect((error as Error).message).not.toContain("signing-key controller");
    expect(signer.signCredential).not.toHaveBeenCalled();
    expect(mocks.issuanceCreate).not.toHaveBeenCalled();
    expect(mocks.auditCreate).not.toHaveBeenCalled();
    expect(mocks.notificationCreate).not.toHaveBeenCalled();
  });

  it("returns an existing tuple without reserving or signing", async () => {
    mocks.issuanceFindMany.mockResolvedValueOnce([
      {
        id: "issuance-existing",
        publicId: "existing-public-id",
        status: "ACTIVE",
        supersedesId: null,
        supersededById: null,
      },
    ]);
    const signer = createSigner();

    await expect(issueSignedBadge(faculty, request, signer)).resolves.toEqual({
      issuanceId: "issuance-existing",
      publicId: "existing-public-id",
      alreadyIssued: true,
    });

    expect(mocks.reserveStatus).not.toHaveBeenCalled();
    expect(signer.signCredential).not.toHaveBeenCalled();
  });

  it.each([
    ["original-first", [originalIssuance, replacementIssuance]],
    ["replacement-first", [replacementIssuance, originalIssuance]],
  ])(
    "returns the terminal replacement from the locked preparation read for %s row order",
    async (_label, issuances) => {
      mocks.lockedIssuanceFind.mockResolvedValueOnce(issuances);

      await expect(issueSignedBadge(faculty, request, createSigner())).resolves.toEqual({
        issuanceId: "issuance-replacement",
        publicId: "public-replacement",
        alreadyIssued: true,
      });

      expect(mocks.reserveStatus).not.toHaveBeenCalled();
    },
  );
});

describe("signed issuance commit", () => {
  it("commits an ordered sealed set through the caller's transaction boundary", async () => {
    const prepared = await prepareSignedIssuance({ actor: faculty, ...request }, createSigner());
    const tx = {
      $executeRaw: mocks.executeRaw,
      $queryRaw: mocks.queryRaw,
      auditLog: { create: mocks.auditCreate },
      badgeIssuance: { create: mocks.issuanceCreate, findMany: mocks.issuanceFindMany },
      badgeTemplate: { findUnique: mocks.badgeFindUnique },
      class: { findUnique: mocks.classFindUnique },
      classStudent: { findUnique: mocks.enrollmentFindUnique },
      credentialStatusAllocation: {
        create: mocks.statusAllocationCreate,
        findUnique: mocks.statusAllocationFindUnique,
      },
      notificationDelivery: { create: mocks.notificationCreate },
      signingKey: { findMany: mocks.signingKeyFindMany },
      systemSetting: { findUnique: mocks.systemSettingFindUnique },
      issuanceTupleReservation: { deleteMany: mocks.tupleReservationDeleteMany },
      user: { findUnique: mocks.userFindUnique },
    };

    await expect(
      commitPreparedSignedIssuanceSetInTransaction(tx as never, faculty, [prepared]),
    ).resolves.toEqual([
      {
        issuanceId: "issuance-1",
        publicId: "signed-public-id-000000000000000",
        alreadyIssued: false,
      },
    ]);

    expect(mocks.transaction).toHaveBeenCalledTimes(2);
    expect(mocks.issuanceCreate).toHaveBeenCalledOnce();
    expect(mocks.auditCreate).toHaveBeenCalledOnce();
    expect(mocks.notificationCreate).toHaveBeenCalledOnce();
  });

  it("commits exactly one signed issuance, status allocation, identifier-only audit, and notification", async () => {
    const result = await issueSignedBadge(faculty, request, createSigner());

    expect(result).toEqual({
      issuanceId: "issuance-1",
      publicId: "signed-public-id-000000000000000",
      alreadyIssued: false,
    });
    expect(mocks.issuanceCreate).toHaveBeenCalledOnce();
    expect(mocks.statusAllocationCreate).toHaveBeenCalledOnce();
    expect(mocks.auditCreate).toHaveBeenCalledOnce();
    expect(mocks.notificationCreate).toHaveBeenCalledOnce();
    expect(mocks.issuanceCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          expiresAt: new Date("2026-09-24T01:02:03.456Z"),
          publicId: "signed-public-id-000000000000000",
          signedCredentialJson: expect.objectContaining({
            credentialStatus: expect.any(Object),
            proof: expect.any(Object),
          }),
          signingKeyId: "key-1",
          serializerVersion: 1,
        }),
      }),
    );
    expect(mocks.auditCreate).toHaveBeenCalledWith({
      data: {
        actorUserId: "faculty-1",
        action: "badge.issued",
        entityType: "BadgeIssuance",
        entityId: "issuance-1",
        contextJson: {
          classId: "class-1",
          badgeTemplateId: "badge-1",
          studentId: "student-1",
          issuanceId: "issuance-1",
          publicId: "signed-public-id-000000000000000",
          signingKeyId: "key-1",
          serializerVersion: 1,
          statusListId: "status-list-1",
          statusListIndex: 8,
        },
      },
    });
    expect(JSON.stringify(mocks.auditCreate.mock.calls)).not.toContain(
      "private-recipient@example.test",
    );
    expect(JSON.stringify(mocks.auditCreate.mock.calls)).not.toContain("PRIVATE-STUDENT-NUMBER");
  });

  it("rechecks duplicate state before any signed credential write", async () => {
    mocks.lockedIssuanceFind.mockResolvedValueOnce([
      { id: "issuance-raced", publicId: "raced-public-id" },
    ]);

    await expect(issueSignedBadge(faculty, request, createSigner())).resolves.toEqual({
      issuanceId: "issuance-raced",
      publicId: "raced-public-id",
      alreadyIssued: true,
    });

    expect(mocks.issuanceCreate).not.toHaveBeenCalled();
    expect(mocks.statusAllocationCreate).not.toHaveBeenCalled();
    expect(mocks.auditCreate).not.toHaveBeenCalled();
    expect(mocks.notificationCreate).not.toHaveBeenCalled();
  });

  it.each([
    ["original-first", [originalIssuance, replacementIssuance]],
    ["replacement-first", [replacementIssuance, originalIssuance]],
  ])(
    "returns the terminal replacement from the locked commit read for %s row order",
    async (_label, issuances) => {
      const prepared = await prepareSignedIssuance({ actor: faculty, ...request }, createSigner());
      mocks.lockedIssuanceFind.mockResolvedValueOnce(issuances);

      await expect(commitPreparedSignedIssuance(faculty, prepared)).resolves.toEqual({
        issuanceId: "issuance-replacement",
        publicId: "public-replacement",
        alreadyIssued: true,
      });

      expectNoVisibleWrites();
    },
  );

  it("releases its tuple reservation before retrying a public identifier collision", async () => {
    mocks.generatePublicId
      .mockReturnValueOnce("first-public-id-0000000000000000")
      .mockReturnValueOnce("second-public-id-000000000000000");
    mocks.issuanceCreate
      .mockRejectedValueOnce({ code: "P2002", meta: { target: ["publicId"] } })
      .mockResolvedValueOnce({
        id: "issuance-retried",
        publicId: "second-public-id-000000000000000",
      });
    const signer = createSigner();

    await expect(issueSignedBadge(faculty, request, signer)).resolves.toEqual({
      issuanceId: "issuance-retried",
      publicId: "second-public-id-000000000000000",
      alreadyIssued: false,
    });

    expect(mocks.tupleReservationDeleteMany).toHaveBeenCalledWith({
      where: expect.objectContaining({ batchId: null, facultyUserId: faculty.id }),
    });
    expect(signer.signCredential).toHaveBeenCalledTimes(2);
  });

  it("rejects changed ownership at commit before persistence", async () => {
    mocks.queryRaw.mockImplementation(async (query: SqlQuery) => {
      const sql = query.strings?.join(" ") ?? "";
      if (sql.includes("FROM users")) return [issuer];
      if (sql.includes("FROM issuance_tuple_reservations")) return currentTupleClaim();
      if (sql.includes("FROM badge_issuances")) return [];
      if (sql.includes("FROM classes")) return [{ ...classRecord, ownerUserId: "faculty-2" }];
      throw new Error(`Unexpected query after ownership rejection: ${sql}`);
    });

    await expect(issueSignedBadge(faculty, request, createSigner())).rejects.toBeInstanceOf(
      AuthorizationError,
    );

    expect(mocks.issuanceCreate).not.toHaveBeenCalled();
    expect(mocks.auditCreate).not.toHaveBeenCalled();
  });

  it("rejects a key that is no longer active or uncompromised", async () => {
    const prepared = await prepareSignedIssuance({ actor: faculty, ...request }, createSigner());
    mocks.queryRaw.mockImplementation(async (query: SqlQuery) => {
      const sql = query.strings?.join(" ") ?? "";
      if (sql.includes("FROM users")) return [issuer];
      if (sql.includes("FROM issuance_tuple_reservations")) return currentTupleClaim();
      if (sql.includes("FROM badge_issuances")) return [];
      if (sql.includes("FROM classes")) return [classRecord];
      if (sql.includes("FROM badge_templates")) return [badgeTemplate];
      if (sql.includes("FROM class_students")) return [lockedEnrollment];
      if (sql.includes("FROM system_settings")) return [settings];
      if (sql.includes("FROM credential_status_lists")) {
        return [
          {
            id: statusReservation.listId,
            publicUrl: statusReservation.statusUrl,
            purpose: "revocation",
            capacity: 131_072,
            nextIndex: 9,
          },
        ];
      }
      if (sql.includes("FROM signing_keys")) {
        return [{ ...key, status: "COMPROMISED", compromisedAt: new Date() }];
      }
      throw new Error(`Unexpected query before key rejection: ${sql}`);
    });

    await expect(commitPreparedSignedIssuance(faculty, prepared)).rejects.toMatchObject({
      retryable: false,
    });

    expect(mocks.issuanceCreate).not.toHaveBeenCalled();
    expect(mocks.auditCreate).not.toHaveBeenCalled();
  });

  it("rejects a status slot that is no longer a valid reservation", async () => {
    const prepared = await prepareSignedIssuance({ actor: faculty, ...request }, createSigner());
    mocks.queryRaw.mockImplementation(async (query: SqlQuery) => {
      const sql = query.strings?.join(" ") ?? "";
      if (sql.includes("FROM users")) return [issuer];
      if (sql.includes("FROM issuance_tuple_reservations")) return currentTupleClaim();
      if (sql.includes("FROM badge_issuances")) return [];
      if (sql.includes("FROM classes")) return [classRecord];
      if (sql.includes("FROM badge_templates")) return [badgeTemplate];
      if (sql.includes("FROM class_students")) return [lockedEnrollment];
      if (sql.includes("FROM system_settings")) return [settings];
      if (sql.includes("FROM signing_keys")) return [key];
      if (sql.includes("FROM credential_status_lists")) {
        return [
          {
            id: statusReservation.listId,
            publicUrl: statusReservation.statusUrl,
            purpose: "revocation",
            capacity: 131_072,
            nextIndex: 8,
          },
        ];
      }
      throw new Error(`Unexpected query before status rejection: ${sql}`);
    });

    await expect(commitPreparedSignedIssuance(faculty, prepared)).rejects.toMatchObject({
      retryable: false,
    });

    expect(mocks.issuanceCreate).not.toHaveBeenCalled();
    expect(mocks.auditCreate).not.toHaveBeenCalled();
  });

  it("revalidates the signed payload before persistence", async () => {
    const prepared = await prepareSignedIssuance({ actor: faculty, ...request }, createSigner());
    const tampered = structuredClone(prepared) as PreparedSignedIssuance;
    Object.assign(tampered.signedDocument, { name: "Tampered credential" });

    await expect(commitPreparedSignedIssuance(faculty, tampered)).rejects.toMatchObject({
      retryable: false,
    });

    expect(mocks.issuanceCreate).not.toHaveBeenCalled();
    expect(mocks.statusAllocationCreate).not.toHaveBeenCalled();
    expect(mocks.auditCreate).not.toHaveBeenCalled();
    expect(mocks.notificationCreate).not.toHaveBeenCalled();
  });

  it("rejects an exact plain-object clone of a prepared artifact", async () => {
    const prepared = await prepareSignedIssuance({ actor: faculty, ...request }, createSigner());
    const clone = structuredClone(prepared) as PreparedSignedIssuance;

    await expectSafeInvalidArtifact(clone);
  });

  it("rejects a clone whose only change is a schema-valid proof value", async () => {
    const prepared = await prepareSignedIssuance({ actor: faculty, ...request }, createSigner());
    const tampered = structuredClone(prepared) as PreparedSignedIssuance;
    Object.assign(tampered.signedDocument.proof, { proofValue: "z4FXQqBNXUtsjQ" });

    await expectSafeInvalidArtifact(tampered);
  });

  it("never trusts a cloned prepared expiration value", async () => {
    const prepared = await prepareSignedIssuance({ actor: faculty, ...request }, createSigner());
    const tampered = structuredClone(prepared) as PreparedSignedIssuance & { expiresAt: string };
    tampered.expiresAt = "2099-12-31T23:59:59.000Z";

    await expectSafeInvalidArtifact(tampered);
  });

  it.each([
    ["issuedAt", (value: Record<string, unknown>) => (value.issuedAt = "not-a-date")],
    [
      "signing key",
      (value: Record<string, unknown>) =>
        (value.signingKey = {
          ...(value.signingKey as Record<string, unknown>),
          id: { forged: true },
        }),
    ],
    [
      "status reservation",
      (value: Record<string, unknown>) =>
        (value.statusReservation = {
          ...(value.statusReservation as Record<string, unknown>),
          index: "8",
        }),
    ],
    [
      "correlation",
      (value: Record<string, unknown>) => (value.correlationId = "FORGED-CORRELATION"),
    ],
  ])("strictly rejects invalid prepared %s without echoing raw values", async (_label, mutate) => {
    const prepared = await prepareSignedIssuance({ actor: faculty, ...request }, createSigner());
    const invalid = structuredClone(prepared) as unknown as Record<string, unknown>;
    mutate(invalid);

    const error = await expectSafeInvalidArtifact(invalid, "FORGED-CORRELATION");

    expect(error.correlationId).toMatch(/^[0-9a-f-]{36}$/);
    expect(error.correlationId).not.toBe(invalid.correlationId);
  });

  it("maps concurrent noncanonical settings to a safe error", async () => {
    const prepared = await prepareSignedIssuance({ actor: faculty, ...request }, createSigner());
    mocks.queryRaw.mockImplementation(async (query: SqlQuery) => {
      const sql = query.strings?.join(" ") ?? "";
      if (sql.includes("FROM users")) return [issuer];
      if (sql.includes("FROM issuance_tuple_reservations")) return currentTupleClaim();
      if (sql.includes("FROM badge_issuances")) return [];
      if (sql.includes("FROM classes")) return [classRecord];
      if (sql.includes("FROM badge_templates")) return [badgeTemplate];
      if (sql.includes("FROM class_students")) return [lockedEnrollment];
      if (sql.includes("FROM system_settings")) {
        return [{ ...settings, issuerUrl: "not-a-canonical-url" }];
      }
      if (sql.includes("FROM credential_status_lists")) {
        return [
          {
            id: statusReservation.listId,
            publicUrl: statusReservation.statusUrl,
            purpose: "revocation",
            capacity: 131_072,
            nextIndex: 9,
          },
        ];
      }
      if (sql.includes("FROM signing_keys")) return [key];
      throw new Error(`Unexpected locking query: ${sql}`);
    });

    await expect(commitPreparedSignedIssuance(faculty, prepared)).rejects.toMatchObject({
      retryable: false,
    });

    expectNoVisibleWrites();
  });

  it("locks shared rows in the documented global order", async () => {
    const events: string[] = [];
    mocks.queryRaw.mockImplementation(async (query: SqlQuery) => {
      const sql = query.strings?.join(" ") ?? "";
      if (sql.includes("FROM users")) {
        events.push("actor");
        return [issuer];
      }
      if (sql.includes("FROM issuance_tuple_reservations")) {
        events.push("tuple-claim");
        return currentTupleClaim();
      }
      if (sql.includes("FROM badge_issuances")) {
        events.push("issuance");
        return [];
      }
      if (sql.includes("FROM classes")) {
        events.push("class");
        return [classRecord];
      }
      if (sql.includes("FROM badge_templates")) {
        events.push("badge");
        return [badgeTemplate];
      }
      if (sql.includes("FROM class_students")) {
        events.push("enrollment");
        return [lockedEnrollment];
      }
      if (sql.includes("FROM system_settings")) {
        events.push("settings");
        return [settings];
      }
      if (sql.includes("FROM credential_status_lists")) {
        events.push("status-list");
        return [
          {
            id: statusReservation.listId,
            publicUrl: statusReservation.statusUrl,
            purpose: "revocation",
            capacity: 131_072,
            nextIndex: 9,
          },
        ];
      }
      if (sql.includes("FROM signing_keys")) {
        events.push("signing-key");
        return [key];
      }
      throw new Error(`Unexpected locking query: ${sql}`);
    });
    mocks.statusAllocationFindUnique.mockImplementation(async () => {
      events.push("allocation");
      return null;
    });

    await issueSignedBadge(faculty, request, createSigner());

    expect(events).toEqual([
      "issuance",
      "actor",
      "tuple-claim",
      "issuance",
      "class",
      "badge",
      "enrollment",
      "settings",
      "status-list",
      "signing-key",
      "allocation",
    ]);
  });

  it.each([
    [
      "record changed",
      {
        code: "P2010",
        meta: { driverAdapterError: { cause: { originalCode: "1020" } } },
      },
    ],
    ["deadlock", { code: "P2034" }],
  ])("retries the full commit after a MariaDB %s error", async (_label, transientError) => {
    const prepared = await prepareSignedIssuance({ actor: faculty, ...request }, createSigner());
    mocks.transaction.mockRejectedValueOnce(transientError);

    await expect(commitPreparedSignedIssuance(faculty, prepared)).resolves.toMatchObject({
      issuanceId: "issuance-1",
      alreadyIssued: false,
    });

    expect(mocks.issuanceCreate).toHaveBeenCalledOnce();
    expect(mocks.statusAllocationCreate).toHaveBeenCalledOnce();
    expect(mocks.auditCreate).toHaveBeenCalledOnce();
    expect(mocks.notificationCreate).toHaveBeenCalledOnce();
  });

  it("bounds MariaDB commit retries and returns only a safe correlation", async () => {
    const prepared = await prepareSignedIssuance({ actor: faculty, ...request }, createSigner());
    const transientError = {
      code: "P2010",
      meta: { driverAdapterError: { cause: { originalCode: "1020" } } },
    };
    mocks.transaction
      .mockRejectedValueOnce(transientError)
      .mockRejectedValueOnce(transientError)
      .mockRejectedValueOnce(transientError);

    await expect(commitPreparedSignedIssuance(faculty, prepared)).rejects.toMatchObject({
      retryable: false,
      correlationId: prepared.correlationId,
    });

    expectNoVisibleWrites();
  });

  it.each([
    ["suspended actor", { user: { ...issuer, status: "SUSPENDED" }, class: classRecord }],
    ["changed ownership", { user: issuer, class: { ...classRecord, ownerUserId: "faculty-2" } }],
  ])("revalidates %s in fresh tuple-conflict recovery", async (_label, recoveryState) => {
    const prepared = await prepareSignedIssuance({ actor: faculty, ...request }, createSigner());
    mocks.issuanceCreate.mockRejectedValueOnce(tupleConflict);
    mocks.lockedIssuanceFind
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: "issuance-raced", publicId: "raced-public-id" }]);
    let userReads = 0;
    let classReads = 0;
    mocks.queryRaw.mockImplementation(async (query: SqlQuery) => {
      const sql = query.strings?.join(" ") ?? "";
      if (sql.includes("FROM users")) {
        userReads += 1;
        return [userReads === 1 ? issuer : recoveryState.user];
      }
      if (sql.includes("FROM issuance_tuple_reservations")) return currentTupleClaim();
      if (sql.includes("FROM badge_issuances")) return mocks.lockedIssuanceFind();
      if (sql.includes("FROM classes")) {
        classReads += 1;
        return [classReads === 1 ? classRecord : recoveryState.class];
      }
      if (sql.includes("FROM badge_templates")) return [badgeTemplate];
      if (sql.includes("FROM class_students")) return [lockedEnrollment];
      if (sql.includes("FROM system_settings")) return [settings];
      if (sql.includes("FROM credential_status_lists")) {
        return [
          {
            id: statusReservation.listId,
            publicUrl: statusReservation.statusUrl,
            purpose: "revocation",
            capacity: 131_072,
            nextIndex: 9,
          },
        ];
      }
      if (sql.includes("FROM signing_keys")) return [key];
      throw new Error(`Unexpected locking query: ${sql}`);
    });

    await expect(commitPreparedSignedIssuance(faculty, prepared)).rejects.toBeInstanceOf(
      AuthorizationError,
    );

    expect(mocks.transaction).toHaveBeenCalledTimes(4);
    expect(mocks.statusAllocationCreate).not.toHaveBeenCalled();
    expect(mocks.auditCreate).not.toHaveBeenCalled();
    expect(mocks.notificationCreate).not.toHaveBeenCalled();
  });

  it("enforces Faculty authorization before any preparation transaction", async () => {
    await expect(issueSignedBadge(administrator, request, createSigner())).rejects.toBeInstanceOf(
      AuthorizationError,
    );

    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});
