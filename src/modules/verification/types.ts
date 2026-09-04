import "server-only";

import { z } from "zod";

import { getServerEnv } from "@/config/env";
import {
  OpenBadgeCredentialSnapshotSchema,
  SafeHttpUrlSchema,
} from "@/modules/issuance/services/snapshot-schemas";
import { SignedOpenBadgeCredentialSchema } from "@/modules/open-badges/credential-schema";

export const PublicCredentialIdSchema = z.string().regex(/^[A-Za-z0-9_-]{32}$/);
export const PublicCredentialStatusSchema = z.enum(["ACTIVE", "REVOKED", "EXPIRED"]);
export const PublicCredentialLifecycleExtension = "https://hau.edu.ph/ns/credential-lifecycle";

const publicImageSchema = z.object({ id: SafeHttpUrlSchema, type: z.literal("Image") }).strict();
const publicAlignmentSchema = z
  .object({
    type: z.tuple([z.literal("Alignment")]),
    targetName: z.string(),
    targetUrl: SafeHttpUrlSchema,
  })
  .strict();

const publicAchievementSchema = z
  .object({
    id: SafeHttpUrlSchema,
    type: z.tuple([z.literal("Achievement")]),
    name: z.string(),
    description: z.string(),
    criteria: z.object({ narrative: z.string() }).strict(),
    image: publicImageSchema,
    skills: z.array(z.string()),
    tag: z.array(z.string()).optional(),
    alignment: z.array(publicAlignmentSchema).optional(),
    class: z
      .object({
        courseCode: z.string(),
        title: z.string(),
        section: z.string(),
        term: z.string(),
        academicYear: z.string(),
      })
      .strict(),
  })
  .strict();

const publicIssuerSchema = z
  .object({
    name: z.string(),
    url: SafeHttpUrlSchema,
    logoUrl: SafeHttpUrlSchema,
  })
  .strict();

export const PublicCredentialSchema = z
  .object({
    publicId: PublicCredentialIdSchema,
    status: PublicCredentialStatusSchema,
    issuedAt: z.iso.datetime(),
    expiresAt: z.iso.datetime().nullable(),
    revokedAt: z.iso.datetime().nullable(),
    revocationReason: z.string().trim().min(1).max(1000).nullable(),
    recipientDisplayName: z.string().trim().min(1).max(191),
    achievement: publicAchievementSchema,
    issuer: publicIssuerSchema,
    credential: z.union([OpenBadgeCredentialSnapshotSchema, SignedOpenBadgeCredentialSchema]),
    signedCredentialJson: SignedOpenBadgeCredentialSchema.optional(),
    cryptographicVerification: z
      .object({
        outcome: z.enum([
          "VERIFIED",
          "REVOKED",
          "EXPIRED",
          "INVALID_PROOF",
          "VERIFICATION_UNAVAILABLE",
        ]),
        keyId: z.string().url().optional(),
        checkedAt: z.iso.datetime(),
      })
      .strict()
      .optional(),
    isLegacy: z.boolean().optional(),
    supportContact: z.string().trim().max(2048).nullable(),
    sharingEnabled: z.boolean(),
  })
  .strict()
  .superRefine((value, context) => {
    try {
      const identifier = new URL(value.credential.id);
      const expected = new URL(`/credentials/${value.publicId}`, getServerEnv().APP_URL);
      if (identifier.href !== expected.href) {
        context.addIssue({
          code: "custom",
          path: ["credential", "id"],
          message: "Credential identifier must be the canonical public URL",
        });
      }
    } catch {
      context.addIssue({
        code: "custom",
        path: ["credential", "id"],
        message: "Credential identifier must be the canonical public URL",
      });
    }
  });

export const PublicCredentialLifecycleSchema = z
  .object({
    status: PublicCredentialStatusSchema,
    expiresAt: z.iso.datetime().optional(),
    revokedAt: z.iso.datetime().optional(),
    revocationReason: z.string().trim().min(1).max(1000).optional(),
    unsigned: z.literal(true),
    certified: z.literal(false),
  })
  .strict();

export const PublicOpenBadgeCredentialSchema = OpenBadgeCredentialSnapshotSchema.extend({
  [PublicCredentialLifecycleExtension]: PublicCredentialLifecycleSchema,
}).strict();

export type PublicCredentialStatus = z.output<typeof PublicCredentialStatusSchema>;
export type PublicCredential = z.output<typeof PublicCredentialSchema>;
export type PublicOpenBadgeCredential = z.output<typeof PublicOpenBadgeCredentialSchema>;
