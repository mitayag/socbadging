import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  checkRateLimit: vi.fn(),
  sessionFindUnique: vi.fn(),
  issuanceFindFirst: vi.fn(),
}));

vi.mock("@/platform/security/public-rate-limit", () => ({
  consumePublicCredentialPageRateLimit: state.checkRateLimit,
}));
vi.mock("@/platform/db/prisma", () => ({
  prisma: {
    session: { findUnique: state.sessionFindUnique },
    badgeIssuance: { findFirst: state.issuanceFindFirst },
  },
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

describe("student badge ownership proxy", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  function studentRequest(issuanceId: string, token = "session-token") {
    return new NextRequest(`http://localhost/student/badges/${issuanceId}`, {
      headers: { cookie: `hau_session=${token}` },
    });
  }

  it("returns 404 for another student's credential before page rendering", async () => {
    state.sessionFindUnique.mockResolvedValue({
      expires: new Date(Date.now() + 60_000),
      user: {
        role: "STUDENT",
        status: "ACTIVE",
        deletedAt: null,
        mustChangePassword: false,
        studentAccount: { studentId: "student-a" },
      },
    });
    state.issuanceFindFirst.mockResolvedValue(null);

    const response = await proxy(studentRequest("issuance-b"));

    expect(response.status).toBe(404);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    await expect(response.text()).resolves.not.toContain("issuance-b");
  });

  it("allows an owned credential through", async () => {
    state.sessionFindUnique.mockResolvedValue({
      expires: new Date(Date.now() + 60_000),
      user: {
        role: "STUDENT",
        status: "ACTIVE",
        deletedAt: null,
        mustChangePassword: false,
        studentAccount: { studentId: "student-a" },
      },
    });
    state.issuanceFindFirst.mockResolvedValue({ id: "issuance-a" });

    const response = await proxy(studentRequest("issuance-a"));

    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("redirects unauthenticated private requests to login", async () => {
    const response = await proxy(new NextRequest("http://localhost/student/badges/issuance-a"));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost/login");
  });

  it("redirects students with a required password change away from the portal", async () => {
    state.sessionFindUnique.mockResolvedValue({
      expires: new Date(Date.now() + 60_000),
      user: {
        role: "STUDENT",
        status: "ACTIVE",
        deletedAt: null,
        mustChangePassword: true,
        studentAccount: { studentId: "student-a" },
      },
    });

    const response = await proxy(
      new NextRequest("http://localhost/student", {
        headers: { cookie: "hau_session=session-token" },
      }),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost/student/change-password");
  });

  it("allows the required password change page while the flag is set", async () => {
    state.sessionFindUnique.mockResolvedValue({
      expires: new Date(Date.now() + 60_000),
      user: {
        role: "STUDENT",
        status: "ACTIVE",
        deletedAt: null,
        mustChangePassword: true,
        studentAccount: { studentId: "student-a" },
      },
    });

    const response = await proxy(
      new NextRequest("http://localhost/student/change-password", {
        headers: { cookie: "hau_session=session-token" },
      }),
    );

    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("does not guard public recovery routes with a student session", async () => {
    const response = await proxy(new NextRequest("http://localhost/student/recover"));
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(state.sessionFindUnique).not.toHaveBeenCalled();
  });
});
