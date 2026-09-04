import { beforeEach, describe, expect, it, vi } from "vitest";

import { AuthorizationError } from "@/modules/identity/policies/authorization";
import type { Actor } from "@/modules/identity/types";
import { IssuanceNotFoundError } from "@/modules/issuance/services/issuance-query-service";

const state = vi.hoisted(() => ({
  actor: null as Actor | null,
  getClassWorkspace: vi.fn(),
  getIssuanceDetail: vi.fn(),
  listIssuanceExportRows: vi.fn(),
  consumeRateLimit: vi.fn(),
}));

vi.mock("@/modules/identity/services/current-actor", () => ({
  getCurrentActor: vi.fn(async () => state.actor),
}));

vi.mock("@/modules/rosters/services/roster-service", () => ({
  getClassWorkspace: state.getClassWorkspace,
}));

vi.mock("@/modules/issuance/services/issuance-query-service", async () => {
  const actual = await vi.importActual<
    typeof import("@/modules/issuance/services/issuance-query-service")
  >("@/modules/issuance/services/issuance-query-service");
  return {
    ...actual,
    getIssuanceDetail: state.getIssuanceDetail,
    listIssuanceExportRows: state.listIssuanceExportRows,
  };
});

vi.mock("@/modules/issuance/services/issuance-csv", () => ({
  buildIssuanceCsv: vi.fn(() => new TextEncoder().encode('"Public ID"\r\n"public-1"')),
}));
vi.mock("@/platform/security/shared-rate-limit", () => ({
  consumeRateLimit: state.consumeRateLimit,
}));

import { GET as getClassCsv } from "../classes/[classId]/issued/export/route";
import { GET as getCredential } from "./[issuanceId]/credential/route";
import { GET as getGlobalCsv } from "./export/route";

const faculty: Actor = {
  id: "faculty-1",
  name: "Prof. Reyes",
  email: "reyes@example.edu",
  role: "FACULTY",
};

const administrator: Actor = {
  id: "admin-1",
  name: "Administrator",
  email: "admin@example.edu",
  role: "ADMIN",
};

const exportRows = [
  {
    publicId: "public-1",
    status: "ACTIVE" as const,
    issuedAt: "2026-08-12T08:30:15.250Z",
    expiresAt: null,
    classCourseCode: "CS 401",
    classTitle: "Secure Systems",
    classSection: "A",
    badgeName: "Secure Systems Foundations",
    studentNumber: "2026-00001",
    recipientDisplayName: "Juan Dela Cruz",
    recipientEmail: "juan@example.edu",
    issuerUserName: "Prof. Reyes",
  },
];

const credential = {
  "@context": [
    "https://www.w3.org/ns/credentials/v2",
    "https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json",
  ],
  id: "https://badges.example.edu/credentials/public-1",
  type: ["VerifiableCredential", "OpenBadgeCredential"],
};

const issuanceDetail = {
  id: "issuance-1",
  publicId: "public-1",
  status: "ACTIVE" as const,
  issuedAt: "2026-08-12T08:30:15.250Z",
  expiresAt: null,
  classId: "class-1",
  badgeTemplateId: "badge-1",
  studentId: "student-1",
  issuerUserId: "faculty-1",
  recipient: {
    studentId: "student-1",
    studentNumber: "2026-00001",
    displayName: "Juan Dela Cruz",
    firstName: "Juan",
    lastName: "Dela Cruz",
    email: "juan@example.edu",
  },
  achievement: {} as never,
  issuer: {} as never,
  credential,
};

const classContext = { params: Promise.resolve({ classId: "class-1" }) };
const credentialContext = { params: Promise.resolve({ issuanceId: "issuance-1" }) };

function assertDenied(response: Response, status = 403) {
  expect(response.status).toBe(status);
  expect(response.headers.get("content-disposition")).toBeNull();
  return expect(response.json()).resolves.toEqual(
    status === 404 ? { error: "Not found" } : { error: "Forbidden" },
  );
}

describe("issued credential downloads", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    state.actor = administrator;
    state.getClassWorkspace.mockResolvedValue({ id: "class-1" });
    state.listIssuanceExportRows.mockResolvedValue(exportRows);
    state.getIssuanceDetail.mockResolvedValue(issuanceDetail);
    state.consumeRateLimit.mockResolvedValue({
      allowed: true,
      limit: 30,
      remaining: 29,
      retryAfterSeconds: 0,
    });
  });

  it.each([
    ["Administrator", administrator],
    ["owning Faculty", faculty],
  ])(
    "downloads global CSV for an authenticated %s while preserving filters",
    async (_name, actor) => {
      state.actor = actor;
      const response = await getGlobalCsv(
        new Request(
          "http://localhost/api/issued/export?query=Juan&status=ACTIVE&classId=class-1&badgeTemplateId=badge-1&page=2",
        ),
      );

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe("text/csv; charset=utf-8");
      expect(response.headers.get("cache-control")).toBe("private, no-store");
      expect(response.headers.get("content-disposition")).toBe(
        'attachment; filename="issued-credentials.csv"',
      );
      expect(await response.text()).toContain("Public ID");
      expect(state.listIssuanceExportRows).toHaveBeenCalledWith(actor, {
        query: "Juan",
        status: "ACTIVE",
        classId: "class-1",
        badgeTemplateId: "badge-1",
        page: 2,
      });
    },
  );

  it.each([
    ["Administrator", administrator],
    ["owning Faculty", faculty],
  ])(
    "downloads class CSV for an authenticated %s without honoring a conflicting class filter",
    async (_name, actor) => {
      state.actor = actor;
      const response = await getClassCsv(
        new Request(
          "http://localhost/api/classes/class-1/issued/export?classId=class-2&query=Juan",
        ),
        classContext,
      );

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe("text/csv; charset=utf-8");
      expect(response.headers.get("cache-control")).toBe("private, no-store");
      expect(response.headers.get("content-disposition")).toBe(
        'attachment; filename="class-class-1-issued-credentials.csv"',
      );
      expect(state.getClassWorkspace).toHaveBeenCalledWith(actor, "class-1");
      expect(state.listIssuanceExportRows).toHaveBeenCalledWith(actor, {
        classId: "class-1",
        query: "Juan",
        page: 1,
      });
    },
  );

  it.each([
    ["global CSV", () => getGlobalCsv(new Request("http://localhost/api/issued/export"))],
    [
      "class CSV",
      () =>
        getClassCsv(
          new Request("http://localhost/api/classes/class-1/issued/export"),
          classContext,
        ),
    ],
    [
      "credential JSON",
      () =>
        getCredential(
          new Request("http://localhost/api/issued/issuance-1/credential"),
          credentialContext,
        ),
    ],
  ])("denies an unauthenticated %s request without protected content", async (_name, request) => {
    state.actor = null;

    await assertDenied(await request());
    expect(state.getClassWorkspace).not.toHaveBeenCalled();
    expect(state.listIssuanceExportRows).not.toHaveBeenCalled();
    expect(state.getIssuanceDetail).not.toHaveBeenCalled();
  });

  it("safely denies a non-owner Faculty class export without an attachment", async () => {
    state.actor = faculty;
    state.getClassWorkspace.mockRejectedValueOnce(
      new AuthorizationError("Class owner access required"),
    );

    await assertDenied(
      await getClassCsv(
        new Request("http://localhost/api/classes/class-1/issued/export"),
        classContext,
      ),
    );
    expect(state.listIssuanceExportRows).not.toHaveBeenCalled();
  });

  it.each([
    ["global", () => getGlobalCsv(new Request("http://localhost/api/issued/export"))],
    [
      "class",
      () =>
        getClassCsv(
          new Request("http://localhost/api/classes/class-1/issued/export"),
          classContext,
        ),
    ],
  ])("rate-limits %s issuance export before querying rows", async (_name, invoke) => {
    state.consumeRateLimit.mockResolvedValueOnce({
      allowed: false,
      limit: 30,
      remaining: 0,
      retryAfterSeconds: 11,
    });

    const response = await invoke();

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("11");
    expect(response.headers.get("content-disposition")).toBeNull();
    expect(await response.json()).toEqual({ error: "Too many requests" });
    expect(state.listIssuanceExportRows).not.toHaveBeenCalled();
  });

  it("returns a safe not-found response when the requested class is unavailable", async () => {
    state.getClassWorkspace.mockRejectedValueOnce(new Error("Record not found"));

    await assertDenied(
      await getClassCsv(new Request("http://localhost/api/classes/class-missing/issued/export"), {
        params: Promise.resolve({ classId: "class-missing" }),
      }),
      404,
    );
    expect(state.listIssuanceExportRows).not.toHaveBeenCalled();
  });

  it("downloads credential JSON for an Administrator or owning Faculty without recipient email", async () => {
    for (const actor of [administrator, faculty]) {
      state.actor = actor;
      const response = await getCredential(
        new Request("http://localhost/api/issued/issuance-1/credential"),
        credentialContext,
      );

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe("application/ld+json");
      expect(response.headers.get("cache-control")).toBe("private, no-store");
      expect(response.headers.get("content-disposition")).toBe(
        'attachment; filename="credential-public-1.json"',
      );
      expect(await response.json()).toEqual(credential);
      expect(state.getIssuanceDetail).toHaveBeenLastCalledWith(actor, "issuance-1");
    }
  });

  it("returns a safe not-found response when a non-owner Faculty cannot inspect a credential", async () => {
    state.actor = faculty;
    state.getIssuanceDetail.mockRejectedValueOnce(new IssuanceNotFoundError());

    await assertDenied(
      await getCredential(
        new Request("http://localhost/api/issued/issuance-1/credential"),
        credentialContext,
      ),
      404,
    );
  });

  it("translates an authorization exception without a protected attachment", async () => {
    state.getIssuanceDetail.mockRejectedValueOnce(new AuthorizationError());

    await assertDenied(
      await getCredential(
        new Request("http://localhost/api/issued/issuance-1/credential"),
        credentialContext,
      ),
    );
  });
});
