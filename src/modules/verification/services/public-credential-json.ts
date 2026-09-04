import "server-only";

import {
  PublicCredentialLifecycleExtension,
  PublicCredentialSchema,
  PublicOpenBadgeCredentialSchema,
  type PublicCredential,
  type PublicOpenBadgeCredential,
} from "../types";
import type { SignedOpenBadgeCredential } from "@/modules/open-badges/credential-schema";

export function buildPublicCredentialJson(
  detail: PublicCredential,
): PublicOpenBadgeCredential | SignedOpenBadgeCredential {
  const publicDetail = PublicCredentialSchema.parse(detail);
  if (publicDetail.signedCredentialJson) return publicDetail.signedCredentialJson;
  const credential = publicDetail.credential;

  return PublicOpenBadgeCredentialSchema.parse({
    "@context": [...credential["@context"]],
    id: credential.id,
    type: [...credential.type],
    name: credential.name,
    issuer: {
      id: credential.issuer.id,
      type: [...credential.issuer.type],
      name: credential.issuer.name,
      image: { ...credential.issuer.image },
    },
    validFrom: credential.validFrom,
    ...(credential.validUntil ? { validUntil: credential.validUntil } : {}),
    credentialSubject: {
      type: [...credential.credentialSubject.type],
      identifier: credential.credentialSubject.identifier.map((identifier) => ({ ...identifier })),
      achievement: {
        id: credential.credentialSubject.achievement.id,
        type: [...credential.credentialSubject.achievement.type],
        name: credential.credentialSubject.achievement.name,
        description: credential.credentialSubject.achievement.description,
        criteria: { ...credential.credentialSubject.achievement.criteria },
        image: { ...credential.credentialSubject.achievement.image },
        ...(credential.credentialSubject.achievement.tag
          ? { tag: [...credential.credentialSubject.achievement.tag] }
          : {}),
        ...(credential.credentialSubject.achievement.alignment
          ? {
              alignment: credential.credentialSubject.achievement.alignment.map((alignment) => ({
                type: [...alignment.type],
                targetName: alignment.targetName,
                targetUrl: alignment.targetUrl,
              })),
            }
          : {}),
      },
    },
    [PublicCredentialLifecycleExtension]: {
      status: publicDetail.status,
      ...(publicDetail.expiresAt ? { expiresAt: publicDetail.expiresAt } : {}),
      ...(publicDetail.revokedAt ? { revokedAt: publicDetail.revokedAt } : {}),
      ...(publicDetail.revocationReason ? { revocationReason: publicDetail.revocationReason } : {}),
      unsigned: true,
      certified: false,
    },
  });
}

export function serializePublicCredentialJson(detail: PublicCredential): string {
  return JSON.stringify(buildPublicCredentialJson(detail));
}
