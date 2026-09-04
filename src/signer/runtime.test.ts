// @vitest-environment node

import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import * as base58btc from "base58-universal";
import * as Ed25519Multikey from "@digitalbazaar/ed25519-multikey";
import { afterEach, describe, expect, it } from "vitest";

import { generateEd25519KeyPair } from "@/modules/signing/key-generator";

import * as signerRuntime from "./runtime";
import { createSignerRuntime, type SignerRuntimeConfig } from "./runtime";

const temporaryDirectories: string[] = [];

const unsignedCredential = {
  "@context": [
    "https://www.w3.org/ns/credentials/v2",
    "https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json",
  ],
  id: "https://badges.example.test/credentials/public-1",
  type: ["VerifiableCredential", "OpenBadgeCredential"],
  issuer: "https://badges.example.test/api/issuers/hau-soc",
  validFrom: "2026-08-25T00:00:00Z",
  credentialSubject: {
    id: "urn:uuid:privacy-preserving-subject",
    type: ["AchievementSubject"],
    achievement: {
      id: "https://badges.example.test/achievements/one",
      type: ["Achievement"],
      name: "Security Foundations",
      description: "Completed the security foundations requirements.",
      criteria: { narrative: "Complete every assessed activity." },
    },
  },
};

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

async function createPrivateKeyFixture(mode = 0o600) {
  const directory = await mkdtemp(join(tmpdir(), "hau-signer-runtime-"));
  temporaryDirectories.push(directory);
  const privateKeyPath = join(directory, "signing.key");
  const generated = await generateEd25519KeyPair();
  await writeFile(
    privateKeyPath,
    JSON.stringify({ privateKeyMultibase: generated.privateKeyMultibase }),
    { mode },
  );
  await chmod(privateKeyPath, mode);
  const config: SignerRuntimeConfig = {
    privateKeyPath,
    keyId: "https://badges.example.test/api/issuers/hau-soc/keys/key-1",
    publicKeyMultibase: generated.publicKeyMultibase,
    fingerprint: generated.fingerprint,
  };
  return { config, generated, privateKeyPath };
}

describe("createSignerRuntime", () => {
  it("is ready only when a restrictive private key file matches every public setting", async () => {
    const { config } = await createPrivateKeyFixture();

    const runtime = await createSignerRuntime(config);

    expect(runtime.getHealth()).toEqual({
      status: "ready",
      keyId: config.keyId,
      cryptosuite: "eddsa-rdfc-2022",
    });
  });

  it("stays unready when the private key file is group or world accessible", async () => {
    const { config } = await createPrivateKeyFixture(0o644);

    const runtime = await createSignerRuntime(config);

    expect(runtime.getHealth().status).toBe("unready");
    await expect(runtime.sign(unsignedCredential, "correlation-mode")).rejects.toMatchObject({
      code: "SIGNER_UNAVAILABLE",
    });
  });

  it("stays unready when the private key file is malformed", async () => {
    const { config, privateKeyPath } = await createPrivateKeyFixture();
    await writeFile(privateKeyPath, JSON.stringify({ privateKeyMultibase: "not-a-key" }), {
      mode: 0o600,
    });

    const runtime = await createSignerRuntime(config);

    expect(runtime.getHealth().status).toBe("unready");
  });

  it("stays unready for a legacy secret with corrupted trailing bytes", async () => {
    const { config, privateKeyPath } = await createPrivateKeyFixture();
    const keyPair = await Ed25519Multikey.generate();
    const legacy = await keyPair.export({ publicKey: true, secretKey: true });
    if (!legacy.publicKeyMultibase || !legacy.secretKeyMultibase) {
      throw new Error("Test key generation failed");
    }
    const bytes = base58btc.decode(legacy.secretKeyMultibase.slice(1));
    const trailingIndex = bytes.length - 1;
    bytes[trailingIndex] = (bytes[trailingIndex] ?? 0) ^ 1;
    const malformedLegacySecret = `z${base58btc.encode(bytes)}`;
    await writeFile(
      privateKeyPath,
      JSON.stringify({ privateKeyMultibase: malformedLegacySecret }),
      { mode: 0o600 },
    );

    const runtime = await createSignerRuntime({
      ...config,
      publicKeyMultibase: legacy.publicKeyMultibase,
      fingerprint: legacy.publicKeyMultibase,
    });

    expect(runtime.getHealth().status).toBe("unready");
  });

  it("stays unready when the private key does not match configured public metadata", async () => {
    const { config } = await createPrivateKeyFixture();
    const otherPair = await generateEd25519KeyPair();

    const runtime = await createSignerRuntime({
      ...config,
      publicKeyMultibase: otherPair.publicKeyMultibase,
      fingerprint: otherPair.fingerprint,
    });

    expect(runtime.getHealth().status).toBe("unready");
  });

  it("stays unready when the configured fingerprint does not match the public key", async () => {
    const { config } = await createPrivateKeyFixture();

    const runtime = await createSignerRuntime({ ...config, fingerprint: "z6MkWrong" });

    expect(runtime.getHealth().status).toBe("unready");
  });

  it("rejects a credential that contains an unknown JSON-LD context", async () => {
    const { config } = await createPrivateKeyFixture();
    const runtime = await createSignerRuntime(config);
    const document = {
      ...structuredClone(unsignedCredential),
      "@context": [...unsignedCredential["@context"], "https://attacker.invalid/context"],
    };

    await expect(runtime.sign(document, "correlation-context")).rejects.toMatchObject({
      code: "INVALID_DOCUMENT",
    });
  });

  it("returns a typed document error when canonicalization rejects an undefined term", async () => {
    const { config } = await createPrivateKeyFixture();
    const runtime = await createSignerRuntime(config);
    const document = { ...structuredClone(unsignedCredential), undefinedSecurityTerm: "private" };

    await expect(runtime.sign(document, "correlation-invalid-term")).rejects.toMatchObject({
      code: "INVALID_DOCUMENT",
    });
  });

  it("adds the expected EdDSA RDFC 2022 proof fields", async () => {
    const { config } = await createPrivateKeyFixture();
    const runtime = await createSignerRuntime(config);

    const signed = await runtime.sign(unsignedCredential, "correlation-sign");

    expect(signed.proof).toMatchObject({
      type: "DataIntegrityProof",
      cryptosuite: "eddsa-rdfc-2022",
      proofPurpose: "assertionMethod",
      verificationMethod: config.keyId,
      proofValue: expect.stringMatching(/^z/),
    });
  });

  it("returns INVALID_PROOF after any signed claim is modified", async () => {
    const { config } = await createPrivateKeyFixture();
    const runtime = await createSignerRuntime(config);
    const signed = await runtime.sign(unsignedCredential, "correlation-valid");
    const tampered = structuredClone(signed);
    tampered.credentialSubject = {
      ...tampered.credentialSubject,
      id: "urn:uuid:tampered-subject",
    };

    await expect(runtime.verify(signed, "correlation-verify-valid")).resolves.toEqual({
      outcome: "VERIFIED",
      keyId: config.keyId,
    });
    await expect(runtime.verify(tampered, "correlation-verify-tampered")).resolves.toEqual({
      outcome: "INVALID_PROOF",
      keyId: config.keyId,
    });
  });

  it("logs only safe operation metadata", async () => {
    const { config, generated } = await createPrivateKeyFixture();
    const logEntries: Array<{ event: string; fields: Record<string, unknown> }> = [];
    const runtime = await createSignerRuntime(config, (event, fields) => {
      logEntries.push({ event, fields: { ...fields } });
    });

    const correlationId = "00000000-0000-4000-8000-000000000001";
    await runtime.sign(unsignedCredential, correlationId);

    const serialized = JSON.stringify(logEntries);
    expect(serialized).toContain(correlationId);
    expect(serialized).not.toContain("privacy-preserving-subject");
    expect(serialized).not.toContain("Security Foundations");
    expect(serialized).not.toContain(generated.privateKeyMultibase);
    expect(serialized).not.toContain(generated.publicKeyMultibase);
  });

  it("does not log an unsafe correlation value supplied by a direct caller", async () => {
    const { config } = await createPrivateKeyFixture();
    const logEntries: Array<{ event: string; fields: Record<string, unknown> }> = [];
    const runtime = await createSignerRuntime(config, (event, fields) => {
      logEntries.push({ event, fields: { ...fields } });
    });

    await runtime.sign(unsignedCredential, "recipient-private-value");

    expect(JSON.stringify(logEntries)).not.toContain("recipient-private-value");
  });
});

describe("bounded private-file reads", () => {
  it("requests at most MAX+1 bytes and rejects content beyond the limit", async () => {
    const readBoundedOpenFile = (
      signerRuntime as unknown as {
        readBoundedOpenFile?: (
          file: {
            read(
              buffer: Buffer,
              offset: number,
              length: number,
              position: number,
            ): Promise<{ bytesRead: number }>;
          },
          maximumBytes: number,
        ) => Promise<Buffer>;
      }
    ).readBoundedOpenFile;
    expect(readBoundedOpenFile).toBeTypeOf("function");
    if (!readBoundedOpenFile) return;
    const source = Buffer.from("twelve-bytes");
    let sourceOffset = 0;
    let highestRequestedEnd = 0;
    const file = {
      async read(buffer: Buffer, offset: number, length: number) {
        highestRequestedEnd = Math.max(highestRequestedEnd, offset + length);
        const bytesRead = Math.min(3, length, source.length - sourceOffset);
        source.copy(buffer, offset, sourceOffset, sourceOffset + bytesRead);
        sourceOffset += bytesRead;
        return { bytesRead };
      },
    };

    await expect(readBoundedOpenFile(file, 10)).rejects.toThrow("Private key file is too large");
    expect(sourceOffset).toBe(11);
    expect(highestRequestedEnd).toBeLessThanOrEqual(11);
  });
});
