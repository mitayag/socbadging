// @vitest-environment node

import { timingSafeEqual } from "node:crypto";
import type { AddressInfo } from "node:net";

import { afterEach, describe, expect, it } from "vitest";

import type {
  SignedOpenBadgeCredential,
  UnsignedOpenBadgeCredential,
} from "@/modules/open-badges/proof";

import type { SignerRuntime } from "./runtime";
import * as signerServer from "./server";
import { createSignerHttpServer } from "./server";

const servers: Array<ReturnType<typeof createSignerHttpServer>> = [];
const keyId = "https://badges.example.test/api/issuers/hau-soc/keys/key-1";
const document = {
  "@context": "https://www.w3.org/ns/credentials/v2",
  id: "https://badges.example.test/credentials/one",
  type: ["VerifiableCredential", "OpenBadgeCredential"],
  issuer: "https://badges.example.test/api/issuers/hau-soc",
  credentialSubject: { id: "urn:uuid:subject" },
} satisfies UnsignedOpenBadgeCredential;
const signedDocument = {
  ...document,
  proof: {
    type: "DataIntegrityProof",
    cryptosuite: "eddsa-rdfc-2022",
    proofPurpose: "assertionMethod",
    verificationMethod: keyId,
    proofValue: "z3FXQqBNXUtsjQ",
  },
} satisfies SignedOpenBadgeCredential;

const runtime: SignerRuntime = {
  getHealth: () => ({ status: "ready", keyId, cryptosuite: "eddsa-rdfc-2022" }),
  sign: async () => signedDocument,
  verify: async () => ({ outcome: "VERIFIED", keyId }),
};

afterEach(async () => {
  await Promise.all(
    servers
      .splice(0)
      .map(
        (server) =>
          new Promise<void>((resolve, reject) =>
            server.close((error) => (error ? reject(error) : resolve())),
          ),
      ),
  );
});

async function startServer() {
  const server = createSignerHttpServer({ runtime, token: "internal-test-token" });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}

describe("signer HTTP server", () => {
  it("performs the same fixed-length comparison for missing, wrong, and correct bearer values", () => {
    const matches = (
      signerServer as unknown as {
        constantTimeBearerTokenMatches?: (
          header: string | undefined,
          expected: string,
          compare: typeof timingSafeEqual,
        ) => boolean;
      }
    ).constantTimeBearerTokenMatches;
    expect(matches).toBeTypeOf("function");
    if (!matches) return;
    let comparisons = 0;
    const compare: typeof timingSafeEqual = (left, right) => {
      comparisons += 1;
      return timingSafeEqual(left, right);
    };

    expect(matches(undefined, "internal-test-token", compare)).toBe(false);
    expect(matches("Bearer wrong-token", "internal-test-token", compare)).toBe(false);
    expect(matches("Bearer internal-test-token", "internal-test-token", compare)).toBe(true);
    expect(comparisons).toBe(3);
  });

  it("returns only non-secret readiness fields from health", async () => {
    const baseUrl = await startServer();

    const response = await fetch(`${baseUrl}/health`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: "ready",
      keyId,
      cryptosuite: "eddsa-rdfc-2022",
    });
  });

  it.each([
    ["missing", undefined],
    ["wrong", "Bearer wrong-token"],
  ])("returns 401 for a %s bearer token", async (_label, authorization) => {
    const baseUrl = await startServer();

    const response = await fetch(`${baseUrl}/v1/sign`, {
      method: "POST",
      headers: authorization ? { authorization } : undefined,
      body: JSON.stringify({ operation: "credential.sign", document }),
    });

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "UNAUTHORIZED" });
  });

  it("returns 413 before parsing a body larger than 1 MiB", async () => {
    const baseUrl = await startServer();
    const oversized = "x".repeat(1024 * 1024 + 1);

    const response = await fetch(`${baseUrl}/v1/sign`, {
      method: "POST",
      headers: { authorization: "Bearer internal-test-token" },
      body: oversized,
    });

    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ error: "PAYLOAD_TOO_LARGE" });
  });

  it("returns 400 for an operation unsupported by the selected endpoint", async () => {
    const baseUrl = await startServer();

    const response = await fetch(`${baseUrl}/v1/sign`, {
      method: "POST",
      headers: {
        authorization: "Bearer internal-test-token",
        "content-type": "application/json",
      },
      body: JSON.stringify({ operation: "credential.verify", document }),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "INVALID_REQUEST" });
  });
});
