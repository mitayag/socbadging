import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { BatchHistory } from "./batch-history";

describe("BatchHistory", () => {
  it("renders authorized history with result and report links but no mutation controls", () => {
    render(
      <BatchHistory
        items={[
          {
            id: "batch-1",
            classId: "class-1",
            badgeTemplateId: "badge-1",
            facultyUserId: "faculty-1",
            sourceFilename: "students.csv",
            previewFingerprint: "a".repeat(64),
            totalRows: 4,
            readyCount: 2,
            alreadyIssuedCount: 1,
            invalidCount: 1,
            issuedCount: 2,
            status: "COMMITTED",
            expiresAt: "2026-08-14T12:00:00.000Z",
            committedAt: "2026-08-14T11:45:00.000Z",
            createdAt: "2026-08-14T11:30:00.000Z",
            updatedAt: "2026-08-14T11:45:00.000Z",
          },
        ]}
      />,
    );
    expect(screen.getByText("students.csv")).toBeInTheDocument();
    expect(screen.getByText("2 Issued")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View Batch Result" })).toHaveAttribute(
      "href",
      "/issuance-batches/batch-1",
    );
    expect(screen.getByRole("link", { name: "Download Batch Report" })).toHaveAttribute(
      "href",
      "/api/issuance-batches/batch-1/report",
    );
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
