import { createRequire } from "node:module";

import { DataIntegrityProof } from "@digitalbazaar/data-integrity";
import * as Ed25519Multikey from "@digitalbazaar/ed25519-multikey";
import { cryptosuite } from "@digitalbazaar/eddsa-rdfc-2022-cryptosuite";
import { z } from "zod";

import { loadAllowlistedDocument } from "./document-loader";

const ReviewedContextUrlSchema = z.enum([
  "https://www.w3.org/ns/credentials/v2",
  "https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json",
  "https://purl.imsglobal.org/spec/ob/v3p0/extensions.json",
  "https://w3id.org/security/data-integrity/v2",
  "https://w3id.org/security/multikey/v1",
  "https://www.w3.org/ns/credentials/status/v1",
]);

const JsonLdContextSchema = z.union([
  ReviewedContextUrlSchema,
  z.array(ReviewedContextUrlSchema).min(1),
]);

const CredentialTypeSchema = z.union([z.string().min(1), z.array(z.string().min(1)).min(1)]);

const EddsaRdfc2022ProofSchema = z
  .object({
    type: z.literal("DataIntegrityProof"),
    cryptosuite: z.literal("eddsa-rdfc-2022"),
    proofPurpose: z.literal("assertionMethod"),
    verificationMethod: z.string().url(),
    proofValue: z.string().regex(/^z[1-9A-HJ-NP-Za-km-z]+$/),
  })
  .passthrough();

const CredentialDocumentSchema = z
  .object({
    "@context": JsonLdContextSchema,
    id: z.string().min(1),
    type: CredentialTypeSchema,
    issuer: z.union([z.string().min(1), z.object({ id: z.string().min(1) }).passthrough()]),
    credentialSubject: z.object({}).passthrough(),
    validFrom: z.string().min(1).optional(),
  })
  .passthrough();

export const UnsignedDocumentSchema = CredentialDocumentSchema.extend({
  proof: z.undefined().optional(),
});

export const SignedDocumentSchema = CredentialDocumentSchema.extend({
  proof: EddsaRdfc2022ProofSchema,
});

export const SignRequestSchema = z
  .object({
    operation: z.literal("credential.sign"),
    document: UnsignedDocumentSchema,
  })
  .strict();

export const SignResponseSchema = z
  .object({
    document: SignedDocumentSchema,
    keyId: z.string().min(1),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.document.proof.verificationMethod !== value.keyId) {
      context.addIssue({
        code: "custom",
        path: ["document", "proof", "verificationMethod"],
        message: "Proof verification method must match the response key ID",
      });
    }
  });

export const VerifyRequestSchema = z
  .object({
    operation: z.literal("credential.verify"),
    document: SignedDocumentSchema,
  })
  .strict();

export type VerificationOutcome = "VERIFIED" | "INVALID_PROOF" | "VERIFICATION_UNAVAILABLE";

export const VerifyResponseSchema = z
  .object({
    outcome: z.enum(["VERIFIED", "INVALID_PROOF", "VERIFICATION_UNAVAILABLE"]),
    keyId: z.string().min(1).optional(),
  })
  .strict();

export type SignedOpenBadgeCredential = z.output<typeof SignedDocumentSchema>;
export type UnsignedOpenBadgeCredential = z.output<typeof UnsignedDocumentSchema>;
export type VerifyResponse = z.output<typeof VerifyResponseSchema>;

export type PublicVerificationMethod = {
  id: string;
  controller: string;
  publicKeyMultibase: string;
};

export class PublicProofVerificationUnavailableError extends Error {
  constructor() {
    super("Public proof verification is unavailable");
    this.name = "PublicProofVerificationUnavailableError";
  }
}

const officialVectorVerificationMethod =
  "https://example.edu/issuers/565049#z6MkjZRZv3aez3r18pB1RBFJR1kwUVJ5jHt92JmQwXbd5hwi";
const officialVectorController = "https://example.edu/issuers/565049";

const officialVectorPublicKey = {
  "@context": "https://w3id.org/security/multikey/v1",
  id: officialVectorVerificationMethod,
  type: "Multikey",
  controller: officialVectorController,
  publicKeyMultibase: "z6MkjZRZv3aez3r18pB1RBFJR1kwUVJ5jHt92JmQwXbd5hwi",
};

const officialVectorControllerDocument = {
  "@context": "https://www.w3.org/ns/did/v1",
  id: officialVectorController,
  assertionMethod: [officialVectorVerificationMethod],
};

type JsonLdSignaturesPackage = {
  verify: (
    document: object,
    options: {
      suite: object;
      purpose: object;
      documentLoader: (url: string) => Promise<{ documentUrl: string; document: unknown }>;
    },
  ) => Promise<{ verified: boolean }>;
  purposes: {
    AssertionProofPurpose: new (options?: { controller?: object }) => object;
  };
};

const require = createRequire(import.meta.url);
const jsonldSignatures = require("jsonld-signatures") as JsonLdSignaturesPackage;

function issuerId(document: z.output<typeof SignedDocumentSchema>): string | null {
  return typeof document.issuer === "string" ? document.issuer : document.issuer.id;
}

export async function verifyEddsaRdfc2022Proof(
  document: unknown,
  verificationMethod: PublicVerificationMethod,
): Promise<boolean> {
  const parsed = SignedDocumentSchema.safeParse(document);
  if (
    !parsed.success ||
    parsed.data.proof.verificationMethod !== verificationMethod.id ||
    issuerId(parsed.data) !== verificationMethod.controller
  ) {
    return false;
  }

  try {
    const key = await Ed25519Multikey.from({
      "@context": "https://w3id.org/security/multikey/v1",
      id: verificationMethod.id,
      type: "Multikey",
      publicKeyMultibase: verificationMethod.publicKeyMultibase,
    });
    const exported = await key.export({ publicKey: true });
    if (exported.publicKeyMultibase !== verificationMethod.publicKeyMultibase) return false;
  } catch {
    return false;
  }

  try {
    const suite = new DataIntegrityProof({ cryptosuite });
    const purpose = new jsonldSignatures.purposes.AssertionProofPurpose({
      controller: {
        id: verificationMethod.controller,
        assertionMethod: [verificationMethod.id],
      },
    });
    const publicKey = {
      "@context": "https://w3id.org/security/multikey/v1",
      id: verificationMethod.id,
      type: "Multikey",
      controller: verificationMethod.controller,
      publicKeyMultibase: verificationMethod.publicKeyMultibase,
    };
    const documentLoader = async (url: string) => {
      if (url === verificationMethod.id) return { documentUrl: url, document: publicKey };
      if (url === verificationMethod.controller) {
        return {
          documentUrl: url,
          document: { id: verificationMethod.controller, assertionMethod: [verificationMethod.id] },
        };
      }
      return loadAllowlistedDocument(url);
    };
    const result = await jsonldSignatures.verify(parsed.data, { suite, purpose, documentLoader });
    return result.verified;
  } catch {
    throw new PublicProofVerificationUnavailableError();
  }
}

export async function verifyOfficialEddsaRdfc2022ProofVector(document: unknown): Promise<boolean> {
  const parsedDocument = SignedDocumentSchema.safeParse(document);
  if (!parsedDocument.success) {
    return false;
  }

  const parsedProof = EddsaRdfc2022ProofSchema.safeParse(parsedDocument.data.proof);
  if (!parsedProof.success) return false;

  if (parsedProof.data.verificationMethod !== officialVectorVerificationMethod) {
    return false;
  }

  const suite = new DataIntegrityProof({ cryptosuite });
  const purpose = new jsonldSignatures.purposes.AssertionProofPurpose({
    controller: officialVectorControllerDocument,
  });
  const documentLoader = async (url: string) => {
    if (url === officialVectorVerificationMethod) {
      return { documentUrl: url, document: officialVectorPublicKey };
    }

    return loadAllowlistedDocument(url);
  };

  const result = await jsonldSignatures.verify(parsedDocument.data, {
    suite,
    purpose,
    documentLoader,
  });

  return result.verified;
}
