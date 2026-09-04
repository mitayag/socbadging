import "server-only";

import { Prisma } from "@prisma/client";
import { z } from "zod";

import {
  AchievementSnapshotSchema,
  IssuerSnapshotSchema,
  OpenBadgeCredentialSnapshotSchema,
  RecipientSnapshotSchema,
} from "@/modules/issuance/services/snapshot-schemas";
import { getPublicSystemSettings } from "@/modules/settings/services/system-settings-service";
import { prisma } from "@/platform/db/prisma";
import {
  SignedOpenBadgeCredentialSchema,
  SignedStatusListCredentialSchema,
  decodeStatusListBytes,
} from "@/modules/open-badges/credential-schema";
import { verifyEddsaRdfc2022Proof } from "@/modules/open-badges/proof";
import { verifyPublicCredential } from "./credential-verifier";
import {
  PublicCredentialIdSchema,
  PublicCredentialSchema,
  PublicCredentialStatusSchema,
  type PublicCredential,
  type PublicCredentialStatus,
} from "../types";

const publicCredentialSelect = {
  publicId: true,
  status: true,
  issuedAt: true,
  expiresAt: true,
  revocationReason: true,
  revokedAt: true,
  recipientSnapshotJson: true,
  achievementSnapshotJson: true,
  issuerSnapshotJson: true,
  credentialJson: true,
  signedCredentialJson: true,
  signingKeyId: true,
  signingKey: {
    select: {
      verificationMethodUrl: true,
      controllerUrl: true,
      publicMultikey: true,
      status: true,
    },
  },
  statusAllocation: {
    select: {
      index: true,
      statusList: {
        select: {
          publicUrl: true,
          signedCredentialJson: true,
          signingKey: {
            select: {
              verificationMethodUrl: true,
              controllerUrl: true,
              publicMultikey: true,
              status: true,
            },
          },
        },
      },
    },
  },
} satisfies Prisma.BadgeIssuanceSelect;

type PublicCredentialRecord = Prisma.BadgeIssuanceGetPayload<{
  select: typeof publicCredentialSelect;
}>;

export class PublicCredentialNotFoundError extends Error {
  constructor() {
    super("Credential not found");
    this.name = "PublicCredentialNotFoundError";
  }
}

export function effectiveCredentialStatus(input: {
  status: PublicCredentialStatus;
  expiresAt: Date | null;
  now: Date;
}): PublicCredentialStatus {
  if (input.status === "REVOKED") return "REVOKED";
  if (input.expiresAt !== null && input.expiresAt <= input.now) return "EXPIRED";
  if (input.status === "EXPIRED" && input.expiresAt === null) {
    throw new PublicCredentialNotFoundError();
  }
  return "ACTIVE";
}

function toIsoDate(value: Date | null): string | null {
  if (value === null) return null;
  if (!(value instanceof Date) || Number.isNaN(value.valueOf())) {
    throw new PublicCredentialNotFoundError();
  }
  return value.toISOString();
}

function normalizePublicNamePart(value: string): string | null {
  const normalized = value.normalize("NFC").trim().replace(/\s+/gu, " ");
  if (!normalized) return "";
  return /^(?:[\p{L}][\p{L}\p{M}'’.-]*)(?: [\p{L}][\p{L}\p{M}'’.-]*)*$/u.test(normalized)
    ? normalized
    : null;
}

function recipientDisplayName(firstName: string, lastName: string): string {
  const first = normalizePublicNamePart(firstName);
  const last = normalizePublicNamePart(lastName);
  if (!first || last === null) return "Recipient";
  if (!last) return first;
  const initial = Array.from(last)[0];
  return initial ? `${first} ${initial}.` : first;
}

function parseSnapshot<T>(schema: z.ZodType<T>, value: Prisma.JsonValue): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new PublicCredentialNotFoundError();
  return result.data;
}

function statusBit(bytes: Buffer, index: number): boolean {
  const byte = bytes[Math.floor(index / 8)];
  if (byte === undefined || !Number.isSafeInteger(index) || index < 0) {
    throw new PublicCredentialNotFoundError();
  }
  return (byte & (1 << (7 - (index % 8)))) !== 0;
}

async function signedVerification(
  document: z.output<typeof SignedOpenBadgeCredentialSchema>,
  record: PublicCredentialRecord,
  now: Date,
) {
  if (!record.signingKey || !record.statusAllocation) {
    return { outcome: "VERIFICATION_UNAVAILABLE" as const, checkedAt: now.toISOString() };
  }
  const key = record.signingKey;
  const allocation = record.statusAllocation;
  const verification = await verifyPublicCredential(document, {
    now: () => now,
    getIssuer: async (id) =>
      id === key.controllerUrl ? { id, verificationMethod: [key.verificationMethodUrl] } : null,
    getKey: async (id) =>
      id === key.verificationMethodUrl
        ? {
            id,
            controller: key.controllerUrl,
            type: "Multikey",
            publicKeyMultibase: key.publicMultikey,
            trustState: key.status,
          }
        : null,
    getStatusList: async (statusUrl, index) => {
      const list = allocation.statusList;
      const parsed = SignedStatusListCredentialSchema.safeParse(list.signedCredentialJson);
      const statusKey = list.signingKey;
      if (
        !parsed.success ||
        !statusKey ||
        statusKey.status === "COMPROMISED" ||
        parsed.data.id !== statusUrl ||
        list.publicUrl !== statusUrl ||
        allocation.index !== index
      ) {
        throw new Error("Signed status list is unavailable");
      }
      if (
        !(await verifyEddsaRdfc2022Proof(parsed.data, {
          id: statusKey.verificationMethodUrl,
          controller: statusKey.controllerUrl,
          publicKeyMultibase: statusKey.publicMultikey,
        }))
      ) {
        throw new Error("Status list proof is unavailable");
      }
      return {
        revoked: statusBit(decodeStatusListBytes(parsed.data.credentialSubject.encodedList), index),
      };
    },
    verifyProof: async (document, keyId) => {
      if (keyId !== key.verificationMethodUrl) return false;
      return verifyEddsaRdfc2022Proof(document, {
        id: key.verificationMethodUrl,
        controller: key.controllerUrl,
        publicKeyMultibase: key.publicMultikey,
      });
    },
  });
  return { ...verification, checkedAt: verification.checkedAt.toISOString() };
}

async function toPublicCredential(
  record: PublicCredentialRecord,
  settings: Awaited<ReturnType<typeof getPublicSystemSettings>>,
  now: Date,
): Promise<PublicCredential> {
  const status = PublicCredentialStatusSchema.safeParse(record.status);
  if (!status.success) throw new PublicCredentialNotFoundError();

  const recipient = parseSnapshot(RecipientSnapshotSchema, record.recipientSnapshotJson);
  const achievement = parseSnapshot(AchievementSnapshotSchema, record.achievementSnapshotJson);
  const issuer = parseSnapshot(IssuerSnapshotSchema, record.issuerSnapshotJson);
  const legacyCredential = parseSnapshot(OpenBadgeCredentialSnapshotSchema, record.credentialJson);
  const signedDocument = record.signedCredentialJson
    ? SignedOpenBadgeCredentialSchema.safeParse(record.signedCredentialJson)
    : null;
  if (record.signedCredentialJson && (!signedDocument || !signedDocument.success)) {
    throw new PublicCredentialNotFoundError();
  }
  const issuedAt = toIsoDate(record.issuedAt);
  const expiresAt = toIsoDate(record.expiresAt);
  const revokedAt = toIsoDate(record.revokedAt);
  if (issuedAt === null) throw new PublicCredentialNotFoundError();

  const effectiveStatus = effectiveCredentialStatus({
    status: status.data,
    expiresAt: record.expiresAt,
    now,
  });
  const revocationReason =
    effectiveStatus === "REVOKED"
      ? z.string().trim().min(1).max(1000).safeParse(record.revocationReason).data
      : null;

  if (effectiveStatus === "REVOKED" && (!revocationReason || revokedAt === null)) {
    throw new PublicCredentialNotFoundError();
  }

  return PublicCredentialSchema.parse({
    publicId: record.publicId,
    status: effectiveStatus,
    issuedAt,
    expiresAt,
    revokedAt: effectiveStatus === "REVOKED" ? revokedAt : null,
    revocationReason,
    recipientDisplayName: recipientDisplayName(recipient.firstName, recipient.lastName),
    achievement: {
      id: achievement.id,
      type: [...achievement.type],
      name: achievement.name,
      description: achievement.description,
      criteria: { narrative: achievement.criteria.narrative },
      image: { id: achievement.image.id, type: achievement.image.type },
      skills: [...achievement.skills],
      ...(achievement.tag ? { tag: [...achievement.tag] } : {}),
      ...(achievement.alignment
        ? {
            alignment: achievement.alignment.map((alignment) => ({
              type: [...alignment.type] as ["Alignment"],
              targetName: alignment.targetName,
              targetUrl: alignment.targetUrl,
            })),
          }
        : {}),
      class: {
        courseCode: achievement.class.courseCode,
        title: achievement.class.title,
        section: achievement.class.section,
        term: achievement.class.term,
        academicYear: achievement.class.academicYear,
      },
    },
    issuer: {
      name: issuer.name,
      url: issuer.url,
      logoUrl: issuer.logoUrl,
    },
    credential: signedDocument?.data ?? {
      "@context": [...legacyCredential["@context"]] as [
        "https://www.w3.org/ns/credentials/v2",
        "https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json",
      ],
      id: legacyCredential.id,
      type: [...legacyCredential.type] as ["VerifiableCredential", "OpenBadgeCredential"],
      name: legacyCredential.name,
      issuer: {
        id: legacyCredential.issuer.id,
        type: [...legacyCredential.issuer.type] as ["Profile"],
        name: legacyCredential.issuer.name,
        image: { id: legacyCredential.issuer.image.id, type: legacyCredential.issuer.image.type },
      },
      validFrom: legacyCredential.validFrom,
      ...(legacyCredential.validUntil ? { validUntil: legacyCredential.validUntil } : {}),
      credentialSubject: {
        type: [...legacyCredential.credentialSubject.type] as ["AchievementSubject"],
        identifier: legacyCredential.credentialSubject.identifier.map((identifier) => ({
          ...identifier,
        })),
        achievement: {
          id: legacyCredential.credentialSubject.achievement.id,
          type: [...legacyCredential.credentialSubject.achievement.type] as ["Achievement"],
          name: legacyCredential.credentialSubject.achievement.name,
          description: legacyCredential.credentialSubject.achievement.description,
          criteria: {
            narrative: legacyCredential.credentialSubject.achievement.criteria.narrative,
          },
          image: {
            id: legacyCredential.credentialSubject.achievement.image.id,
            type: legacyCredential.credentialSubject.achievement.image.type,
          },
          ...(legacyCredential.credentialSubject.achievement.tag
            ? { tag: [...legacyCredential.credentialSubject.achievement.tag] }
            : {}),
          ...(legacyCredential.credentialSubject.achievement.alignment
            ? {
                alignment: legacyCredential.credentialSubject.achievement.alignment.map(
                  (alignment) => ({
                    type: [...alignment.type] as ["Alignment"],
                    targetName: alignment.targetName,
                    targetUrl: alignment.targetUrl,
                  }),
                ),
              }
            : {}),
        },
      },
    },
    supportContact: settings.supportContact,
    sharingEnabled: settings.sharingEnabled,
    ...(signedDocument?.data ? { signedCredentialJson: signedDocument.data } : {}),
    ...(signedDocument?.data
      ? { cryptographicVerification: await signedVerification(signedDocument.data, record, now) }
      : {
          isLegacy: true,
          cryptographicVerification: {
            outcome: "VERIFICATION_UNAVAILABLE",
            checkedAt: now.toISOString(),
          },
        }),
  });
}

export async function getPublicCredential(
  rawPublicId: string,
  now = new Date(),
): Promise<PublicCredential> {
  const publicId = PublicCredentialIdSchema.safeParse(rawPublicId);
  if (!publicId.success || !(now instanceof Date) || Number.isNaN(now.valueOf())) {
    throw new PublicCredentialNotFoundError();
  }

  const record = await prisma.badgeIssuance.findUnique({
    where: { publicId: publicId.data },
    select: publicCredentialSelect,
  });
  if (!record) throw new PublicCredentialNotFoundError();

  let settings: Awaited<ReturnType<typeof getPublicSystemSettings>>;
  try {
    settings = await getPublicSystemSettings();
  } catch {
    throw new PublicCredentialNotFoundError();
  }

  try {
    return await toPublicCredential(record, settings, now);
  } catch {
    console.error("Public credential snapshot validation failed", {
      event: "public_credential_snapshot_invalid",
      publicId: publicId.data,
    });
    throw new PublicCredentialNotFoundError();
  }
}
