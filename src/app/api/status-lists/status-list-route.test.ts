import { createHash } from "node:crypto";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { encodeRevocationList } from "@/modules/open-badges/status-list";

const state = vi.hoisted(() => ({ findUnique: vi.fn() }));

vi.mock("@/platform/db/prisma", () => ({
  prisma: { credentialStatusList: { findUnique: state.findUnique } },
}));

import { GET } from "./[listId]/route";

const signedList = {
  "@context": ["https://www.w3.org/ns/credentials/v2"],
  id: "https://badges.example.test/api/status-lists/list-1",
  type: ["VerifiableCredential", "BitstringStatusListCredential"],
  issuer: "https://badges.example.test/api/issuers/hau-soc",
  validFrom: "2026-08-25T00:00:00.000Z",
  credentialSubject: {
    id: "https://badges.example.test/api/status-lists/list-1#list",
    type: "BitstringStatusList",
    statusPurpose: "revocation",
    encodedList: encodeRevocationList([], 131_072),
  },
  proof: {
    type: "DataIntegrityProof",
    cryptosuite: "eddsa-rdfc-2022",
    proofPurpose: "assertionMethod",
    verificationMethod: "https://badges.example.test/api/issuers/hau-soc/keys/key-1",
    proofValue: "z3FXQqBNXUtsjQ",
  },
};
const signedListDigest = createHash("sha256").update(JSON.stringify(signedList)).digest("hex");

function currentList(overrides: Record<string, unknown> = {}) {
  return {
    publicUrl: signedList.id,
    signedCredentialJson: signedList,
    signingKeyId: "key-1",
    signingKey: { id: "key-1", verificationMethodUrl: signedList.proof.verificationMethod },
    digest: signedListDigest,
    version: 1,
    allocations: [],
    ...overrides,
  };
}

function listRequest(listId = "list-1") {
  return GET(new Request(`https://badges.example.test/api/status-lists/${listId}`), {
    params: Promise.resolve({ listId }),
  });
}

describe("GET /api/status-lists/[listId]", () => {
  beforeEach(() => vi.resetAllMocks());

  it("returns the signed JSON-LD list with revalidation-safe and security headers", async () => {
    state.findUnique.mockResolvedValue(currentList());

    const response = await listRequest();

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/ld+json; charset=utf-8");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("ETag")).toBe(`"${signedListDigest}"`);
    expect(response.headers.get("Referrer-Policy")).toBe("no-referrer");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    await expect(response.json()).resolves.toEqual(signedList);
  });

  it("uses a generic 404 for an unknown or malformed list", async () => {
    state.findUnique.mockResolvedValue(null);

    const unknown = await listRequest("missing-list");
    const malformed = await listRequest("../private");

    expect(unknown.status).toBe(404);
    await expect(unknown.text()).resolves.toBe('{"error":"Not found"}');
    expect(malformed.status).toBe(404);
    expect(state.findUnique).toHaveBeenCalledTimes(1);
  });

  it("returns 503 instead of a potentially stale active list when no signed list is current", async () => {
    state.findUnique.mockResolvedValue(
      currentList({
        signedCredentialJson: null,
        signingKeyId: null,
        signingKey: null,
        digest: null,
      }),
    );

    const response = await listRequest();

    expect(response.status).toBe(503);
    await expect(response.text()).resolves.toBe('{"error":"Status list unavailable"}');
  });

  it("returns 503 when current-list retrieval fails", async () => {
    state.findUnique.mockRejectedValue(new Error("database unavailable"));

    const response = await listRequest();

    expect(response.status).toBe(503);
    await expect(response.text()).resolves.toBe('{"error":"Status list unavailable"}');
  });

  it("returns 503 for a digest-consistent older signed list after the list version advances", async () => {
    state.findUnique.mockResolvedValue(
      currentList({
        version: 2,
        allocations: [{ index: 9, isRevoked: true, statusListVersion: 1 }],
      }),
    );

    const response = await listRequest();

    expect(response.status).toBe(503);
  });

  it("returns 503 when an allocation's current bit differs from the signed status list", async () => {
    state.findUnique.mockResolvedValue(
      currentList({
        allocations: [{ index: 9, isRevoked: true, statusListVersion: 1 }],
      }),
    );

    const response = await listRequest();

    expect(response.status).toBe(503);
  });

  it("returns the current signed list when a newly issued active allocation remains at version zero", async () => {
    state.findUnique.mockResolvedValue(
      currentList({
        version: 2,
        allocations: [{ index: 9, isRevoked: false, statusListVersion: 0 }],
      }),
    );

    const response = await listRequest();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(signedList);
  });

  it("returns 503 when the signing key does not match the proof verification method", async () => {
    state.findUnique.mockResolvedValue(
      currentList({
        signingKey: {
          id: "key-1",
          verificationMethodUrl: "https://badges.example.test/keys/other",
        },
      }),
    );

    const response = await listRequest();

    expect(response.status).toBe(503);
  });

  it("never exposes allocation, issuance, or recipient mapping data", async () => {
    state.findUnique.mockResolvedValue({
      ...currentList(),
      allocations: [
        {
          index: 9,
          isRevoked: false,
          statusListVersion: 0,
          issuanceId: "issuance-1",
          recipientEmail: "private@example.edu",
          maliciousRecipientMapping: { studentNumber: "2026-00001" },
        },
      ],
    });

    const response = await listRequest();
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).not.toContain("issuance-1");
    expect(body).not.toContain("private@example.edu");
    expect(body).not.toContain("2026-00001");
    expect(body).not.toContain("maliciousRecipientMapping");
    expect(body).not.toContain("allocations");
  });
});
