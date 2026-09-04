import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ checkRateLimit: vi.fn() }));

vi.mock("@/platform/security/public-rate-limit", () => ({
  consumePublicCredentialPageRateLimit: state.checkRateLimit,
}));

import { proxy } from "./proxy";

const publicId = "abcdefghijklmnopqrstuvwxyzABCDEF";

describe("public credential proxy", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    state.checkRateLimit.mockResolvedValue({
      allowed: true,
      limit: 60,
      remaining: 59,
      retryAfterSeconds: 0,
    });
  });

  it("applies the public limiter before credential page work", async () => {
    await proxy(new NextRequest(`http://localhost/credentials/${publicId}`));

    expect(state.checkRateLimit).toHaveBeenCalledWith(expect.any(NextRequest), publicId);
  });

  it("returns a generic HTML 429 with retry and privacy headers when denied", async () => {
    state.checkRateLimit.mockResolvedValue({
      allowed: false,
      limit: 60,
      remaining: 0,
      retryAfterSeconds: 60,
    });

    const response = await proxy(new NextRequest(`http://localhost/credentials/${publicId}`));

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("60");
    expect(response.headers.get("Referrer-Policy")).toBe("no-referrer");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(response.headers.get("Content-Type")).toContain("text/html");
    await expect(response.text()).resolves.not.toContain(publicId);
  });
});
