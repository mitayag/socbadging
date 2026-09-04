import { beforeEach, describe, expect, it, vi } from "vitest";

import { AuthorizationError } from "@/modules/identity/policies/authorization";
import type { Actor } from "@/modules/identity/types";

const mocks = vi.hoisted(() => ({
  auditFindMany: vi.fn(),
  userFindUnique: vi.fn(),
}));

vi.mock("@/platform/db/prisma", () => ({
  prisma: {
    auditLog: { findMany: mocks.auditFindMany },
    user: { findUnique: mocks.userFindUnique },
  },
}));

import { listAuditLogs, sensitiveAuditActions } from "./audit-log-service";

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

describe("listAuditLogs", () => {
  it("includes Administrator notification retry requests", () => {
    expect(sensitiveAuditActions).toContain("notification.retry_requested");
  });
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.userFindUnique.mockResolvedValue({
      id: administrator.id,
      role: "ADMIN",
      status: "ACTIVE",
      deletedAt: null,
    });
    mocks.auditFindMany.mockResolvedValue([
      {
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
      },
    ]);
  });

  it("returns a privacy-safe administrator view of sensitive lifecycle records", async () => {
    await expect(listAuditLogs(administrator)).resolves.toEqual([
      {
        id: "audit-1",
        action: "badge.revoked",
        entityType: "BadgeIssuance",
        entityId: "issuance-internal-id",
        actorName: "Professor Reyes",
        createdAt: "2026-08-15T08:00:00.000Z",
      },
    ]);
    expect(mocks.auditFindMany).toHaveBeenCalledWith({
      where: { action: { in: sensitiveAuditActions } },
      select: {
        id: true,
        action: true,
        entityType: true,
        entityId: true,
        createdAt: true,
        actor: { select: { name: true } },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 100,
    });
  });

  it("rejects Faculty before any audit query", async () => {
    await expect(listAuditLogs(faculty)).rejects.toBeInstanceOf(AuthorizationError);
    expect(mocks.userFindUnique).not.toHaveBeenCalled();
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
    expect(mocks.auditFindMany).not.toHaveBeenCalled();
  });
});
