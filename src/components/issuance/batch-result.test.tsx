import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { BatchResult } from "./batch-result";

const detail = {
  id: "batch-1",
  classId: "class-1",
  badgeTemplateId: "badge-1",
  facultyUserId: "faculty-1",
  sourceFilename: "students.csv",
  mapping: { studentNumber: 0, email: null },
  previewFingerprint: "a".repeat(64),
  totalRows: 2,
  readyCount: 1,
  alreadyIssuedCount: 1,
  invalidCount: 0,
  issuedCount: 1,
  status: "COMMITTED" as const,
  expiresAt: "2026-08-14T12:00:00.000Z",
  committedAt: "2026-08-14T11:45:00.000Z",
  createdAt: "2026-08-14T11:30:00.000Z",
  updatedAt: "2026-08-14T11:45:00.000Z",
  rows: [
    {
      rowNumber: 2,
      studentNumber: "2026-0001",
      emailSupplied: null,
      disposition: "READY" as const,
      message: "Issued",
      studentId: "student-1",
      issuanceId: "issuance-1",
      publicId: "public-1",
    },
    {
      rowNumber: 3,
      studentNumber: "2026-0002",
      emailSupplied: null,
      disposition: "ALREADY_ISSUED" as const,
      message: "Already issued",
      studentId: "student-2",
      issuanceId: "issuance-2",
      publicId: "public-2",
    },
  ],
};

describe("BatchResult", () => {
  it("renders committed counts, row dispositions, credential links, and result report", () => {
    render(<BatchResult detail={detail} repeatedCommit />);
    expect(
      screen.getByText("This batch was already committed. No duplicate credentials were created."),
    ).toBeInTheDocument();
    expect(screen.getByText("1 Issued")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Every newly issued credential in this batch was signed before the batch committed.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("1 Already Issued")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "View Credential" })).toHaveLength(2);
    expect(screen.getByRole("link", { name: "Download Result Report" })).toHaveAttribute(
      "href",
      "/api/issuance-batches/batch-1/report",
    );
    expect(screen.getAllByRole("columnheader").map((header) => header.textContent)).toEqual([
      "Row",
      "Student Number",
      "Disposition",
      "Message",
      "Credential",
    ]);
    expect(screen.getAllByRole("cell").length).toBeGreaterThan(0);
  });
});
