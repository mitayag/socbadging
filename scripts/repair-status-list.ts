import "dotenv/config";

import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { Prisma, PrismaClient } from "@prisma/client";

import { readRevocationStatus } from "../src/modules/open-badges/status-list";
import { regenerateSignedStatusList } from "../src/modules/verification/services/status-list-publication";
import { createSignerRuntime } from "../src/signer/runtime";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

const databaseUrl = required("DATABASE_URL");
const keyId = required("SIGNING_KEY_ID");
const privateKeyPath =
  process.env.SIGNING_PRIVATE_KEY_PATH?.trim() ||
  process.env.SIGNING_PRIVATE_KEY_FILE?.trim() ||
  "";
if (!privateKeyPath)
  throw new Error("SIGNING_PRIVATE_KEY_PATH or SIGNING_PRIVATE_KEY_FILE is required");

const listId = process.argv[2]?.trim() || "status-list-local";

const url = new URL(databaseUrl);
const prisma = new PrismaClient({
  adapter: new PrismaMariaDb({
    host: url.hostname,
    port: Number(url.port || 3306),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.slice(1),
    connectionLimit: 2,
  }),
});

try {
  const runtime = await createSignerRuntime({
    privateKeyPath,
    keyId,
    publicKeyMultibase: required("SIGNING_PUBLIC_MULTIKEY"),
    fingerprint: required("SIGNING_KEY_FINGERPRINT"),
  });
  if (runtime.getHealth().status !== "ready" || runtime.getHealth().keyId !== keyId) {
    throw new Error("Signer runtime is not ready for the configured key");
  }

  const administrator = await prisma.user.findFirst({
    where: { role: "ADMIN", status: "ACTIVE", deletedAt: null },
    select: { id: true },
  });

  const result = await prisma.$transaction(async (tx) => {
    const before = await tx.credentialStatusList.findUnique({
      where: { id: listId },
      select: {
        id: true,
        version: true,
        signingKeyId: true,
        allocations: {
          select: { index: true, isRevoked: true, statusListVersion: true },
          orderBy: { index: "asc" },
        },
      },
    });
    if (!before) throw new Error(`Status list ${listId} does not exist`);

    const signed = await regenerateSignedStatusList(tx, listId, {
      signCredential: (document, correlationId) => runtime.sign(document, correlationId),
    });

    const after = await tx.credentialStatusList.findUniqueOrThrow({
      where: { id: listId },
      select: {
        version: true,
        signingKeyId: true,
        allocations: {
          select: { index: true, isRevoked: true, statusListVersion: true },
          orderBy: { index: "asc" },
        },
      },
    });

    for (const allocation of after.allocations) {
      const signedRevoked = readRevocationStatus(
        signed.credentialSubject.encodedList,
        allocation.index,
      );
      if (signedRevoked !== allocation.isRevoked) {
        throw new Error(`Signed status does not match allocation index ${allocation.index}`);
      }
      if (allocation.isRevoked && allocation.statusListVersion !== after.version) {
        throw new Error(`Revoked allocation index ${allocation.index} did not advance its version`);
      }
      if (allocation.statusListVersion > after.version) {
        throw new Error(`Allocation index ${allocation.index} references a future list version`);
      }
    }

    await tx.auditLog.create({
      data: {
        actorUserId: administrator?.id ?? null,
        action: "credential-status-list.repaired",
        entityType: "CredentialStatusList",
        entityId: listId,
        contextJson: {
          listId,
          source: "stage5c1-repair-status-list",
          previousVersion: before.version,
          newVersion: after.version,
          signingKeyId: after.signingKeyId,
          revokedCount: after.allocations.filter((allocation) => allocation.isRevoked).length,
          activeCount: after.allocations.filter((allocation) => !allocation.isRevoked).length,
        } satisfies Prisma.InputJsonValue,
      },
    });

    return {
      listId,
      previousVersion: before.version,
      newVersion: after.version,
      revokedCount: after.allocations.filter((allocation) => allocation.isRevoked).length,
      activeCount: after.allocations.filter((allocation) => !allocation.isRevoked).length,
      signingKeyId: after.signingKeyId,
    };
  });

  console.log(JSON.stringify(result, null, 2));
} finally {
  await prisma.$disconnect();
}
