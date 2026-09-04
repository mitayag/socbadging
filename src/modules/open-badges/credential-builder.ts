import { createHash } from "node:crypto";

import { z } from "zod";

import type { StatusAllocationReservation } from "@/modules/issuance/services/status-allocation-service";
import { SignedCredentialBuildSnapshotSchema } from "@/modules/issuance/services/snapshot-schemas";
import type { OpenBadgeCredentialSnapshot } from "@/modules/issuance/types";

import {
  CanonicalResourceUrlSchema,
  OPEN_BADGES_CONTEXT_URL,
  OPEN_BADGES_CREDENTIAL_SCHEMA_URL,
  OPEN_BADGES_EXTENSIONS_CONTEXT_URL,
  UnsignedOpenBadgeCredentialSchema,
  VC_V2_CONTEXT_URL,
  verificationMethodBelongsToController,
  type UnsignedOpenBadgeCredential,
} from "./credential-schema";
import { buildStatusListEntry } from "./status-list";

export type SignedCredentialBuildInput = {
  snapshot: OpenBadgeCredentialSnapshot;
  recipientEmail: string;
  signingKey: {
    controllerUrl: string;
    verificationMethodUrl: string;
  };
  statusAllocation: StatusAllocationReservation;
};

/**
 * Open Badges email identity input: trim outer whitespace, lowercase the
 * address, validate it, then hash the UTF-8 bytes without a salt.
 */
export function normalizeOpenBadgeEmailIdentifier(value: string): string {
  return z.email().parse(value.trim().toLowerCase());
}

export function hashOpenBadgeEmailIdentifier(value: string): string {
  const normalized = normalizeOpenBadgeEmailIdentifier(value);
  return `sha256$${createHash("sha256").update(normalized, "utf8").digest("hex")}`;
}

function buildPublicAchievementId(snapshot: OpenBadgeCredentialSnapshot): string {
  const digest = createHash("sha256")
    .update(snapshot.credentialSubject.achievement.id, "utf8")
    .digest("hex");
  return new URL(`/achievements/${digest}`, snapshot.id).toString();
}

export function buildOpenBadgeCredential(
  input: SignedCredentialBuildInput,
): UnsignedOpenBadgeCredential {
  const snapshot = SignedCredentialBuildSnapshotSchema.parse(input.snapshot);
  const controllerUrl = CanonicalResourceUrlSchema.parse(input.signingKey.controllerUrl);
  const verificationMethodUrl = CanonicalResourceUrlSchema.parse(
    input.signingKey.verificationMethodUrl,
  );
  if (snapshot.issuer.id !== controllerUrl) {
    throw new Error("Credential issuer must match the signing-key controller");
  }
  if (!verificationMethodBelongsToController(verificationMethodUrl, controllerUrl)) {
    throw new Error("Signing key URL must be canonical for the issuer controller");
  }

  return UnsignedOpenBadgeCredentialSchema.parse({
    "@context": [VC_V2_CONTEXT_URL, OPEN_BADGES_CONTEXT_URL, OPEN_BADGES_EXTENSIONS_CONTEXT_URL],
    id: snapshot.id,
    type: ["VerifiableCredential", "OpenBadgeCredential"],
    name: snapshot.name,
    issuer: structuredClone(snapshot.issuer),
    validFrom: snapshot.validFrom,
    ...(snapshot.validUntil ? { validUntil: snapshot.validUntil } : {}),
    credentialSubject: {
      type: ["AchievementSubject"],
      identifier: [
        {
          type: "IdentityObject",
          identityHash: hashOpenBadgeEmailIdentifier(input.recipientEmail),
          identityType: "emailAddress",
          hashed: true,
        },
      ],
      achievement: {
        ...structuredClone(snapshot.credentialSubject.achievement),
        id: buildPublicAchievementId(snapshot),
      },
    },
    credentialStatus: buildStatusListEntry(input.statusAllocation),
    credentialSchema: [
      {
        id: OPEN_BADGES_CREDENTIAL_SCHEMA_URL,
        type: "1EdTechJsonSchemaValidator2019",
      },
    ],
  });
}
