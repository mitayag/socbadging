import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Actor } from "@/modules/identity/types";

const state = vi.hoisted(() => ({
  actor: null as Actor | null,
  inspect: vi.fn(),
  preview: vi.fn(),
  detail: vi.fn(),
  authorizeSelection: vi.fn(),
  authorizeClass: vi.fn(),
  consumeRateLimit: vi.fn(),
}));

vi.mock("@/modules/identity/services/current-actor", () => ({
  getCurrentActor: vi.fn(async () => state.actor),
}));
vi.mock("@/modules/issuance/services/batch-validation", () => ({
  inspectBatchFile: state.inspect,
}));
vi.mock("@/modules/issuance/services/batch-preview-service", () => ({
  createBatchPreview: state.preview,
  getBatchDetail: state.detail,
  authorizeBatchSelection: state.authorizeSelection,
  authorizeBatchClass: state.authorizeClass,
}));
vi.mock("@/platform/security/shared-rate-limit", () => ({
  consumeRateLimit: state.consumeRateLimit,
}));
vi.mock("@/config/env", () => ({
  getServerEnv: () => ({ APP_URL: "http://localhost:3000" }),
}));

import { POST as inspectRoute } from "../classes/[classId]/issued/batch/inspect/route";
import { POST as previewRoute } from "../classes/[classId]/issued/batch/preview/route";
import { GET as csvTemplateRoute } from "../classes/[classId]/issued/batch/template.csv/route";
import { GET as xlsxTemplateRoute } from "../classes/[classId]/issued/batch/template.xlsx/route";
import { GET as reportRoute } from "./[batchId]/report/route";

const faculty: Actor = {
  id: "faculty-1",
  name: "Faculty",
  email: "f@example.edu",
  role: "FACULTY",
};
const admin: Actor = { id: "admin-1", name: "Admin", email: "a@example.edu", role: "ADMIN" };
const classContext = { params: Promise.resolve({ classId: "class-1" }) };
const preview = {
  id: "batch-1",
  classId: "class-1",
  badgeTemplateId: "badge-1",
  facultyUserId: "faculty-1",
  sourceFilename: "students.csv",
  mapping: { studentNumber: 0, email: 1 },
  previewFingerprint: "a".repeat(64),
  totalRows: 1,
  readyCount: 1,
  alreadyIssuedCount: 0,
  invalidCount: 0,
  issuedCount: 0,
  status: "READY",
  expiresAt: "2026-08-14T11:00:00.000Z",
  committedAt: null,
  createdAt: "2026-08-14T10:30:00.000Z",
  updatedAt: "2026-08-14T10:30:00.000Z",
  rows: [
    {
      rowNumber: 2,
      studentNumber: "2026-00001",
      emailSupplied: "learner@example.edu",
      disposition: "READY",
      message: "Ready",
      studentId: "student-1",
      issuanceId: null,
      publicId: null,
    },
  ],
} as const;

describe("batch issuance route boundaries", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    state.actor = faculty;
    state.authorizeSelection.mockResolvedValue(undefined);
    state.authorizeClass.mockResolvedValue(undefined);
    state.inspect.mockResolvedValue({
      headers: ["Student Number", "Email"],
      rows: [["2026-00001", "learner@example.edu"]],
    });
    state.preview.mockResolvedValue(preview);
    state.detail.mockResolvedValue(preview);
    state.consumeRateLimit.mockResolvedValue({
      allowed: true,
      limit: 20,
      remaining: 19,
      retryAfterSeconds: 0,
    });
  });

  it("inspects a validated Faculty upload and delegates class and badge IDs", async () => {
    const form = new FormData();
    const file = new File(
      ["Student Number,Email\n2026-00001,learner@example.edu"],
      "students.csv",
      { type: "text/csv" },
    );
    form.set("badgeTemplateId", "badge-1");
    form.set("file", file);
    const request = new Request("http://local/inspect", { method: "POST", body: form });
    request.headers.set("content-length", "1024");
    const response = await inspectRoute(request, classContext);
    expect(response.status).toBe(200);
    expect(state.inspect).toHaveBeenCalledTimes(1);
    expect(state.authorizeSelection).toHaveBeenCalledWith(faculty, "class-1", "badge-1");
    expect(state.preview).not.toHaveBeenCalled();
  });

  it("returns only the preview summary from validated JSON", async () => {
    const response = await previewRoute(
      new Request("http://local/preview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sourceFilename: "students.csv",
          badgeTemplateId: "badge-1",
          mapping: { studentNumber: 0, email: 1 },
          rows: [["2026-00001", "learner@example.edu"]],
        }),
      }),
      classContext,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(preview);
    expect(state.preview).toHaveBeenCalledWith(
      faculty,
      expect.objectContaining({ classId: "class-1", badgeTemplateId: "badge-1" }),
    );
  });

  it.each([
    ["unauthenticated", null],
    ["Administrator", admin],
  ])("denies %s mutation boundaries without calling services", async (_name, actor) => {
    state.actor = actor;
    const form = new FormData();
    form.set("badgeTemplateId", "badge-1");
    form.set("file", new File(["x"], "x.csv", { type: "text/csv" }));
    const response = await inspectRoute(
      new Request("http://local/inspect", { method: "POST", body: form }),
      classContext,
    );
    expect(response.status).toBe(403);
    expect(response.headers.get("content-disposition")).toBeNull();
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(state.inspect).not.toHaveBeenCalled();
  });

  it.each([
    ["inspection", inspectRoute],
    ["preview", previewRoute],
  ])("rejects cross-origin batch %s before authorization or body work", async (_name, route) => {
    const response = await route(
      new Request("http://localhost:3000/batch", {
        method: "POST",
        headers: { origin: "https://evil.example" },
        body: "must-not-be-read",
      }),
      classContext,
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "Invalid origin" });
    expect(state.authorizeClass).not.toHaveBeenCalled();
    expect(state.consumeRateLimit).not.toHaveBeenCalled();
  });

  it("rejects an oversized multipart request before parsing or file inspection", async () => {
    const response = await inspectRoute(
      new Request("http://local/inspect", {
        method: "POST",
        headers: { "content-length": String(3 * 1024 * 1024) },
        body: "oversized",
      }),
      classContext,
    );
    expect(response.status).toBe(413);
    expect(state.inspect).not.toHaveBeenCalled();
  });

  it.each([
    ["inspection", inspectRoute],
    ["preview", previewRoute],
  ])("rate-limits batch %s before buffering or domain work", async (_name, route) => {
    state.consumeRateLimit.mockResolvedValueOnce({
      allowed: false,
      limit: 20,
      remaining: 0,
      retryAfterSeconds: 12,
    });
    const response = await route(
      new Request("http://local/batch", { method: "POST", body: "must-not-be-read" }),
      classContext,
    );

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("12");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toEqual({ error: "Too many requests" });
    expect(state.inspect).not.toHaveBeenCalled();
    expect(state.preview).not.toHaveBeenCalled();
  });

  it("rejects malformed inspection path, badge, and missing file inputs without inspection", async () => {
    const cases = [
      { classId: "../class", badgeTemplateId: "badge-1", includeFile: true },
      { classId: "class-1", badgeTemplateId: "../badge", includeFile: true },
      { classId: "class-1", badgeTemplateId: "badge-1", includeFile: false },
    ];
    for (const item of cases) {
      const form = new FormData();
      form.set("badgeTemplateId", item.badgeTemplateId);
      if (item.includeFile) form.set("file", new File(["x"], "x.csv", { type: "text/csv" }));
      const request = new Request("http://local/inspect", { method: "POST", body: form });
      request.headers.set("content-length", "1024");
      const response = await inspectRoute(request, {
        params: Promise.resolve({ classId: item.classId }),
      });
      expect(response.status).toBe(400);
      expect(response.headers.get("content-disposition")).toBeNull();
    }
    expect(state.inspect).not.toHaveBeenCalled();
  });

  it("safely denies non-owner inspection before multipart buffering", async () => {
    state.authorizeClass.mockRejectedValueOnce(new Error("Batch not found"));
    const response = await inspectRoute(
      new Request("http://local/inspect", { method: "POST", body: "not-multipart" }),
      classContext,
    );
    expect(response.status).toBe(404);
    expect(state.inspect).not.toHaveBeenCalled();
  });

  it.each([
    ["unauthenticated", null],
    ["Administrator", admin],
  ])("denies a %s preview before domain delegation", async (_name, actor) => {
    state.actor = actor;
    const response = await previewRoute(
      new Request("http://local/preview", { method: "POST", body: "{}" }),
      classContext,
    );
    expect(response.status).toBe(403);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(state.preview).not.toHaveBeenCalled();
  });

  it("safely denies a non-owner preview before reading its JSON body", async () => {
    state.authorizeClass.mockRejectedValueOnce(new Error("Batch not found"));
    const response = await previewRoute(
      new Request("http://local/preview", { method: "POST", body: "not-json" }),
      classContext,
    );
    expect(response.status).toBe(404);
    expect(state.preview).not.toHaveBeenCalled();
  });

  it("rejects an oversized preview body before parsing", async () => {
    const response = await previewRoute(
      new Request("http://local/preview", {
        method: "POST",
        headers: { "content-length": String(2 * 1024 * 1024) },
        body: "{}",
      }),
      classContext,
    );
    expect(response.status).toBe(413);
    expect(state.preview).not.toHaveBeenCalled();
  });

  it("rejects malformed preview input before delegation", async () => {
    const response = await previewRoute(
      new Request("http://local/preview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      }),
      classContext,
    );
    expect(response.status).toBe(400);
    expect(state.preview).not.toHaveBeenCalled();
  });

  it.each([
    ["path class ID", "../class", "badge-1"],
    ["body badge ID", "class-1", "../badge"],
  ])("rejects a malformed preview %s before preview creation", async (_name, classId, badgeId) => {
    const response = await previewRoute(
      new Request("http://local/preview", {
        method: "POST",
        body: JSON.stringify({
          sourceFilename: "students.csv",
          badgeTemplateId: badgeId,
          mapping: { studentNumber: 0 },
          rows: [["2026-00001"]],
        }),
      }),
      { params: Promise.resolve({ classId }) },
    );
    expect(response.status).toBe(400);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(state.preview).not.toHaveBeenCalled();
  });

  it.each([
    ["CSV", csvTemplateRoute, "text/csv; charset=utf-8", "batch-issuance-template.csv"],
    [
      "XLSX",
      xlsxTemplateRoute,
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "batch-issuance-template.xlsx",
    ],
  ])(
    "downloads an authorized %s template with exact private headers",
    async (_name, route, mime, filename) => {
      const response = await route(new Request("http://local/template"), classContext);
      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe("private, no-store");
      expect(response.headers.get("content-type")).toBe(mime);
      expect(response.headers.get("content-disposition")).toBe(
        `attachment; filename="${filename}"`,
      );
      expect(state.authorizeClass).toHaveBeenCalledWith(faculty, "class-1");
    },
  );

  it.each([csvTemplateRoute, xlsxTemplateRoute])(
    "denies template downloads for an archived class without attachment headers",
    async (route) => {
      state.authorizeClass.mockRejectedValueOnce(new Error("Batch not found"));
      const response = await route(new Request("http://local/template"), classContext);
      expect(response.status).toBe(404);
      expect(response.headers.get("content-disposition")).toBeNull();
      expect(response.headers.get("cache-control")).toBe("private, no-store");
    },
  );

  it.each([csvTemplateRoute, xlsxTemplateRoute])(
    "denies unauthenticated template requests before authorization",
    async (route) => {
      state.actor = null;
      const response = await route(new Request("http://local/template"), classContext);
      expect(response.status).toBe(403);
      expect(response.headers.get("content-disposition")).toBeNull();
      expect(response.headers.get("cache-control")).toBe("private, no-store");
      expect(state.authorizeClass).not.toHaveBeenCalled();
    },
  );

  it.each([csvTemplateRoute, xlsxTemplateRoute])(
    "safely denies non-owner Faculty template requests",
    async (route) => {
      state.authorizeClass.mockRejectedValueOnce(new Error("Batch not found"));
      const response = await route(new Request("http://local/template"), classContext);
      expect(response.status).toBe(404);
      expect(response.headers.get("content-disposition")).toBeNull();
      expect(response.headers.get("cache-control")).toBe("private, no-store");
    },
  );

  it.each([csvTemplateRoute, xlsxTemplateRoute])(
    "rejects malformed template class IDs without authorization",
    async (route) => {
      const response = await route(new Request("http://local/template"), {
        params: Promise.resolve({ classId: "../class" }),
      });
      expect(response.status).toBe(400);
      expect(response.headers.get("content-disposition")).toBeNull();
      expect(state.authorizeClass).not.toHaveBeenCalled();
    },
  );

  it.each([csvTemplateRoute, xlsxTemplateRoute])(
    "denies Administrator template mutation endpoints",
    async (route) => {
      state.actor = admin;
      const response = await route(new Request("http://local/template"), classContext);
      expect(response.status).toBe(403);
      expect(state.authorizeClass).not.toHaveBeenCalled();
    },
  );

  it("allows an Administrator to download an authorized batch report", async () => {
    state.actor = admin;
    const response = await reportRoute(new Request("http://local/report"), {
      params: Promise.resolve({ batchId: "batch-1" }),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("content-disposition")).toBe(
      'attachment; filename="batch-batch-1-report.csv"',
    );
    expect((await response.arrayBuffer()).byteLength).toBeGreaterThan(3);
  });

  it("returns a safe report denial without attachment headers", async () => {
    state.actor = null;
    const response = await reportRoute(new Request("http://local/report"), {
      params: Promise.resolve({ batchId: "batch-1" }),
    });
    expect(response.status).toBe(403);
    expect(response.headers.get("content-disposition")).toBeNull();
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toEqual({ error: "Forbidden" });
  });

  it("returns safe not-found for malformed or inaccessible report IDs", async () => {
    for (const batchId of ["../../secret", "batch-1"]) {
      state.detail.mockRejectedValueOnce(new Error("Batch not found"));
      const response = await reportRoute(new Request("http://local/report"), {
        params: Promise.resolve({ batchId }),
      });
      expect(response.status).toBe(404);
      expect(response.headers.get("content-disposition")).toBeNull();
      expect(await response.json()).toEqual({ error: "Not found" });
    }
  });

  it("rate-limits batch report generation before loading report data", async () => {
    state.consumeRateLimit.mockResolvedValueOnce({
      allowed: false,
      limit: 30,
      remaining: 0,
      retryAfterSeconds: 7,
    });
    const response = await reportRoute(new Request("http://local/report"), {
      params: Promise.resolve({ batchId: "batch-1" }),
    });

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("7");
    expect(response.headers.get("content-disposition")).toBeNull();
    expect(state.detail).not.toHaveBeenCalled();
  });
});
