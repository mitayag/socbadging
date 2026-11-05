import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AuditLogList } from "./audit-log-list";

const props = {
  items: [
    {
      id: "audit-1",
      action: "badge.revoked" as const,
      entityType: "BadgeIssuance",
      entityId: "internal-issuance-id",
      actorName: "Professor Reyes",
      createdAt: "2026-08-15T08:00:00.000Z",
    },
  ],
  filters: { page: 1, pageSize: 5 as const },
  facets: { entityTypes: ["BadgeIssuance"], actions: ["badge.revoked" as const] },
  page: 1,
  pageSize: 5,
  total: 1,
  totalPages: 1,
  hasNext: false,
  hasPrevious: false,
};

describe("AuditLogList", () => {
  it("renders the audit table without private audit context or mutation actions", () => {
    render(<AuditLogList {...props} />);

    const table = screen.getByRole("table");
    expect(table).toBeInTheDocument();
    expect(within(table).getByRole("columnheader", { name: "Event" })).toBeInTheDocument();
    expect(within(table).getByRole("columnheader", { name: "Actor" })).toBeInTheDocument();
    expect(within(table).getByRole("columnheader", { name: "Record Type" })).toBeInTheDocument();
    expect(within(table).getByRole("columnheader", { name: "Recorded" })).toBeInTheDocument();
    expect(within(table).getByText("Badge Revoked")).toBeInTheDocument();
    expect(within(table).getByText("Professor Reyes")).toBeInTheDocument();
    expect(within(table).getByText("BadgeIssuance")).toBeInTheDocument();
    expect(screen.getAllByText(/Page 1 of 1/)).toHaveLength(2);
    expect(screen.getByText(/1 audit record/)).toBeInTheDocument();
    expect(screen.queryByText("internal-issuance-id")).not.toBeInTheDocument();
    expect(screen.queryByText(/student@example.test/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /edit|delete/i })).not.toBeInTheDocument();
  });

  it("renders search and filter controls with facet options", () => {
    render(<AuditLogList {...props} />);

    expect(screen.getByLabelText("Search audit logs")).toBeInTheDocument();
    expect(screen.getByLabelText("Record type")).toBeInTheDocument();
    expect(screen.getByLabelText("Event type")).toBeInTheDocument();
    expect(screen.getByLabelText("From date")).toBeInTheDocument();
    expect(screen.getByLabelText("To date")).toBeInTheDocument();
    expect(screen.getByLabelText("Rows per page")).toHaveValue("5");
    expect(screen.getByRole("option", { name: "Badge Revoked" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "BadgeIssuance" })).toBeInTheDocument();
  });

  it("renders an informative empty state and pagination metadata", () => {
    render(<AuditLogList {...props} items={[]} total={0} totalPages={1} />);

    expect(screen.getByText(/No audit records match these filters/i)).toBeInTheDocument();
    expect(screen.getByText(/0 audit records/)).toBeInTheDocument();
  });
});
