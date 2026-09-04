import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AuditLogList } from "./audit-log-list";

describe("AuditLogList", () => {
  it("renders safe event metadata without rendering private audit context", () => {
    render(
      <AuditLogList
        items={[
          {
            id: "audit-1",
            action: "badge.revoked",
            entityType: "BadgeIssuance",
            entityId: "internal-issuance-id",
            actorName: "Professor Reyes",
            createdAt: "2026-08-15T08:00:00.000Z",
          },
        ]}
      />,
    );

    expect(screen.getByText("Badge Revoked")).toBeInTheDocument();
    expect(screen.getByText("Professor Reyes")).toBeInTheDocument();
    expect(screen.queryByText("internal-issuance-id")).not.toBeInTheDocument();
    expect(screen.queryByText(/student@example.test/i)).not.toBeInTheDocument();
  });
});
