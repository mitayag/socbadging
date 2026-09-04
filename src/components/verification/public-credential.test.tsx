import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import type { PublicCredential } from "@/modules/verification/types";
import { PublicCredentialCard } from "./public-credential";

afterEach(cleanup);

const credential: PublicCredential = {
  publicId: "abcdefghijklmnopqrstuvwxyzABCDEF",
  status: "ACTIVE",
  issuedAt: "2026-08-15T09:30:00.000Z",
  expiresAt: "2026-09-15T09:30:00.000Z",
  revokedAt: null,
  revocationReason: null,
  recipientDisplayName: "Maria S.",
  achievement: {
    id: "https://hau.edu.ph/achievements/deans-list",
    type: ["Achievement"],
    name: "Dean's List",
    description: "Recognizes sustained academic excellence.",
    criteria: { narrative: "Earn a weighted average of 90 or higher." },
    image: { id: "https://hau.edu.ph/badges/deans-list.png", type: "Image" },
    skills: ["Academic Excellence", "Research"],
    alignment: [
      {
        type: ["Alignment"],
        targetName: "HAU Academic Standards",
        targetUrl: "https://hau.edu.ph/standards",
      },
    ],
    class: {
      courseCode: "CS 101",
      title: "Introduction to Computing",
      section: "A",
      term: "First Semester",
      academicYear: "2026–2027",
    },
  },
  issuer: {
    name: "Holy Angel University — School of Computing",
    url: "https://hau.edu.ph",
    logoUrl: "https://hau.edu.ph/images/logo.png",
  },
  credential: {
    "@context": [
      "https://www.w3.org/ns/credentials/v2",
      "https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json",
    ],
    id: "https://hau.edu.ph/credentials/abcdefghijklmnopqrstuvwxyzABCDEF",
    type: ["VerifiableCredential", "OpenBadgeCredential"],
    name: "Dean's List",
    issuer: {
      id: "https://hau.edu.ph",
      type: ["Profile"],
      name: "Holy Angel University — School of Computing",
      image: { id: "https://hau.edu.ph/images/logo.png", type: "Image" },
    },
    validFrom: "2026-08-15T09:30:00.000Z",
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
        id: "https://hau.edu.ph/achievements/deans-list",
        type: ["Achievement"],
        name: "Dean's List",
        description: "Recognizes sustained academic excellence.",
        criteria: { narrative: "Earn a weighted average of 90 or higher." },
        image: { id: "https://hau.edu.ph/badges/deans-list.png", type: "Image" },
      },
    },
  },
  supportContact: "support@hau.edu.ph",
  sharingEnabled: true,
};

describe("PublicCredentialCard", () => {
  it("renders the active privacy-safe public verification record and JSON-LD links", () => {
    render(<PublicCredentialCard credential={credential} />);

    expect(screen.getByText("Active credential")).toBeInTheDocument();
    expect(screen.getByText("Maria S.")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Dean's List badge artwork" })).toHaveAttribute(
      "src",
      "https://hau.edu.ph/badges/deans-list.png",
    );
    expect(screen.getByText("Earn a weighted average of 90 or higher.")).toBeInTheDocument();
    expect(screen.getByText("Academic Excellence")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "HAU Academic Standards" })).toHaveAttribute(
      "href",
      "https://hau.edu.ph/standards",
    );
    expect(screen.getByText("support@hau.edu.ph")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View JSON-LD" })).toHaveAttribute(
      "href",
      "/api/credentials/abcdefghijklmnopqrstuvwxyzABCDEF",
    );
    expect(screen.getByRole("link", { name: "Download JSON-LD" })).toHaveAttribute(
      "href",
      "/api/credentials/abcdefghijklmnopqrstuvwxyzABCDEF/download",
    );
    expect(
      screen.getByText(
        /issued through the HAU SOC Badging System.*issuer, recipient, issue date, and current status/i,
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/unsigned/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/not certified/i)).not.toBeInTheDocument();
    expect(document.body.textContent).not.toContain("maria@example.edu");
    expect(document.body.textContent).not.toContain("2026-00001");
    expect(document.body.textContent).not.toContain("issuance-id");
  });

  it.each(["EXPIRED", "REVOKED"] as const)("renders an unmistakable %s status", (status) => {
    render(
      <PublicCredentialCard
        credential={{
          ...credential,
          status,
          revokedAt: status === "REVOKED" ? "2026-08-20T10:00:00.000Z" : null,
          revocationReason: status === "REVOKED" ? "Academic review" : null,
        }}
      />,
    );

    expect(
      screen.getByText(new RegExp(`${status.toLowerCase()} credential`, "i")),
    ).toBeInTheDocument();
    if (status === "REVOKED") {
      expect(screen.getByText(/reason: academic review/i)).toBeInTheDocument();
    }
  });

  it("keeps JSON-LD export available when public sharing is disabled", () => {
    render(<PublicCredentialCard credential={{ ...credential, sharingEnabled: false }} />);

    expect(screen.getByText(/sharing is disabled/i)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /copy verification link/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View JSON-LD" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Download JSON-LD" })).toBeInTheDocument();
  });

  it("renders only the server-computed unavailable result for a legacy record", () => {
    render(
      <PublicCredentialCard
        credential={
          {
            ...credential,
            cryptographicVerification: {
              outcome: "VERIFICATION_UNAVAILABLE",
              checkedAt: "2026-08-26T00:00:00.000Z",
            },
            isLegacy: true,
          } as unknown as PublicCredential
        }
      />,
    );

    expect(screen.getByRole("status", { name: /cryptographic verification/i })).toHaveTextContent(
      /unavailable/i,
    );
    expect(screen.queryByText(/cryptographically verified/i)).not.toBeInTheDocument();
  });
});
