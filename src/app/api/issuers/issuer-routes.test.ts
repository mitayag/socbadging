import { createRequire } from "node:module";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { loadAllowlistedDocument } from "@/modules/open-badges/document-loader";

const jsonld = createRequire(import.meta.url)("jsonld") as {
  expand: (
    document: unknown,
    options: { safe: boolean; documentLoader: typeof loadAllowlistedDocument },
  ) => Promise<unknown[]>;
};

const state = vi.hoisted(() => ({ findMany: vi.fn(), findUnique: vi.fn() }));
vi.mock("@/platform/db/prisma", () => ({
  prisma: { signingKey: { findMany: state.findMany, findUnique: state.findUnique } },
}));

import { GET as getIssuer } from "./hau-soc/route";
import { GET as getKey } from "./hau-soc/keys/[keyId]/route";

const controller = "http://localhost:3000/api/issuers/hau-soc";
const key = {
  id: "key-1",
  verificationMethodUrl: `${controller}/keys/key-1`,
  controllerUrl: controller,
  publicMultikey: "z6MkhYk",
  status: "RETIRED",
  retiredAt: new Date("2026-08-25T00:00:00.000Z"),
  compromisedAt: null,
  fingerprint: "z6MkhYk",
  algorithm: "Ed25519",
  cryptosuite: "eddsa-rdfc-2022",
};

function headers(response: Response) {
  expect(response.headers.get("Content-Type")).toBe("application/ld+json; charset=utf-8");
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  expect(response.headers.get("Content-Security-Policy")).toBe(
    "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
  );
  expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
}

describe("public issuer and Multikey documents", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    state.findMany.mockResolvedValue([key]);
    state.findUnique.mockResolvedValue(key);
  });

  it("publishes the canonical Profile and public verification methods only", async () => {
    const response = await getIssuer();
    const body = await response.json();
    expect(response.status).toBe(200);
    headers(response);
    expect(body).toMatchObject({
      id: controller,
      type: ["Profile"],
      verificationMethod: [key.verificationMethodUrl],
    });
    expect(JSON.stringify(body)).not.toMatch(/private|secret|note/i);
    await expect(
      jsonld.expand(body, { safe: true, documentLoader: loadAllowlistedDocument }),
    ).resolves.toEqual(expect.any(Array));
  });

  it("keeps retired keys resolvable and exposes compromised state without internal notes", async () => {
    const retired = await getKey(new Request(key.verificationMethodUrl), {
      params: Promise.resolve({ keyId: "key-1" }),
    });
    expect(retired.status).toBe(200);
    headers(retired);
    const retiredBody = await retired.json();
    expect(retiredBody).toMatchObject({
      id: key.verificationMethodUrl,
      controller,
      type: "Multikey",
      publicKeyMultibase: key.publicMultikey,
      keyTrust: { state: "RETIRED" },
    });
    state.findUnique.mockResolvedValueOnce({
      ...key,
      status: "COMPROMISED",
      compromisedAt: new Date(),
    });
    const compromised = await getKey(new Request(key.verificationMethodUrl), {
      params: Promise.resolve({ keyId: "key-1" }),
    });
    expect(await compromised.json()).toMatchObject({
      keyTrust: { state: "COMPROMISED" },
    });
    await expect(
      jsonld.expand(retiredBody, {
        safe: true,
        documentLoader: loadAllowlistedDocument,
      }),
    ).resolves.toEqual(expect.any(Array));
  });

  it("uses the same generic JSON-LD 404 for unknown and malformed keys", async () => {
    state.findUnique.mockResolvedValueOnce(null);
    const missing = await getKey(new Request(`${controller}/keys/missing`), {
      params: Promise.resolve({ keyId: "missing" }),
    });
    const malformed = await getKey(new Request(`${controller}/keys/nope`), {
      params: Promise.resolve({ keyId: "../../private" }),
    });
    expect([missing.status, malformed.status]).toEqual([404, 404]);
    expect(await missing.text()).toBe(await malformed.text());
    headers(missing);
    headers(malformed);
  });
});
