import { gunzipSync } from "node:zlib";

import { z } from "zod";

import { SignedDocumentSchema } from "./proof";

export const VC_V2_CONTEXT_URL = "https://www.w3.org/ns/credentials/v2" as const;
export const OPEN_BADGES_CONTEXT_URL =
  "https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json" as const;
export const OPEN_BADGES_EXTENSIONS_CONTEXT_URL =
  "https://purl.imsglobal.org/spec/ob/v3p0/extensions.json" as const;
export const OPEN_BADGES_CREDENTIAL_SCHEMA_URL =
  "https://purl.imsglobal.org/spec/ob/v3p0/schema/json/ob_v3p0_achievementcredential_schema.json" as const;

export const MIN_BITSTRING_STATUS_LIST_BYTES = 16 * 1024;
export const MAX_BITSTRING_STATUS_LIST_BYTES = 128 * 1024;
export const MAX_ENCODED_STATUS_LIST_CHARACTERS = 180_000;

function hasUnambiguousCanonicalPath(pathname: string): boolean {
  if ((pathname !== "/" && pathname.includes("//")) || pathname.includes("\\")) {
    return false;
  }
  // Structural separators, dots, and encoded percent signs can acquire a
  // different path meaning after one or more decoding passes.
  if (/%(?:2f|5c|2e|25)/i.test(pathname)) {
    return false;
  }
  try {
    decodeURIComponent(pathname);
    return true;
  } catch {
    return false;
  }
}

function isCanonicalHttpsUrl(value: string, allowFragment = false): boolean {
  try {
    const url = new URL(value);
    const isLoopbackHttp =
      url.protocol === "http:" &&
      (url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]");
    return (
      (url.protocol === "https:" || isLoopbackHttp) &&
      url.username.length === 0 &&
      url.password.length === 0 &&
      url.search.length === 0 &&
      (allowFragment || url.hash.length === 0) &&
      hasUnambiguousCanonicalPath(url.pathname) &&
      url.toString() === value
    );
  } catch {
    return false;
  }
}

export const CanonicalResourceUrlSchema = z
  .string()
  .max(2048)
  .refine((value) => isCanonicalHttpsUrl(value), "Use a canonical HTTPS resource URL");

const CanonicalUrlWithFragmentSchema = z
  .string()
  .max(2048)
  .refine((value) => isCanonicalHttpsUrl(value, true), "Use a canonical HTTPS URL");

const UtcTimestampSchema = z.iso.datetime({ offset: false });
const IdentityObjectSchema = z
  .object({
    type: z.literal("IdentityObject"),
    identityHash: z.string().regex(/^sha256\$[a-f0-9]{64}$/),
    identityType: z.literal("emailAddress"),
    hashed: z.literal(true),
  })
  .strict();

const ImageSchema = z
  .object({
    id: CanonicalResourceUrlSchema,
    type: z.literal("Image"),
  })
  .strict();

const AlignmentSchema = z
  .object({
    type: z.tuple([z.literal("Alignment")]),
    targetName: z.string().trim().min(1),
    targetUrl: CanonicalResourceUrlSchema,
  })
  .strict();

const AchievementSchema = z
  .object({
    id: CanonicalResourceUrlSchema,
    type: z.tuple([z.literal("Achievement")]),
    name: z.string().trim().min(1),
    description: z.string().trim().min(1),
    criteria: z.object({ narrative: z.string().trim().min(1) }).strict(),
    image: ImageSchema,
    tag: z.array(z.string().trim().min(1)).min(1).optional(),
    alignment: z.array(AlignmentSchema).min(1).optional(),
  })
  .strict();

const IssuerSchema = z
  .object({
    id: CanonicalResourceUrlSchema,
    type: z.tuple([z.literal("Profile")]),
    name: z.string().trim().min(1),
    image: ImageSchema,
  })
  .strict();

export const BitstringStatusListEntrySchema = z
  .object({
    id: CanonicalUrlWithFragmentSchema,
    type: z.literal("BitstringStatusListEntry"),
    statusPurpose: z.literal("revocation"),
    statusListIndex: z.string().regex(/^(0|[1-9][0-9]*)$/),
    statusListCredential: CanonicalResourceUrlSchema,
  })
  .strict()
  .superRefine((entry, context) => {
    const index = Number(entry.statusListIndex);
    if (!Number.isSafeInteger(index)) {
      context.addIssue({
        code: "custom",
        path: ["statusListIndex"],
        message: "Status-list index must be a safe integer",
      });
    }
    if (entry.id !== `${entry.statusListCredential}#${entry.statusListIndex}`) {
      context.addIssue({
        code: "custom",
        path: ["id"],
        message: "Status entry ID must match the status-list credential and index",
      });
    }
  });

const CredentialSchemaReferenceSchema = z
  .object({
    id: z.literal(OPEN_BADGES_CREDENTIAL_SCHEMA_URL),
    type: z.literal("1EdTechJsonSchemaValidator2019"),
  })
  .strict();

const DataIntegrityProofSchema = SignedDocumentSchema.shape.proof
  .extend({
    verificationMethod: CanonicalResourceUrlSchema,
    created: UtcTimestampSchema.optional(),
  })
  .strict();

export function verificationMethodBelongsToController(
  verificationMethod: string,
  controller: string,
): boolean {
  try {
    if (!isCanonicalHttpsUrl(verificationMethod) || !isCanonicalHttpsUrl(controller)) {
      return false;
    }
    const verificationMethodUrl = new URL(verificationMethod);
    const controllerUrl = new URL(controller);
    if (verificationMethodUrl.origin !== controllerUrl.origin) {
      return false;
    }

    const controllerPath =
      controllerUrl.pathname === "/"
        ? ""
        : controllerUrl.pathname.endsWith("/")
          ? controllerUrl.pathname.slice(0, -1)
          : controllerUrl.pathname;
    const keyPrefix = `${controllerPath}/keys/`;
    if (!verificationMethodUrl.pathname.startsWith(keyPrefix)) {
      return false;
    }

    const keyIdentifier = verificationMethodUrl.pathname.slice(keyPrefix.length);
    return keyIdentifier.length > 0 && !keyIdentifier.includes("/");
  } catch {
    return false;
  }
}

const OpenBadgeCredentialFields = {
  "@context": z.tuple([
    z.literal(VC_V2_CONTEXT_URL),
    z.literal(OPEN_BADGES_CONTEXT_URL),
    z.literal(OPEN_BADGES_EXTENSIONS_CONTEXT_URL),
  ]),
  id: CanonicalResourceUrlSchema,
  type: z.tuple([z.literal("VerifiableCredential"), z.literal("OpenBadgeCredential")]),
  name: z.string().trim().min(1),
  issuer: IssuerSchema,
  validFrom: UtcTimestampSchema,
  validUntil: UtcTimestampSchema.optional(),
  credentialSubject: z
    .object({
      type: z.tuple([z.literal("AchievementSubject")]),
      identifier: z.array(IdentityObjectSchema).min(1),
      achievement: AchievementSchema,
    })
    .strict(),
  credentialStatus: BitstringStatusListEntrySchema,
  credentialSchema: z.tuple([CredentialSchemaReferenceSchema]),
};

function validateCredentialRelationships(
  credential: {
    issuer: { id: string };
    validFrom: string;
    validUntil?: string;
    proof?: { verificationMethod: string };
  },
  context: z.RefinementCtx,
) {
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
  if (
    credential.proof &&
    !verificationMethodBelongsToController(
      credential.proof.verificationMethod,
      credential.issuer.id,
    )
  ) {
    context.addIssue({
      code: "custom",
      path: ["proof", "verificationMethod"],
      message: "Proof verification method must be controlled by the credential issuer",
    });
  }
}

export const UnsignedOpenBadgeCredentialSchema = z
  .object(OpenBadgeCredentialFields)
  .strict()
  .superRefine(validateCredentialRelationships);

export const SignedOpenBadgeCredentialSchema = z
  .object({ ...OpenBadgeCredentialFields, proof: DataIntegrityProofSchema })
  .strict()
  .superRefine(validateCredentialRelationships);

const StatusListCredentialFields = {
  "@context": z.tuple([z.literal(VC_V2_CONTEXT_URL)]),
  id: CanonicalResourceUrlSchema,
  type: z.tuple([z.literal("VerifiableCredential"), z.literal("BitstringStatusListCredential")]),
  issuer: CanonicalResourceUrlSchema,
  validFrom: UtcTimestampSchema,
  credentialSubject: z
    .object({
      id: CanonicalUrlWithFragmentSchema,
      type: z.literal("BitstringStatusList"),
      statusPurpose: z.literal("revocation"),
      encodedList: z.string().superRefine((value, context) => {
        try {
          decodeStatusListBytes(value, MIN_BITSTRING_STATUS_LIST_BYTES);
        } catch (error) {
          context.addIssue({
            code: "custom",
            message: error instanceof Error ? error.message : "Encoded status list is invalid",
          });
        }
      }),
    })
    .strict(),
};

function validateStatusListRelationships(
  credential: {
    id: string;
    issuer: string;
    credentialSubject: { id: string };
    proof?: { verificationMethod: string };
  },
  context: z.RefinementCtx,
) {
  if (credential.credentialSubject.id !== `${credential.id}#list`) {
    context.addIssue({
      code: "custom",
      path: ["credentialSubject", "id"],
      message: "Status-list subject ID must match the credential ID",
    });
  }
  if (
    credential.proof &&
    !verificationMethodBelongsToController(credential.proof.verificationMethod, credential.issuer)
  ) {
    context.addIssue({
      code: "custom",
      path: ["proof", "verificationMethod"],
      message: "Proof verification method must be controlled by the status-list issuer",
    });
  }
}

export const UnsignedStatusListCredentialSchema = z
  .object(StatusListCredentialFields)
  .strict()
  .superRefine(validateStatusListRelationships);

export const SignedStatusListCredentialSchema = z
  .object({ ...StatusListCredentialFields, proof: DataIntegrityProofSchema })
  .strict()
  .superRefine(validateStatusListRelationships);

export function decodeStatusListBytes(encodedList: string, minimumBytes = 1): Buffer {
  if (encodedList.length > MAX_ENCODED_STATUS_LIST_CHARACTERS) {
    throw new Error("Encoded status list is too large");
  }
  if (!/^u[A-Za-z0-9_-]+$/.test(encodedList)) {
    throw new Error("Encoded status list must be multibase base64url without padding");
  }

  try {
    const payload = encodedList.slice(1);
    const compressed = Buffer.from(payload, "base64url");
    if (compressed.toString("base64url") !== payload) {
      throw new Error("Non-canonical base64url encoding");
    }
    const bytes = gunzipSync(compressed, {
      maxOutputLength: MAX_BITSTRING_STATUS_LIST_BYTES,
    });
    if (bytes.length < minimumBytes) {
      throw new Error("Expanded status list is below the required capacity");
    }
    return bytes;
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "Expanded status list is below the required capacity"
    ) {
      throw error;
    }
    throw new Error("Encoded status list is invalid");
  }
}

export type BitstringStatusListEntry = z.output<typeof BitstringStatusListEntrySchema>;
export type UnsignedOpenBadgeCredential = z.output<typeof UnsignedOpenBadgeCredentialSchema>;
export type SignedOpenBadgeCredential = z.output<typeof SignedOpenBadgeCredentialSchema>;
export type UnsignedStatusListCredential = z.output<typeof UnsignedStatusListCredentialSchema>;
export type SignedStatusListCredential = z.output<typeof SignedStatusListCredentialSchema>;
