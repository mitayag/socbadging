import { beforeEach, describe, expect, it, vi } from "vitest";

import { AuthorizationError } from "@/modules/identity/policies/authorization";
import type { Actor } from "@/modules/identity/types";

const mocks = vi.hoisted(() => ({
  auditFindMany: vi.fn(),
  auditCount: vi.fn(),
  userFindUnique: vi.fn(),
}));

vi.mock("@/platform/db/prisma", () => ({
  prisma: {
    auditLog: { findMany: mocks.auditFindMany, count: mocks.auditCount },
    user: { findUnique: mocks.userFindUnique },
  },
}));

import {
  auditLogPageSizes,
  listAuditLogs,
  normalizeAuditLogFilters,
  sensitiveAuditActions,
} from "./audit-log-service";

const administrator: Actor = {
  id: "admin-1",
  name: "Administrator",
  email: "admin@example.test",
  role: "ADMIN",
};
const faculty: Actor = {
  id: "faculty-1",
  name: "Faculty",
  email: "faculty@example.test",
  role: "FACULTY",
};

const record = {
  id: "audit-1",
  action: "badge.revoked",
  entityType: "BadgeIssuance",
  entityId: "issuance-internal-id",
  createdAt: new Date("2026-08-15T08:00:00.000Z"),
  contextJson: {
    reason: "private reason must not be rendered",
    recipientEmail: "student@example.test",
  },
  ipAddress: "127.0.0.1",
  userAgent: "private-agent",
  actor: { name: "Professor Reyes", email: "reyes@example.test" },
};

describe("listAuditLogs", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.userFindUnique.mockResolvedValue({
      id: administrator.id,
      role: "ADMIN",
      status: "ACTIVE",
      deletedAt: null,
    });
    mocks.auditCount.mockResolvedValue(1);
    mocks.auditFindMany.mockImplementation(async (args) =>
      args?.distinct ? [{ entityType: "BadgeIssuance" }] : [record],
    );
  });

  it("includes Administrator notification retry requests", () => {
    expect(sensitiveAuditActions).toContain("notification.retry_requested");
    expect(auditLogPageSizes).toEqual([5, 10, 25, 50]);
  });

  it("returns a privacy-safe, paginated administrator view", async () => {
    const result = await listAuditLogs(administrator);

    expect(result.items).toEqual([
      {
        id: "audit-1",
        action: "badge.revoked",
        entityType: "BadgeIssuance",
        entityId: "issuance-internal-id",
        actorName: "Professor Reyes",
        createdAt: "2026-08-15T08:00:00.000Z",
      },
    ]);
    expect(result).toMatchObject({
      page: 1,
      pageSize: 5,
      total: 1,
      totalPages: 1,
      hasNext: false,
      hasPrevious: false,
      filters: { page: 1, pageSize: 5 },
      facets: { entityTypes: ["BadgeIssuance"], actions: [...sensitiveAuditActions] },
    });
    expect(mocks.auditCount).toHaveBeenCalledWith({
      where: { action: { in: [...sensitiveAuditActions] } },
    });
    expect(mocks.auditFindMany).toHaveBeenNthCalledWith(1, {
      where: { action: { in: [...sensitiveAuditActions] } },
      select: {
        id: true,
        action: true,
        entityType: true,
        entityId: true,
        createdAt: true,
        actor: { select: { name: true } },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: 0,
      take: 5,
    });
    expect(mocks.auditFindMany).toHaveBeenNthCalledWith(2, {
      where: { action: { in: [...sensitiveAuditActions] } },
      distinct: ["entityType"],
      select: { entityType: true },
      orderBy: { entityType: "asc" },
    });
  });

  it("combines search, record type, event type, date, and page filters", async () => {
    mocks.auditCount.mockResolvedValue(30);
    const result = await listAuditLogs(administrator, {
      query: "Badge Revoked",
      entityType: "BadgeIssuance",
      action: "badge.revoked",
      from: "2026-08-01",
      to: "2026-08-31",
      page: 2,
      pageSize: 10,
    });

    expect(result).toMatchObject({
      page: 2,
      pageSize: 10,
      total: 30,
      totalPages: 3,
      hasNext: true,
      hasPrevious: true,
      filters: {
        query: "Badge Revoked",
        entityType: "BadgeIssuance",
        action: "badge.revoked",
        from: "2026-08-01",
        to: "2026-08-31",
        page: 2,
        pageSize: 10,
      },
    });
    expect(mocks.auditCount).toHaveBeenCalledWith({
      where: {
        action: "badge.revoked",
        entityType: "BadgeIssuance",
        AND: [
          {
            OR: [
              { action: { contains: "Badge" } },
              { entityType: { contains: "Badge" } },
              { actor: { name: { contains: "Badge" } } },
            ],
          },
          {
            OR: [
              { action: { contains: "Revoked" } },
              { entityType: { contains: "Revoked" } },
              { actor: { name: { contains: "Revoked" } } },
            ],
          },
        ],
        createdAt: {
          gte: new Date("2026-08-01T00:00:00.000Z"),
          lte: new Date("2026-08-31T23:59:59.999Z"),
        },
      },
    });
    expect(mocks.auditFindMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ skip: 10, take: 10 }),
    );
  });

  it("clamps unsupported page sizes and out-of-range pages", async () => {
    mocks.auditCount.mockResolvedValue(3);
    const result = await listAuditLogs(administrator, { page: 9, pageSize: 7 });

    expect(result.pageSize).toBe(5);
    expect(result.page).toBe(1);
    expect(result.totalPages).toBe(1);
    expect(mocks.auditFindMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ skip: 0, take: 5 }),
    );
  });

  it("validates malformed query parameters without throwing", () => {
    expect(normalizeAuditLogFilters({ page: "not-a-page", pageSize: "7" })).toMatchObject({
      page: 1,
      pageSize: 5,
    });
    expect(normalizeAuditLogFilters({ from: "not-a-date" })).toMatchObject({
      from: undefined,
    });
  });

  it("rejects Faculty before any audit query", async () => {
    await expect(listAuditLogs(faculty)).rejects.toBeInstanceOf(AuthorizationError);
    expect(mocks.userFindUnique).not.toHaveBeenCalled();
    expect(mocks.auditCount).not.toHaveBeenCalled();
    expect(mocks.auditFindMany).not.toHaveBeenCalled();
  });

  it("rejects a suspended Administrator before reading audit records", async () => {
    mocks.userFindUnique.mockResolvedValueOnce({
      id: administrator.id,
      role: "ADMIN",
      status: "SUSPENDED",
      deletedAt: null,
    });

    await expect(listAuditLogs(administrator)).rejects.toBeInstanceOf(AuthorizationError);
    expect(mocks.auditCount).not.toHaveBeenCalled();
    expect(mocks.auditFindMany).not.toHaveBeenCalled();
  });
});
