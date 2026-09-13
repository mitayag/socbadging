import { constants as fsConstants } from "node:fs";
import { open } from "node:fs/promises";
import { createRequire } from "node:module";

import { DataIntegrityProof } from "@digitalbazaar/data-integrity";
import * as Ed25519Multikey from "@digitalbazaar/ed25519-multikey";
import { cryptosuite } from "@digitalbazaar/eddsa-rdfc-2022-cryptosuite";
import { z } from "zod";

import { loadAllowlistedDocument } from "@/modules/open-badges/document-loader";
import {
  SignedDocumentSchema,
  SignResponseSchema,
  UnsignedDocumentSchema,
  VerifyResponseSchema,
  type SignedOpenBadgeCredential,
  type UnsignedOpenBadgeCredential,
  type VerifyResponse,
} from "@/modules/open-badges/proof";
import { writeStructuredLog } from "@/platform/logging/structured-log";

const CRYPTOSUITE = "eddsa-rdfc-2022" as const;
const MULTIKEY_CONTEXT = "https://w3id.org/security/multikey/v1";
const PRIVATE_KEY_FILE_MAX_BYTES = 16 * 1024;
const KEY_CHALLENGE = new TextEncoder().encode("hau-soc-signer-key-consistency-v1");

const PrivateKeyFileSchema = z
  .object({ privateKeyMultibase: z.string().trim().min(1).max(16_384) })
  .strict();

const RuntimeConfigSchema = z
  .object({
    privateKeyPath: z.string().min(1),
    keyId: z.url(),
    publicKeyMultibase: z.string().trim().min(1).max(16_384),
    fingerprint: z.string().trim().min(1).max(255),
  })
  .strict();

type JsonLdSignaturesPackage = {
  sign: (
    document: object,
    options: {
      suite: object;
      purpose: object;
      documentLoader: DocumentLoader;
    },
  ) => Promise<unknown>;
  verify: (
    document: object,
    options: {
      suite: object;
      purpose: object;
      documentLoader: DocumentLoader;
    },
  ) => Promise<{ verified: boolean }>;
  purposes: {
    AssertionProofPurpose: new (options?: { controller?: object }) => object;
  };
};

type DocumentLoader = (url: string) => Promise<{ documentUrl: string; document: unknown }>;
type SafeLogWriter = (event: string, fields?: Readonly<Record<string, unknown>>) => void;
type BoundedReadableFile = {
  read(
    buffer: Buffer,
    offset: number,
    length: number,
    position: number,
  ): Promise<{ bytesRead: number }>;
};
const CORRELATION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type SignerRuntimeConfig = z.input<typeof RuntimeConfigSchema>;
export type SignerHealth = {
  status: "ready" | "unready";
  keyId: string;
  cryptosuite: typeof CRYPTOSUITE;
};

export type SignerRuntime = {
  getHealth(): SignerHealth;
  sign(document: unknown, correlationId: string): Promise<SignedOpenBadgeCredential>;
  verify(document: unknown, correlationId: string): Promise<VerifyResponse>;
};

export type SignerRuntimeErrorCode = "INVALID_DOCUMENT" | "SIGNER_UNAVAILABLE";

export class SignerRuntimeError extends Error {
  constructor(public readonly code: SignerRuntimeErrorCode) {
    super(code === "INVALID_DOCUMENT" ? "Credential document is invalid" : "Signer is unavailable");
    this.name = "SignerRuntimeError";
  }
}

const require = createRequire(import.meta.url);
const jsonldSignatures = require("jsonld-signatures") as JsonLdSignaturesPackage;

export async function readBoundedOpenFile(
  file: BoundedReadableFile,
  maximumBytes: number,
): Promise<Buffer> {
  const buffer = Buffer.alloc(maximumBytes + 1);
  let total = 0;
  while (total < buffer.length) {
    const length = buffer.length - total;
    const { bytesRead } = await file.read(buffer, total, length, total);
    if (bytesRead === 0) break;
    if (!Number.isInteger(bytesRead) || bytesRead < 0 || bytesRead > length) {
      throw new Error("Private key file read failed");
    }
    total += bytesRead;
  }
  if (total > maximumBytes) throw new Error("Private key file is too large");
  return buffer.subarray(0, total);
}

async function readPrivateKeyFile(path: string): Promise<string> {
  const file = await open(path, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
  try {
    const status = await file.stat();
    if (
      !status.isFile() ||
      (status.mode & 0o077) !== 0 ||
      status.size > PRIVATE_KEY_FILE_MAX_BYTES
    ) {
      throw new Error("Private key file is unsafe");
    }
    const contents = await readBoundedOpenFile(file, PRIVATE_KEY_FILE_MAX_BYTES);
    const parsed = PrivateKeyFileSchema.parse(JSON.parse(contents.toString("utf8")));
    return parsed.privateKeyMultibase;
  } finally {
    await file.close();
  }
}

function issuerId(document: SignedOpenBadgeCredential | UnsignedOpenBadgeCredential): string {
  return typeof document.issuer === "string" ? document.issuer : document.issuer.id;
}

function createDocumentLoader(options: {
  keyId: string;
  publicKeyMultibase: string;
  controller: string;
}): DocumentLoader {
  const verificationMethod = {
    "@context": MULTIKEY_CONTEXT,
    id: options.keyId,
    type: "Multikey",
    controller: options.controller,
    publicKeyMultibase: options.publicKeyMultibase,
  };
  const controllerDocument = {
    id: options.controller,
    assertionMethod: [verificationMethod],
  };

  return async (url) => {
    if (url === options.keyId) return { documentUrl: url, document: verificationMethod };
    if (url === options.controller) return { documentUrl: url, document: controllerDocument };
    return loadAllowlistedDocument(url);
  };
}

function createUnreadyRuntime(keyId: string): SignerRuntime {
  const unavailable = async (): Promise<never> => {
    throw new SignerRuntimeError("SIGNER_UNAVAILABLE");
  };
  return {
    getHealth: () => ({ status: "unready", keyId, cryptosuite: CRYPTOSUITE }),
    sign: unavailable,
    verify: unavailable,
  };
}

export async function createSignerRuntime(
  rawConfig: SignerRuntimeConfig,
  log: SafeLogWriter = writeStructuredLog,
): Promise<SignerRuntime> {
  let config: z.output<typeof RuntimeConfigSchema>;
  try {
    config = RuntimeConfigSchema.parse(rawConfig);
  } catch {
    return createUnreadyRuntime(String(rawConfig.keyId ?? "unconfigured"));
  }

  try {
    if (config.fingerprint !== config.publicKeyMultibase) {
      throw new Error("Public metadata does not match");
    }
    const privateKeyMultibase = await readPrivateKeyFile(config.privateKeyPath);
    const keyPair = await Ed25519Multikey.from({
      "@context": MULTIKEY_CONTEXT,
      id: config.keyId,
      type: "Multikey",
      publicKeyMultibase: config.publicKeyMultibase,
      secretKeyMultibase: privateKeyMultibase,
    });
    const exported = await keyPair.export({
      publicKey: true,
      secretKey: true,
      canonicalize: true,
    });
    if (
      exported.publicKeyMultibase !== config.publicKeyMultibase ||
      exported.secretKeyMultibase !== privateKeyMultibase
    ) {
      throw new Error("Key material is not canonical");
    }
    const signature = await keyPair.signer().sign({ data: KEY_CHALLENGE });
    if (!(await keyPair.verifier().verify({ data: KEY_CHALLENGE, signature }))) {
      throw new Error("Private and public keys do not match");
    }

    log("signer.runtime.ready", { keyId: config.keyId, cryptosuite: CRYPTOSUITE });

    const runLogged = async <T>(
      operation: "credential.sign" | "credential.verify",
      correlationId: string,
      callback: () => Promise<T>,
    ): Promise<T> => {
      const startedAt = performance.now();
      let outcome = "FAILED";
      try {
        const result = await callback();
        outcome = "SUCCEEDED";
        return result;
      } finally {
        log("signer.operation", {
          correlationId: CORRELATION_ID.test(correlationId)
            ? correlationId
            : "invalid-correlation-id",
          keyId: config.keyId,
          operation,
          outcome,
          durationMs: Math.round(performance.now() - startedAt),
        });
      }
    };

    return {
      getHealth: () => ({ status: "ready", keyId: config.keyId, cryptosuite: CRYPTOSUITE }),
      sign: async (document, correlationId) =>
        runLogged("credential.sign", correlationId, async () => {
          const parsed = UnsignedDocumentSchema.safeParse(document);
          if (!parsed.success) throw new SignerRuntimeError("INVALID_DOCUMENT");
          const controller = issuerId(parsed.data);
          try {
            new URL(controller);
          } catch {
            throw new SignerRuntimeError("INVALID_DOCUMENT");
          }
          try {
            const suite = new DataIntegrityProof({ cryptosuite, signer: keyPair.signer() });
            const signed = await jsonldSignatures.sign(structuredClone(parsed.data), {
              suite,
              purpose: new jsonldSignatures.purposes.AssertionProofPurpose(),
              documentLoader: createDocumentLoader({
                keyId: config.keyId,
                publicKeyMultibase: config.publicKeyMultibase,
                controller,
              }),
            });
            return SignResponseSchema.parse({ document: signed, keyId: config.keyId }).document;
          } catch {
            throw new SignerRuntimeError("INVALID_DOCUMENT");
          }
        }),
      verify: async (document, correlationId) =>
        runLogged("credential.verify", correlationId, async () => {
          const parsed = SignedDocumentSchema.safeParse(document);
          if (!parsed.success) throw new SignerRuntimeError("INVALID_DOCUMENT");
          const controller = issuerId(parsed.data);
          try {
            new URL(controller);
          } catch {
            throw new SignerRuntimeError("INVALID_DOCUMENT");
          }
          try {
            const suite = new DataIntegrityProof({ cryptosuite });
            const result = await jsonldSignatures.verify(parsed.data, {
              suite,
              purpose: new jsonldSignatures.purposes.AssertionProofPurpose({
                controller: {
                  id: controller,
                  assertionMethod: [config.keyId],
                },
              }),
              documentLoader: createDocumentLoader({
                keyId: config.keyId,
                publicKeyMultibase: config.publicKeyMultibase,
                controller,
              }),
            });
            return VerifyResponseSchema.parse({
              outcome: result.verified ? "VERIFIED" : "INVALID_PROOF",
              keyId: config.keyId,
            });
          } catch {
            return VerifyResponseSchema.parse({
              outcome: "VERIFICATION_UNAVAILABLE",
              keyId: config.keyId,
            });
          }
        }),
    };
  } catch {
    log("signer.runtime.unready", { keyId: config.keyId, cryptosuite: CRYPTOSUITE });
    return createUnreadyRuntime(config.keyId);
  }
}
