import { z } from "zod";

export function isSafeHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      url.username.length === 0 &&
      url.password.length === 0
    );
  } catch {
    return false;
  }
}

export const SafeHttpUrlSchema = z.string().url().refine(isSafeHttpUrl, "Use an HTTP or HTTPS URL");

export const RecipientSnapshotSchema = z
  .object({
    studentId: z.string(),
    studentNumber: z.string(),
    displayName: z.string(),
    firstName: z.string(),
    lastName: z.string(),
    email: z.email(),
  })
  .strict();

export const AchievementAlignmentSnapshotSchema = z
  .object({
    type: z.tuple([z.literal("Alignment")]),
    targetName: z.string(),
    targetUrl: SafeHttpUrlSchema,
  })
  .strict();

export const AchievementSnapshotSchema = z
  .object({
    badgeTemplateId: z.string(),
    id: SafeHttpUrlSchema,
    type: z.tuple([z.literal("Achievement")]),
    name: z.string(),
    description: z.string(),
    criteria: z.object({ narrative: z.string() }).strict(),
    imagePath: z.string(),
    image: z.object({ id: SafeHttpUrlSchema, type: z.literal("Image") }).strict(),
    skills: z.array(z.string()),
    tag: z.array(z.string()).optional(),
    alignment: z.array(AchievementAlignmentSnapshotSchema).optional(),
    templateUpdatedAt: z.iso.datetime(),
    class: z
      .object({
        id: z.string(),
        courseCode: z.string(),
        title: z.string(),
        section: z.string(),
        term: z.string(),
        academicYear: z.string(),
      })
      .strict(),
    expiresAfterDays: z.number().int().positive().nullable(),
  })
  .strict();

export const IssuerSnapshotSchema = z
  .object({
    name: z.string(),
    url: SafeHttpUrlSchema,
    logoUrl: SafeHttpUrlSchema,
    issuerUserId: z.string(),
    issuerUserName: z.string(),
  })
  .strict();

export const OpenBadgeCredentialSnapshotSchema = z
  .object({
    "@context": z.tuple([
      z.literal("https://www.w3.org/ns/credentials/v2"),
      z.literal("https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json"),
    ]),
    id: SafeHttpUrlSchema,
    type: z.tuple([z.literal("VerifiableCredential"), z.literal("OpenBadgeCredential")]),
    name: z.string(),
    issuer: z
      .object({
        id: SafeHttpUrlSchema,
        type: z.tuple([z.literal("Profile")]),
        name: z.string(),
        image: z.object({ id: SafeHttpUrlSchema, type: z.literal("Image") }).strict(),
      })
      .strict(),
    validFrom: z.iso.datetime(),
    validUntil: z.iso.datetime().optional(),
    credentialSubject: z
      .object({
        type: z.tuple([z.literal("AchievementSubject")]),
        identifier: z.array(
          z
            .object({
              type: z.literal("IdentityObject"),
              identityHash: z.string().regex(/^[a-f0-9]{64}$/),
              identityType: z.literal("email"),
              hashed: z.literal(true),
            })
            .strict(),
        ),
        achievement: z
          .object({
            id: SafeHttpUrlSchema,
            type: z.tuple([z.literal("Achievement")]),
            name: z.string(),
            description: z.string(),
            criteria: z.object({ narrative: z.string() }).strict(),
            image: z.object({ id: SafeHttpUrlSchema, type: z.literal("Image") }).strict(),
            tag: z.array(z.string()).optional(),
            alignment: z.array(AchievementAlignmentSnapshotSchema).optional(),
          })
          .strict(),
      })
      .strict(),
  })
  .strict();

export const SignedCredentialBuildSnapshotSchema = OpenBadgeCredentialSnapshotSchema.superRefine(
  (credential, context) => {
    if (
      credential.validUntil !== undefined &&
      Date.parse(credential.validUntil) <= Date.parse(credential.validFrom)
    ) {
      context.addIssue({
        code: "custom",
        path: ["validUntil"],
        message: "validUntil must be later than validFrom",
      });
    }
  },
);
