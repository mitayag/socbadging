import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CredentialDetail } from "./credential-detail";

describe("CredentialDetail", () => {
  it("renders immutable snapshot values with neutral verification guidance", () => {
    render(
      <CredentialDetail
        notificationStatus="SENT"
        detail={{
          id: "issuance-1",
          publicId: "public-id-1",
          status: "ACTIVE",
          issuedAt: "2026-08-12T09:30:00.000Z",
          expiresAt: null,
          classId: "class-1",
          badgeTemplateId: "badge-1",
          studentId: "student-1",
          issuerUserId: "faculty-1",
          supersedes: null,
          supersededBy: { id: "issuance-2", publicId: "public-id-2" },
          recipient: {
            studentId: "student-1",
            studentNumber: "2026-0001",
            displayName: "Snapshot Recipient",
            firstName: "Snapshot",
            lastName: "Recipient",
            email: "snapshot@example.edu",
          },
          achievement: {
            badgeTemplateId: "badge-1",
            id: "http://localhost:3000/achievements/badge-1",
            type: ["Achievement"],
            name: "Snapshot Badge",
            description: "Snapshot description that does not depend on a live template.",
            criteria: { narrative: "Snapshot criteria" },
            imagePath: "badges/snapshot.png",
            image: { id: "http://localhost:3000/api/media/badges/snapshot.png", type: "Image" },
            skills: ["Snapshots"],
            templateUpdatedAt: "2026-08-12T09:00:00.000Z",
            class: {
              id: "class-1",
              courseCode: "CS 101",
              title: "Snapshot Class",
              section: "A",
              term: "First Semester",
              academicYear: "2026-2027",
            },
            expiresAfterDays: null,
          },
          issuer: {
            name: "Snapshot University",
            url: "http://localhost:3000",
            logoUrl: "http://localhost:3000/images/hausoclogo.png",
            issuerUserId: "faculty-1",
            issuerUserName: "Snapshot Faculty",
          },
          credential: {
            "@context": [
              "https://www.w3.org/ns/credentials/v2",
              "https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json",
            ],
            id: "http://localhost:3000/credentials/public-id-1",
            type: ["VerifiableCredential", "OpenBadgeCredential"],
            name: "Snapshot Badge",
            issuer: {
              id: "http://localhost:3000",
              type: ["Profile"],
              name: "Snapshot University",
              image: { id: "http://localhost:3000/images/hausoclogo.png", type: "Image" },
            },
            validFrom: "2026-08-12T09:30:00.000Z",
            credentialSubject: {
              type: ["AchievementSubject"],
              identifier: [
                {
                  type: "IdentityObject",
                  identityHash: "a".repeat(64),
                  identityType: "email",
                  hashed: true,
                },
              ],
              achievement: {
                id: "http://localhost:3000/achievements/badge-1",
                type: ["Achievement"],
                name: "Snapshot Badge",
                description: "Snapshot description that does not depend on a live template.",
                criteria: { narrative: "Snapshot criteria" },
                image: {
                  id: "http://localhost:3000/api/media/badges/snapshot.png",
                  type: "Image",
                },
              },
            },
          },
        }}
      />,
    );

    expect(screen.getByRole("heading", { name: "Snapshot Badge" })).toBeInTheDocument();
    expect(screen.getByText("Email Sent")).toBeInTheDocument();
    expect(screen.queryByText(/provider/i)).not.toBeInTheDocument();
    expect(screen.getByText("Snapshot Recipient")).toBeInTheDocument();
    expect(screen.getByText("Snapshot criteria")).toBeInTheDocument();
    expect(
      screen.getByText(
        /preserved as an immutable issuance record.*public verification link.*current status/i,
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/unsigned/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/not certified/i)).not.toBeInTheDocument();
    expect(screen.getByText(/legacy credential has been superseded/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "replacement credential" })).toHaveAttribute(
      "href",
      "/issued/issuance-2",
    );
    expect(screen.getByRole("link", { name: "Download Credential JSON" })).toHaveAttribute(
      "href",
      "/api/issued/issuance-1/credential",
    );
  });
});
