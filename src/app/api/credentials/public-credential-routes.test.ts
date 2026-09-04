import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PublicCredential } from "@/modules/verification/types";

const state = vi.hoisted(() => ({
  checkRateLimit: vi.fn(),
  getPublicCredential: vi.fn(),
  serializePublicCredentialJson: vi.fn(),
}));

vi.mock("@/platform/security/public-rate-limit", () => ({
  consumePublicCredentialRateLimit: state.checkRateLimit,
}));

vi.mock("@/modules/verification/services/public-credential-service", () => ({
  getPublicCredential: state.getPublicCredential,
}));

vi.mock("@/modules/verification/services/public-credential-json", () => ({
  serializePublicCredentialJson: state.serializePublicCredentialJson,
}));

import { GET as getInline } from "./[publicId]/route";
import { GET as getDownload } from "./[publicId]/download/route";

const publicId = "abcdefghijklmnopqrstuvwxyzABCDEF";
const publicCredential = { publicId } as PublicCredential;
const publicJson = JSON.stringify({
  "@context": ["https://www.w3.org/ns/credentials/v2"],
  id: `http://localhost:3000/credentials/${publicId}`,
  type: ["VerifiableCredential", "OpenBadgeCredential"],
  "https://hau.edu.ph/ns/credential-lifecycle": { status: "ACTIVE", unsigned: true },
});

const privateSentinels = [
  "maria@example.edu",
  "2026-00001",
  "student-id-private",
  "issuance-id-private",
  "issuer-user-private",
  "badges/private-source.png",
];

function context(value: unknown) {
  return { params: Promise.resolve(value) } as { params: Promise<{ publicId: string }> };
}

function request() {
  return new Request(`http://localhost/api/credentials/${publicId}`, {
    headers: { "x-real-ip": "203.0.113.10" },
  });
}

function assertPublicSecurityHeaders(response: Response) {
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(response.headers.get("content-security-policy")).toBe(
    "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
  );
  expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  expect(response.headers.get("referrer-policy")).toBe("no-referrer");
}

describe("public credential JSON-LD route boundaries", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    state.checkRateLimit.mockResolvedValue({
      allowed: true,
      limit: 60,
      remaining: 59,
      retryAfterSeconds: 0,
    });
    state.getPublicCredential.mockResolvedValue(publicCredential);
    state.serializePublicCredentialJson.mockReturnValue(publicJson);
  });

  it.each([
    ["active", "ACTIVE"],
    ["revoked", "REVOKED"],
    ["expired", "EXPIRED"],
  ])("returns only deterministic %s Task 2 JSON-LD inline", async (_statusName, status) => {
    state.serializePublicCredentialJson.mockReturnValueOnce(
      publicJson.replace('"ACTIVE"', `"${status}"`),
    );

    const response = await getInline(request(), context({ publicId }));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/ld+json; charset=utf-8");
    expect(response.headers.get("content-disposition")).toBeNull();
    assertPublicSecurityHeaders(response);
    const body = await response.text();
    expect(body).toContain(`"${status}"`);
    for (const sentinel of privateSentinels) expect(body).not.toContain(sentinel);
  });

  it("uses the same deterministic JSON-LD as a safe attachment download", async () => {
    const response = await getDownload(request(), context({ publicId }));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/ld+json; charset=utf-8");
    expect(response.headers.get("content-disposition")).toBe(
      `attachment; filename="credential-${publicId}.json"`,
    );
    assertPublicSecurityHeaders(response);
    expect(await response.text()).toBe(publicJson);
  });

  it("keeps a persisted signed JSON-LD document byte-equivalent inline and as a download", async () => {
    const persistedSignedBytes =
      '{"@context":["https://www.w3.org/ns/credentials/v2"],"id":"https://badges.example.test/credentials/abcdefghijklmnopqrstuvwxyzABCDEF","type":["VerifiableCredential","OpenBadgeCredential"],"proof":{"type":"DataIntegrityProof","cryptosuite":"eddsa-rdfc-2022"}}';
    state.serializePublicCredentialJson.mockReturnValueOnce(persistedSignedBytes);
    const inline = await getInline(request(), context({ publicId }));
    state.serializePublicCredentialJson.mockReturnValueOnce(persistedSignedBytes);
    const download = await getDownload(request(), context({ publicId }));

    expect(await inline.text()).toBe(persistedSignedBytes);
    expect(await download.text()).toBe(persistedSignedBytes);
    expect(persistedSignedBytes).not.toContain("maria@example.edu");
    expect(persistedSignedBytes).not.toContain("2026-00001");
  });

  it.each([getInline, getDownload])(
    "returns identical generic 404 responses for malformed, missing, and corrupt credentials",
    async (route) => {
      const malformed = await route(request(), context({ publicId: "../../private-record" }));
      state.getPublicCredential.mockRejectedValueOnce(new Error("missing record"));
      const missing = await route(request(), context({ publicId }));
      state.getPublicCredential.mockRejectedValueOnce(new Error("raw snapshot corruption"));
      const corrupt = await route(request(), context({ publicId }));

      const responses = [malformed, missing, corrupt];
      const bodies = await Promise.all(responses.map((response) => response.text()));
      expect(responses.map((response) => response.status)).toEqual([404, 404, 404]);
      expect(bodies).toEqual([bodies[0], bodies[0], bodies[0]]);
      for (const response of responses) {
        expect(response.headers.get("content-disposition")).toBeNull();
        assertPublicSecurityHeaders(response);
      }
      expect(state.getPublicCredential).toHaveBeenCalledTimes(2);
    },
  );

  it.each([getInline, getDownload])(
    "rejects at the rate-limit boundary before public credential service work without an attachment",
    async (route) => {
      state.checkRateLimit.mockResolvedValueOnce({
        allowed: false,
        limit: 60,
        remaining: 0,
        retryAfterSeconds: 9,
      });

      const response = await route(request(), context({ publicId }));

      expect(response.status).toBe(429);
      expect(response.headers.get("retry-after")).toBe("9");
      expect(response.headers.get("content-disposition")).toBeNull();
      assertPublicSecurityHeaders(response);
      expect(await response.text()).not.toContain(publicId);
      expect(state.getPublicCredential).not.toHaveBeenCalled();
      expect(state.serializePublicCredentialJson).not.toHaveBeenCalled();
    },
  );

  it.each([getInline, getDownload])(
    "awaits and validates asynchronous route params before rate limiting or service work",
    async (route) => {
      const response = await route(request(), context({ publicId: 42 }));

      expect(response.status).toBe(404);
      expect(state.checkRateLimit).not.toHaveBeenCalled();
      expect(state.getPublicCredential).not.toHaveBeenCalled();
      expect(response.headers.get("content-disposition")).toBeNull();
      assertPublicSecurityHeaders(response);
    },
  );
});
