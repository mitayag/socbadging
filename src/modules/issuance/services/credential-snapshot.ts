import "server-only";
import { createHash, randomBytes } from "node:crypto";

import { getServerEnv } from "@/config/env";
import { isSafeRootRelativePath } from "@/modules/settings/types";
import type {
  AchievementAlignmentSnapshot,
  AchievementSnapshot,
  IssuerSnapshot,
  OpenBadgeCredentialSnapshot,
  RecipientSnapshot,
} from "@/modules/issuance/types";

type AchievementInput = {
  badgeTemplateId: string;
  name: string;
  description: string;
  criteria: string;
  imagePath: string;
  skills: string[];
  alignment?: Array<{
    targetName: string;
    targetUrl: string;
  }>;
  templateUpdatedAt: Date | string;
  class: AchievementSnapshot["class"];
  expiresAfterDays: number | null;
};

export type CredentialSnapshotInput = {
  publicId: string;
  issuedAt: Date;
  expiresAt: Date | null;
  recipient: RecipientSnapshot;
  achievement: AchievementInput;
  issuer: Pick<IssuerSnapshot, "issuerUserId" | "issuerUserName">;
  issuerPresentation?: {
    issuerName: string;
    issuerUrl: string;
    issuerLogoPath: string;
  };
};

export type CredentialSnapshots = {
  recipient: RecipientSnapshot;
  achievement: AchievementSnapshot;
  issuer: IssuerSnapshot;
  credential: OpenBadgeCredentialSnapshot;
};

const credentialContext: OpenBadgeCredentialSnapshot["@context"] = [
  "https://www.w3.org/ns/credentials/v2",
  "https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json",
];

const credentialType: OpenBadgeCredentialSnapshot["type"] = [
  "VerifiableCredential",
  "OpenBadgeCredential",
];

export function generatePublicId(): string {
  return randomBytes(24).toString("base64url");
}

export function hashRecipientEmail(email: string): string {
  return createHash("sha256").update(email.trim().toLowerCase()).digest("hex");
}

export function calculateExpiresAt(issuedAt: Date, expiresAfterDays: number | null): Date | null {
  if (expiresAfterDays === null) return null;
  return new Date(issuedAt.getTime() + expiresAfterDays * 24 * 60 * 60 * 1000);
}

function canonicalApplicationUrl(appUrl: string): string {
  return appUrl.replace(/\/+$/, "");
}

function resolveApplicationUrl(appUrl: string, path: string): string {
  return new URL(path, `${canonicalApplicationUrl(appUrl)}/`).toString();
}

function resolveBadgeMediaUrl(appUrl: string, imagePath: string): string {
  const segments = imagePath.split("/");
  const isSafeMediaPath =
    segments[0] === "badges" &&
    segments.length > 1 &&
    segments.every(
      (segment) =>
        segment.length > 0 &&
        segment !== "." &&
        segment !== ".." &&
        !/[%\\?#\u0000-\u001F\u007F]/.test(segment),
    );

  if (!isSafeMediaPath)
    throw new Error("Badge media path must remain under the stable media route");

  return resolveApplicationUrl(
    appUrl,
    `/api/media/${segments.map((segment) => encodeURIComponent(segment)).join("/")}`,
  );
}

function toAlignmentSnapshots(
  alignment: AchievementInput["alignment"],
): AchievementAlignmentSnapshot[] | undefined {
  if (!alignment?.length) return undefined;
  return alignment.map((item) => ({
    type: ["Alignment"],
    targetName: item.targetName,
    targetUrl: item.targetUrl,
  }));
}

export function buildCredentialSnapshots(input: CredentialSnapshotInput): CredentialSnapshots {
  const env = getServerEnv();
  const appUrl = canonicalApplicationUrl(env.APP_URL);
  const issuerPresentation = input.issuerPresentation ?? {
    issuerName: env.ISSUER_NAME,
    issuerUrl: env.ISSUER_URL,
    issuerLogoPath: env.ISSUER_LOGO_PATH,
  };
  if (!isSafeRootRelativePath(issuerPresentation.issuerLogoPath)) {
    throw new Error("Issuer logo path must be a safe root-relative path");
  }
  const alignment = toAlignmentSnapshots(input.achievement.alignment);
  const skills = [...input.achievement.skills];
  const achievement: AchievementSnapshot = {
    badgeTemplateId: input.achievement.badgeTemplateId,
    id: resolveApplicationUrl(appUrl, `/achievements/${input.achievement.badgeTemplateId}`),
    type: ["Achievement"],
    name: input.achievement.name,
    description: input.achievement.description,
    criteria: { narrative: input.achievement.criteria },
    imagePath: input.achievement.imagePath,
    image: {
      id: resolveBadgeMediaUrl(appUrl, input.achievement.imagePath),
      type: "Image",
    },
    skills,
    ...(skills.length ? { tag: [...skills] } : {}),
    ...(alignment ? { alignment } : {}),
    templateUpdatedAt:
      input.achievement.templateUpdatedAt instanceof Date
        ? input.achievement.templateUpdatedAt.toISOString()
        : input.achievement.templateUpdatedAt,
    class: { ...input.achievement.class },
    expiresAfterDays: input.achievement.expiresAfterDays,
  };
  const issuer: IssuerSnapshot = {
    name: issuerPresentation.issuerName,
    url: issuerPresentation.issuerUrl,
    logoUrl: resolveApplicationUrl(appUrl, issuerPresentation.issuerLogoPath),
    issuerUserId: input.issuer.issuerUserId,
    issuerUserName: input.issuer.issuerUserName,
  };
  const credential: OpenBadgeCredentialSnapshot = {
    "@context": [...credentialContext],
    id: resolveApplicationUrl(appUrl, `/credentials/${input.publicId}`),
    type: [...credentialType],
    name: achievement.name,
    issuer: {
      id: issuer.url,
      type: ["Profile"],
      name: issuer.name,
      image: { id: issuer.logoUrl, type: "Image" },
    },
    validFrom: input.issuedAt.toISOString(),
    ...(input.expiresAt ? { validUntil: input.expiresAt.toISOString() } : {}),
    credentialSubject: {
      type: ["AchievementSubject"],
      identifier: [
        {
          type: "IdentityObject",
          identityHash: hashRecipientEmail(input.recipient.email),
          identityType: "email",
          hashed: true,
        },
      ],
      achievement: {
        id: achievement.id,
        type: ["Achievement"],
        name: achievement.name,
        description: achievement.description,
        criteria: { ...achievement.criteria },
        image: { ...achievement.image },
        ...(achievement.tag ? { tag: [...achievement.tag] } : {}),
        ...(achievement.alignment
          ? { alignment: achievement.alignment.map((item) => ({ ...item, type: ["Alignment"] })) }
          : {}),
      },
    },
  };

  return {
    recipient: { ...input.recipient },
    achievement,
    issuer,
    credential,
  };
}
