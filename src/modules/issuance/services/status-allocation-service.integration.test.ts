import { Prisma } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/platform/db/prisma";

import { reserveStatusAllocation } from "./status-allocation-service";

type Fixture = {
  classId: string;
  issuanceIds: string[];
  publicIds: string[];
  userId: string;
  studentIds: string[];
};
let fixture: Fixture;

function uniqueId(label: string) {
  return `phase8-status-${label}-${crypto.randomUUID()}`;
}

async function createFixture(): Promise<Fixture> {
  const userId = uniqueId("user");
  const email = `${userId}@example.test`;
  const classId = uniqueId("class");
  const studentIds = [uniqueId("student-1"), uniqueId("student-2")];
  const templateId = uniqueId("template");
  await prisma.user.create({
    data: {
      id: userId,
      name: "Status Faculty",
      email,
      normalizedEmail: email,
      passwordHash: "test",
      role: "FACULTY",
    },
  });
  await prisma.class.create({
    data: {
      id: classId,
      ownerUserId: userId,
      courseCode: "P8-202",
      title: "Status",
      section: "A",
      term: "First",
      academicYear: "2026-2027",
    },
  });
  for (const studentId of studentIds) {
    await prisma.student.create({
      data: {
        id: studentId,
        studentNumber: uniqueId("number"),
        firstName: "Status",
        lastName: "Student",
        email: `${studentId}@example.test`,
      },
    });
  }
  await prisma.badgeTemplate.create({
    data: {
      id: templateId,
      classId,
      ownerUserId: userId,
      name: "Status Badge",
      description: "Status fixture",
      criteria: "Status fixture",
      imagePath: "badges/status.png",
    },
  });
  const issuanceIds = [uniqueId("issuance-1"), uniqueId("issuance-2")];
  const publicIds = [uniqueId("public-1"), uniqueId("public-2")];
  for (let index = 0; index < issuanceIds.length; index += 1) {
    await prisma.badgeIssuance.create({
      data: {
        id: issuanceIds[index]!,
        publicId: publicIds[index]!,
        classId,
        badgeTemplateId: templateId,
        studentId: studentIds[index]!,
        issuerUserId: userId,
        issuedAt: new Date(),
        recipientSnapshotJson: {},
        achievementSnapshotJson: {},
        issuerSnapshotJson: {},
        credentialJson: {},
      },
    });
  }
  return { classId, issuanceIds, publicIds, userId, studentIds };
}

async function createStatusList(label: string) {
  return prisma.credentialStatusList.create({
    data: {
      id: uniqueId(label),
      publicUrl: `https://badges.example.test/status-lists/${uniqueId(label)}`,
      purpose: "revocation",
      capacity: 16,
    },
  });
}

async function cleanFixture(item: Fixture) {
  await prisma.$executeRaw(
    Prisma.sql`
      UPDATE badge_issuances
      SET signed_credential_json = NULL, supersedes_id = NULL, superseded_by_id = NULL
      WHERE class_id = ${item.classId}
    `,
  );
  await prisma.$executeRaw(Prisma.sql`
    DELETE FROM credential_status_allocations
    WHERE issuance_id IN (SELECT id FROM badge_issuances WHERE class_id = ${item.classId})
  `);
  await prisma.credentialStatusList.deleteMany();
  await prisma.badgeIssuance.deleteMany({ where: { classId: item.classId } });
  await prisma.badgeTemplate.deleteMany({ where: { classId: item.classId } });
  await prisma.student.deleteMany({ where: { id: { in: item.studentIds } } });
  await prisma.class.deleteMany({ where: { id: item.classId } });
  await prisma.user.deleteMany({ where: { id: item.userId } });
}

beforeEach(async () => {
  fixture = await createFixture();
});
afterEach(async () => {
  await cleanFixture(fixture);
});

describe("reserveStatusAllocation MariaDB transactions", () => {
  it("allocates unique sequential indices and returns the canonical status URL", async () => {
    const list = await createStatusList("list");
    const allocations = await Promise.all(
      fixture.publicIds.map((publicId) =>
        prisma.$transaction((tx) => reserveStatusAllocation(tx, publicId)),
      ),
    );
    expect(allocations.map((allocation) => allocation.index).sort()).toEqual([0, 1]);
    expect(
      allocations.every(
        (allocation) => allocation.listId === list.id && allocation.statusUrl === list.publicUrl,
      ),
    ).toBe(true);
  });

  it("returns an existing reservation for the same issuance", async () => {
    await createStatusList("idempotent");
    const first = await prisma.$transaction((tx) =>
      reserveStatusAllocation(tx, fixture.publicIds[0]!),
    );
    const second = await prisma.$transaction((tx) =>
      reserveStatusAllocation(tx, fixture.publicIds[0]!),
    );
    expect(second).toEqual(first);
    await expect(prisma.credentialStatusAllocation.count()).resolves.toBe(1);
  });

  it("serializes concurrent reservations for the same issuance to one allocation", async () => {
    await createStatusList("concurrent-idempotent");
    const reservations = await Promise.all(
      Array.from({ length: 2 }, () =>
        prisma.$transaction((tx) => reserveStatusAllocation(tx, fixture.publicIds[0]!)),
      ),
    );
    expect(reservations[1]).toEqual(reservations[0]);
    await expect(
      prisma.credentialStatusAllocation.count({ where: { issuanceId: fixture.issuanceIds[0]! } }),
    ).resolves.toBe(1);
  });

  it("enforces one index per list and one allocation per issuance", async () => {
    const list = await createStatusList("constraints");
    await prisma.$transaction((tx) => reserveStatusAllocation(tx, fixture.publicIds[0]!));
    const allocation = await prisma.credentialStatusAllocation.findUniqueOrThrow({
      where: { issuanceId: fixture.issuanceIds[0]! },
    });
    await expect(
      prisma.credentialStatusAllocation.create({
        data: {
          issuanceId: fixture.issuanceIds[1]!,
          statusListId: list.id,
          index: allocation.index,
        },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.credentialStatusAllocation.create({
        data: { issuanceId: fixture.issuanceIds[0]!, statusListId: list.id, index: 4 },
      }),
    ).rejects.toThrow();
  });

  it("restricts deleting a status list and a history-referenced allocation", async () => {
    const list = await createStatusList("history");
    await prisma.$transaction((tx) => reserveStatusAllocation(tx, fixture.publicIds[0]!));
    const allocation = await prisma.credentialStatusAllocation.findUniqueOrThrow({
      where: { issuanceId: fixture.issuanceIds[0]! },
    });
    await expect(prisma.credentialStatusList.delete({ where: { id: list.id } })).rejects.toThrow();
    await prisma.$executeRaw(
      Prisma.sql`UPDATE badge_issuances SET signed_credential_json = JSON_OBJECT() WHERE id = ${fixture.issuanceIds[0]!}`,
    );
    await expect(
      prisma.credentialStatusAllocation.delete({ where: { id: allocation.id } }),
    ).rejects.toThrow();
  });

  it("rejects self-replacements, cross-field contradictions, and immediate same-direction replacement cycles", async () => {
    await expect(
      prisma.$executeRaw(Prisma.sql`
      UPDATE badge_issuances SET supersedes_id = id WHERE id = ${fixture.issuanceIds[0]!}
    `),
    ).rejects.toThrow();
    await prisma.$executeRaw(Prisma.sql`
      UPDATE badge_issuances SET supersedes_id = ${fixture.issuanceIds[1]!} WHERE id = ${fixture.issuanceIds[0]!}
    `);
    await expect(
      prisma.$executeRaw(Prisma.sql`
      UPDATE badge_issuances SET supersedes_id = ${fixture.issuanceIds[0]!} WHERE id = ${fixture.issuanceIds[1]!}
    `),
    ).rejects.toThrow();
    await expect(
      prisma.$executeRaw(Prisma.sql`
        UPDATE badge_issuances
        SET supersedes_id = ${fixture.issuanceIds[1]!}, superseded_by_id = ${fixture.issuanceIds[1]!}
        WHERE id = ${fixture.issuanceIds[0]!}
      `),
    ).rejects.toThrow();
  });

  it("serializes concurrent opposite replacement updates so they cannot form a cycle", async () => {
    const updates = await Promise.allSettled([
      prisma.$transaction((tx) =>
        tx.$executeRaw(Prisma.sql`
          UPDATE badge_issuances
          SET supersedes_id = ${fixture.issuanceIds[1]!}
          WHERE id = ${fixture.issuanceIds[0]!}
        `),
      ),
      prisma.$transaction((tx) =>
        tx.$executeRaw(Prisma.sql`
          UPDATE badge_issuances
          SET supersedes_id = ${fixture.issuanceIds[0]!}
          WHERE id = ${fixture.issuanceIds[1]!}
        `),
      ),
    ]);
    expect(updates.filter((result) => result.status === "rejected")).toHaveLength(1);
    const issuances = await prisma.badgeIssuance.findMany({
      where: { id: { in: fixture.issuanceIds } },
      select: { id: true, supersedesId: true },
    });
    expect(
      issuances.some((issuance) =>
        issuances.some(
          (other) => issuance.supersedesId === other.id && other.supersedesId === issuance.id,
        ),
      ),
    ).toBe(false);
  });

  it("restricts deleting an issuance that replacement history references", async () => {
    await prisma.$executeRaw(Prisma.sql`
      UPDATE badge_issuances SET superseded_by_id = ${fixture.issuanceIds[1]!} WHERE id = ${fixture.issuanceIds[0]!}
    `);
    await expect(
      prisma.badgeIssuance.delete({ where: { id: fixture.issuanceIds[1]! } }),
    ).rejects.toThrow();
  });
});
