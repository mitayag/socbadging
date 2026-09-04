import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  authenticate: vi.fn(),
  consumeRateLimit: vi.fn(),
  createSession: vi.fn(),
}));

vi.mock("@/modules/identity/services/authenticate", () => ({
  authenticateWithPassword: state.authenticate,
}));
vi.mock("@/platform/security/shared-rate-limit", () => ({
  consumeRateLimit: state.consumeRateLimit,
}));
vi.mock("@/platform/db/prisma", () => ({
  prisma: { session: { create: state.createSession } },
}));
vi.mock("@/config/env", () => ({
  getServerEnv: () => ({ APP_URL: "http://localhost:3000", TRUST_PROXY: false }),
}));

import { POST } from "./route";

function loginRequest(email = "faculty@example.edu") {
  return new Request("http://localhost:3000/api/auth/login", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "http://localhost:3000",
      "x-forwarded-for": "203.0.113.42",
    },
    body: JSON.stringify({ email, password: "A-strong-password-2026!" }),
  });
}

describe("login route shared rate limit", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    state.consumeRateLimit.mockResolvedValue({
      allowed: true,
      limit: 10,
      remaining: 9,
      retryAfterSeconds: 0,
    });
    state.authenticate.mockResolvedValue(null);
  });

  it("returns a generic 429 before password verification and does not echo key material", async () => {
    state.consumeRateLimit.mockResolvedValueOnce({
      allowed: false,
      limit: 10,
      remaining: 0,
      retryAfterSeconds: 37,
    });

    const response = await POST(loginRequest("Private.User@Example.edu"));

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("37");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.text()).toBe('{"error":"Too many requests"}');
    expect(state.authenticate).not.toHaveBeenCalled();
    expect(state.createSession).not.toHaveBeenCalled();
  });

  it("isolates normalized account and untrusted client material in the login policy", async () => {
    await POST(loginRequest(" Private.User@Example.edu "));

    expect(state.consumeRateLimit).toHaveBeenCalledWith({
      policy: "login",
      key: "anonymous\u0000private.user@example.edu",
    });
  });
});
