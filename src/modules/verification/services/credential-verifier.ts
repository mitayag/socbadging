import "server-only";

import { SignedOpenBadgeCredentialSchema } from "@/modules/open-badges/credential-schema";

export type VerificationOutcome =
  "VERIFIED" | "REVOKED" | "EXPIRED" | "INVALID_PROOF" | "VERIFICATION_UNAVAILABLE";

export type VerificationDependencies = {
  now?: () => Date;
  getIssuer: (issuerId: string) => Promise<{ id: string; verificationMethod: string[] } | null>;
  getKey: (keyId: string) => Promise<{
    id: string;
    controller: string;
    type: "Multikey";
    publicKeyMultibase: string;
    trustState: "ACTIVE" | "RETIRED" | "COMPROMISED";
  } | null>;
  getStatusList: (statusListId: string, index: number) => Promise<{ revoked: boolean }>;
  verifyProof: (document: unknown, keyId: string) => Promise<boolean>;
};

export type PublicCredentialVerification = {
  outcome: VerificationOutcome;
  keyId?: string;
  checkedAt: Date;
};

function result(
  outcome: VerificationOutcome,
  checkedAt: Date,
  keyId?: string,
): PublicCredentialVerification {
  return keyId ? { outcome, keyId, checkedAt } : { outcome, checkedAt };
}

export async function verifyPublicCredential(
  document: unknown,
  dependencies: VerificationDependencies,
): Promise<PublicCredentialVerification> {
  const checkedAt = dependencies.now?.() ?? new Date();
  if (Number.isNaN(checkedAt.valueOf())) return result("VERIFICATION_UNAVAILABLE", new Date());

  const parsed = SignedOpenBadgeCredentialSchema.safeParse(document);
  if (!parsed.success) return result("INVALID_PROOF", checkedAt);
  const credential = parsed.data;
  const keyId = credential.proof.verificationMethod;

  try {
    const [issuer, key] = await Promise.all([
      dependencies.getIssuer(credential.issuer.id),
      dependencies.getKey(keyId),
    ]);
    if (
      !issuer ||
      !key ||
      issuer.id !== credential.issuer.id ||
      !issuer.verificationMethod.includes(keyId) ||
      key.id !== keyId ||
      key.controller !== credential.issuer.id ||
      key.trustState === "COMPROMISED"
    ) {
      return result("INVALID_PROOF", checkedAt, keyId);
    }
    if (Date.parse(credential.validFrom) > checkedAt.valueOf()) {
      return result("INVALID_PROOF", checkedAt, keyId);
    }
    if (!(await dependencies.verifyProof(credential, keyId))) {
      return result("INVALID_PROOF", checkedAt, keyId);
    }
    const status = await dependencies.getStatusList(
      credential.credentialStatus.statusListCredential,
      Number(credential.credentialStatus.statusListIndex),
    );
    if (status.revoked) return result("REVOKED", checkedAt, keyId);
    if (credential.validUntil && Date.parse(credential.validUntil) <= checkedAt.valueOf()) {
      return result("EXPIRED", checkedAt, keyId);
    }
    return result("VERIFIED", checkedAt, keyId);
  } catch {
    return result("VERIFICATION_UNAVAILABLE", checkedAt, keyId);
  }
}
