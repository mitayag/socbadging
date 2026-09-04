// @vitest-environment node

import { createServer, type RequestListener, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import { afterEach, describe, expect, it } from "vitest";

import { createSignerClient, getSignerHealth } from "./signer-client";

const servers: Server[] = [];
const previousSignerUrl = process.env.SIGNER_URL;
const previousSignerToken = process.env.SIGNER_TOKEN;
const previousSignerTimeout = process.env.SIGNER_TIMEOUT_MS;
const document = {
  "@context": "https://www.w3.org/ns/credentials/v2",
  id: "https://badges.example.test/credentials/one",
  type: ["VerifiableCredential", "OpenBadgeCredential"],
  issuer: "https://badges.example.test/api/issuers/hau-soc",
  credentialSubject: { id: "urn:uuid:subject" },
};
const signedDocument = {
  ...document,
  proof: {
    type: "DataIntegrityProof",
    cryptosuite: "eddsa-rdfc-2022",
    proofPurpose: "assertionMethod",
    verificationMethod: "https://badges.example.test/api/issuers/hau-soc/keys/key-1",
    proofValue: "z3FXQqBNXUtsjQ",
  },
};

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(async (server) => {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }),
  );
  if (previousSignerUrl === undefined) delete process.env.SIGNER_URL;
  else process.env.SIGNER_URL = previousSignerUrl;
  if (previousSignerToken === undefined) delete process.env.SIGNER_TOKEN;
  else process.env.SIGNER_TOKEN = previousSignerToken;
  if (previousSignerTimeout === undefined) delete process.env.SIGNER_TIMEOUT_MS;
  else process.env.SIGNER_TIMEOUT_MS = previousSignerTimeout;
});

async function startServer(handler: RequestListener) {
  const server = createServer(handler);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}

describe("signer client", () => {
  it("maps an aborted signer request to SIGNER_UNAVAILABLE", async () => {
    const baseUrl = await startServer(() => undefined);
    const client = createSignerClient({ baseUrl, token: "test-token", timeoutMs: 20 });

    await expect(client.signCredential(document, "correlation-timeout")).rejects.toMatchObject({
      code: "SIGNER_UNAVAILABLE",
    });
  });

  it("maps a timeout while reading a started response to SIGNER_UNAVAILABLE", async () => {
    const baseUrl = await startServer((_request, response) => {
      response.writeHead(200, { "content-type": "application/json" });
      response.write('{"document":');
    });
    const client = createSignerClient({ baseUrl, token: "test-token", timeoutMs: 20 });

    await expect(
      client.signCredential(document, "correlation-stream-timeout"),
    ).rejects.toMatchObject({ code: "SIGNER_UNAVAILABLE" });
  });

  it("maps a midstream disconnect to SIGNER_UNAVAILABLE", async () => {
    const baseUrl = await startServer((_request, response) => {
      response.writeHead(200, { "content-type": "application/json" });
      response.write('{"document":');
      setImmediate(() => response.destroy(new Error("private transport detail")));
    });
    const client = createSignerClient({ baseUrl, token: "test-token", timeoutMs: 1000 });

    await expect(
      client.signCredential(document, "correlation-stream-disconnect"),
    ).rejects.toMatchObject({
      code: "SIGNER_UNAVAILABLE",
      message: "Credential signer is unavailable",
    });
  });

  it("rejects a signer response larger than 1 MiB", async () => {
    const baseUrl = await startServer((_request, response) => {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ padding: "x".repeat(1024 * 1024 + 1) }));
    });
    const client = createSignerClient({ baseUrl, token: "test-token", timeoutMs: 1000 });

    await expect(
      client.verifyCredential(signedDocument, "correlation-response-size"),
    ).rejects.toMatchObject({ code: "SIGNER_UNAVAILABLE" });
  });

  it("maps a malformed success response to INVALID_SIGNER_RESPONSE", async () => {
    const baseUrl = await startServer((_request, response) => {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ unexpected: true }));
    });
    const client = createSignerClient({ baseUrl, token: "test-token", timeoutMs: 1000 });

    await expect(client.signCredential(document, "correlation-malformed")).rejects.toMatchObject({
      code: "INVALID_SIGNER_RESPONSE",
    });
  });

  it("returns unavailable health when the signer is offline", async () => {
    process.env.SIGNER_URL = "http://127.0.0.1:1";
    process.env.SIGNER_TOKEN = "test-token";
    process.env.SIGNER_TIMEOUT_MS = "20";

    await expect(getSignerHealth()).resolves.toBeNull();
  });

  it("returns unavailable health for malformed signer health JSON", async () => {
    const baseUrl = await startServer((_request, response) => {
      response.writeHead(200, { "content-type": "application/json" });
      response.end("not-json");
    });
    process.env.SIGNER_URL = baseUrl;
    process.env.SIGNER_TOKEN = "test-token";
    process.env.SIGNER_TIMEOUT_MS = "1000";

    await expect(getSignerHealth()).resolves.toBeNull();
  });
});
