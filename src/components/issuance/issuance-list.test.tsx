import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { IssuanceList } from "./issuance-list";

const items = [
  {
    id: "issuance-1",
    publicId: "abc123_public",
    status: "ACTIVE" as const,
    issuedAt: "2026-08-12T09:30:00.000Z",
    expiresAt: null,
    classId: "class-1",
    classCourseCode: "CS 101",
    classTitle: "Foundations of Computing",
    classSection: "A",
    badgeTemplateId: "badge-1",
    badgeName: "Secure Systems",
    badgeImageUrl: "http://localhost:3000/api/media/badges/secure.png",
    studentId: "student-1",
    studentNumber: "2026-0001",
    recipientDisplayName: "Ada Lovelace",
    issuerUserId: "faculty-1",
    issuerUserName: "Prof. Reyes",
  },
];

describe("IssuanceList", () => {
  afterEach(cleanup);

  it("renders authorized snapshot-derived issuance data, filter controls, and protected links", () => {
    render(
      <IssuanceList
        exportHref="/api/issued/export?status=ACTIVE"
        filters={{ query: "Ada", status: "ACTIVE" }}
        items={items}
        page={1}
        totalPages={2}
      />,
    );

    expect(screen.getByText("ACTIVE")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Search Issued Credentials" })).toHaveValue("Ada");
    expect(screen.getByRole("combobox", { name: "Issuance Status" })).toHaveValue("ACTIVE");
    expect(screen.getByRole("textbox", { name: "Class ID" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Badge Template ID" })).toBeInTheDocument();
    expect(screen.getByText("abc123_public")).toBeInTheDocument();
    expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
    expect(screen.getByText("Secure Systems")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "View Secure Systems for Ada Lovelace" }),
    ).toHaveAttribute("href", "/issued/issuance-1");
    expect(screen.getByRole("link", { name: "Export CSV" })).toHaveAttribute(
      "href",
      "/api/issued/export?status=ACTIVE",
    );
    expect(screen.getByRole("link", { name: "Next Page" })).toHaveAttribute(
      "href",
      expect.stringContaining("page=2"),
    );
  });

  it("explains the empty issuance state without rendering pagination", () => {
    render(
      <IssuanceList
        exportHref="/api/issued/export"
        filters={{}}
        items={[]}
        page={1}
        totalPages={0}
      />,
    );

    expect(screen.getByText("No issued credentials match these filters.")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Next Page" })).not.toBeInTheDocument();
  });
});
