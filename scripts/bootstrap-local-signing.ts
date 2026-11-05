import { createHash, randomUUID } from "node:crypto";

import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { Prisma, PrismaClient } from "@prisma/client";

import {
  SignedStatusListCredentialSchema,
  UnsignedStatusListCredentialSchema,
} from "../src/modules/open-badges/credential-schema";
import {
  encodeRevocationList,
  MIN_BITSTRING_STATUS_LIST_CAPACITY,
} from "../src/modules/open-badges/status-list";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

const databaseUrl = required("DATABASE_URL");
const appUrl = required("APP_URL").replace(/\/+$/, "");
const signerUrl = required("SIGNER_URL").replace(/\/+$/, "");
const signerToken = required("SIGNER_TOKEN");
const keyId = required("SIGNING_KEY_ID");
const publicMultikey = required("SIGNING_PUBLIC_MULTIKEY");
const fingerprint = required("SIGNING_KEY_FINGERPRINT");
const cryptosuite = process.env.SIGNING_CRYPTOSUITE?.trim() || "eddsa-rdfc-2022";
if (cryptosuite !== "eddsa-rdfc-2022") throw new Error("Unsupported signing cryptosuite");

const controllerUrl = new URL("/api/issuers/hau-soc", `${appUrl}/`).toString();
const statusListId = "status-list-local";
const statusListUrl = new URL(`/api/status-lists/${statusListId}`, `${appUrl}/`).toString();
const capacity = MIN_BITSTRING_STATUS_LIST_CAPACITY;

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

async function signStatusList(): Promise<Record<string, unknown>> {
  const unsigned = UnsignedStatusListCredentialSchema.parse({
    "@context": ["https://www.w3.org/ns/credentials/v2"],
    id: statusListUrl,
    type: ["VerifiableCredential", "BitstringStatusListCredential"],
    issuer: controllerUrl,
    validFrom: new Date().toISOString(),
    credentialSubject: {
      id: `${statusListUrl}#list`,
      type: "BitstringStatusList",
      statusPurpose: "revocation",
      encodedList: encodeRevocationList([], capacity),
    },
  });
  const response = await fetch(`${signerUrl}/v1/sign`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${signerToken}`,
      "content-type": "application/json",
      "x-correlation-id": randomUUID(),
    },
    body: JSON.stringify({ operation: "credential.sign", document: unsigned }),
  });
  if (!response.ok) throw new Error(`Signer rejected the initial status list: ${response.status}`);
  const payload = (await response.json()) as { document?: unknown };
  const signed = SignedStatusListCredentialSchema.parse(payload.document);
  if (signed.proof.verificationMethod !== keyId) {
    throw new Error("Signer returned a status list for an unexpected key");
  }
  return signed as unknown as Record<string, unknown>;
}

try {
  const signedStatusList = await signStatusList();
  const signedStatusJson = JSON.parse(JSON.stringify(signedStatusList)) as Prisma.InputJsonValue;
  const digest = createHash("sha256").update(JSON.stringify(signedStatusList)).digest("hex");
  const now = new Date();
  const administrator = await prisma.user.findFirst({
    where: { role: "ADMIN", status: "ACTIVE", deletedAt: null },
    select: { id: true },
  });

  const result = await prisma.$transaction(async (tx) => {
    const existingKey = await tx.signingKey.findUnique({
      where: { verificationMethodUrl: keyId },
      select: { id: true, status: true, compromisedAt: true, activatedAt: true },
    });
    if (existingKey?.status === "COMPROMISED" || existingKey?.compromisedAt) {
      throw new Error("Refusing to reactivate a compromised signing key");
    }

    await tx.signingKey.updateMany({
      where: { status: "ACTIVE", verificationMethodUrl: { not: keyId } },
      data: { status: "RETIRED", retiredAt: now },
    });

    const key = existingKey
      ? await tx.signingKey.update({
          where: { id: existingKey.id },
          data: {
            controllerUrl,
            algorithm: "Ed25519",
            cryptosuite: "eddsa-rdfc-2022",
            publicMultikey,
            fingerprint,
            status: "ACTIVE",
            activatedAt: existingKey.activatedAt ?? now,
            retiredAt: null,
          },
        })
      : await tx.signingKey.create({
          data: {
            verificationMethodUrl: keyId,
            controllerUrl,
            algorithm: "Ed25519",
            cryptosuite: "eddsa-rdfc-2022",
            publicMultikey,
            fingerprint,
            status: "ACTIVE",
            activatedAt: now,
          },
        });

    if (!existingKey) {
      await tx.auditLog.create({
        data: {
          actorUserId: administrator?.id ?? null,
          action: "signing-key.registered",
          entityType: "SigningKey",
          entityId: key.id,
          contextJson: { source: "bootstrap-local-signing" },
        },
      });
    }
    await tx.auditLog.create({
      data: {
        actorUserId: administrator?.id ?? null,
        action: "signing-key.activated",
        entityType: "SigningKey",
        entityId: key.id,
        contextJson: { source: "bootstrap-local-signing" },
      },
    });

    const existingList = await tx.credentialStatusList.findUnique({
      where: { publicUrl: statusListUrl },
      select: {
        id: true,
        publicUrl: true,
        version: true,
        signedCredentialJson: true,
        allocations: {
          select: { isRevoked: true, statusListVersion: true },
        },
      },
    });

    if (existingList?.signedCredentialJson) {
      // A published status list must never be overwritten by a bootstrap rerun. The bootstrap
      // used to publish an empty list, advance the version, and leave allocation versions behind,
      // which made the public status-list endpoint fail closed.
      const inconsistent = existingList.allocations.some((allocation) =>
        allocation.isRevoked
          ? allocation.statusListVersion !== existingList.version
          : allocation.statusListVersion > existingList.version,
      );
      if (inconsistent) {
        throw new Error(
          `Published status list ${existingList.id} has inconsistent allocation versions; run scripts/repair-status-list.ts`,
        );
      }
      return {
        keyId: key.id,
        statusListId: existingList.id,
        publicUrl: existingList.publicUrl,
        statusListUpdated: false,
      };
    }

    if (existingList && existingList.allocations.length > 0) {
      throw new Error(
        `Status list ${existingList.id} has allocations but no signed list; run scripts/repair-status-list.ts`,
      );
    }

    const list = existingList
      ? await tx.credentialStatusList.update({
          where: { id: existingList.id },
          data: {
            purpose: "revocation",
            signedCredentialJson: signedStatusJson,
            signingKeyId: key.id,
            digest,
          },
        })
      : await tx.credentialStatusList.create({
          data: {
            id: statusListId,
            publicUrl: statusListUrl,
            purpose: "revocation",
            capacity,
            nextIndex: 0,
            signedCredentialJson: signedStatusJson,
            signingKeyId: key.id,
            digest,
            version: 0,
          },
        });

    return {
      keyId: key.id,
      statusListId: list.id,
      publicUrl: list.publicUrl,
      statusListUpdated: true,
    };
  });

  console.log(JSON.stringify(result, null, 2));
} finally {
  await prisma.$disconnect();
}
