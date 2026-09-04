import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";

import { Prisma } from "@prisma/client";

import {
  SignedStatusListCredentialSchema,
  UnsignedStatusListCredentialSchema,
  VC_V2_CONTEXT_URL,
  type SignedStatusListCredential,
} from "@/modules/open-badges/credential-schema";
import type { SignedOpenBadgeCredential } from "@/modules/open-badges/proof";
import {
  encodeRevocationList,
  MIN_BITSTRING_STATUS_LIST_CAPACITY,
} from "@/modules/open-badges/status-list";

type LockedStatusList = {
  id: string;
  publicUrl: string;
  purpose: string;
  capacity: number;
  version: number;
  createdAt: Date;
};
type LockedSigningKey = {
  id: string;
  verificationMethodUrl: string;
  controllerUrl: string;
  status: string;
  compromisedAt: Date | null;
};
type LockedRevokedAllocation = { index: number };

export type StatusListSigner = {
  signCredential(document: unknown, correlationId: string): Promise<SignedOpenBadgeCredential>;
};

export class StatusListRegenerationError extends Error {
  constructor(message = "Credential status list cannot be regenerated") {
    super(message);
    this.name = "StatusListRegenerationError";
  }
}

/**
 * Locks the parent list before allocation status changes. This ordering avoids
 * MariaDB foreign-key lock upgrades deadlocking concurrent revocations.
 */
export async function lockCredentialStatusList(
  tx: Prisma.TransactionClient,
  listId: string,
): Promise<LockedStatusList> {
  const [locked] = await tx.$queryRaw<LockedStatusList[]>(Prisma.sql`
    SELECT
      id,
      public_url AS publicUrl,
      purpose,
      capacity,
      version,
      created_at AS createdAt
    FROM credential_status_lists
    WHERE id = ${listId}
    FOR UPDATE
  `);
  if (!locked) throw new StatusListRegenerationError("Credential status list is unavailable");
  return locked;
}

export async function regenerateSignedStatusList(
  tx: Prisma.TransactionClient,
  listId: string,
  signer: StatusListSigner,
): Promise<SignedStatusListCredential> {
  const list = await lockCredentialStatusList(tx, listId);
  if (list.purpose !== "revocation") {
    throw new StatusListRegenerationError("Credential status purpose is unsupported");
  }
  if (list.capacity < MIN_BITSTRING_STATUS_LIST_CAPACITY) {
    throw new StatusListRegenerationError(
      `Credential status list must contain at least ${MIN_BITSTRING_STATUS_LIST_CAPACITY} entries`,
    );
  }
  // Match lifecycle-service ordering by locking the active-key set before an
  // individual key. The lock is retained through signing and persistence.
  const activeKeys = await tx.$queryRaw<LockedSigningKey[]>(Prisma.sql`
    SELECT
      id,
      verification_method_url AS verificationMethodUrl,
      controller_url AS controllerUrl,
      status,
      compromised_at AS compromisedAt
    FROM signing_keys
    WHERE status = 'ACTIVE' AND compromised_at IS NULL
    ORDER BY activated_at DESC, id ASC
    LIMIT 2
    FOR UPDATE
  `);
  if (activeKeys.length !== 1) {
    throw new StatusListRegenerationError("One active signing key is required");
  }
  const [signingKey] = activeKeys;
  if (!signingKey) throw new StatusListRegenerationError("One active signing key is required");

  const revokedAllocations = await tx.$queryRaw<LockedRevokedAllocation[]>(Prisma.sql`
    SELECT \`index\`
    FROM credential_status_allocations
    WHERE status_list_id = ${list.id} AND is_revoked = TRUE
    ORDER BY \`index\` ASC
    FOR UPDATE
  `);
  const unsigned = UnsignedStatusListCredentialSchema.parse({
    "@context": [VC_V2_CONTEXT_URL],
    id: list.publicUrl,
    type: ["VerifiableCredential", "BitstringStatusListCredential"],
    issuer: signingKey.controllerUrl,
    validFrom: list.createdAt.toISOString(),
    credentialSubject: {
      id: `${list.publicUrl}#list`,
      type: "BitstringStatusList",
      statusPurpose: "revocation",
      encodedList: encodeRevocationList(
        revokedAllocations.map((allocation) => allocation.index),
        list.capacity,
      ),
    },
  });

  const signed = SignedStatusListCredentialSchema.parse(
    await signer.signCredential(unsigned, randomUUID()),
  );
  const { proof, ...signedPayload } = signed;
  if (
    !isDeepStrictEqual(signedPayload, unsigned) ||
    proof.verificationMethod !== signingKey.verificationMethodUrl
  ) {
    throw new StatusListRegenerationError("Signer returned a noncanonical status list");
  }

  const [currentSigningKey] = await tx.$queryRaw<LockedSigningKey[]>(Prisma.sql`
    SELECT
      id,
      verification_method_url AS verificationMethodUrl,
      controller_url AS controllerUrl,
      status,
      compromised_at AS compromisedAt
    FROM signing_keys
    WHERE id = ${signingKey.id}
    FOR UPDATE
  `);
  if (
    !currentSigningKey ||
    currentSigningKey.status !== "ACTIVE" ||
    currentSigningKey.compromisedAt !== null ||
    currentSigningKey.verificationMethodUrl !== signingKey.verificationMethodUrl ||
    currentSigningKey.controllerUrl !== signingKey.controllerUrl
  ) {
    throw new StatusListRegenerationError("Signing key is no longer active");
  }

  const version = list.version + 1;
  const digest = createHash("sha256").update(JSON.stringify(signed)).digest("hex");
  const updated = await tx.credentialStatusList.updateMany({
    where: { id: list.id, version: list.version },
    data: {
      signedCredentialJson: signed as Prisma.InputJsonValue,
      signingKeyId: signingKey.id,
      version,
      digest,
    },
  });
  if (updated.count !== 1) {
    throw new StatusListRegenerationError("Credential status list changed during regeneration");
  }
  await tx.credentialStatusAllocation.updateMany({
    where: { statusListId: list.id },
    data: { statusListVersion: version },
  });

  return signed;
}
