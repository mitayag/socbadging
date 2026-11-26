import { describe, expect, it } from "vitest";

import { renderIssuedEmail } from "./issued-email";
import { renderRevokedEmail } from "./revoked-email";

const notification = {
  recipientFirstName: "Ada <Admin>",
  recipientDisplayName: "Ada <Admin> Lovelace",
  achievementDescription: "Recognizes secure systems achievement.",
  badgeName: "Secure & Safe",
  issuerName: "HAU SOC",
  verificationUrl: "https://badges.example.edu/credentials/public-token",
  occurredAt: new Date("2026-08-23T00:00:00Z"),
};

describe("notification email templates", () => {
  it("renders escaped issued HTML and a matching public URL in text", () => {
    const email = renderIssuedEmail(notification);
    expect(email.subject).toBe(
      "Congratulations! You Have Earned a Digital Badge — HAU School of Computing",
    );
    expect(email.html).toContain("Ada &lt;Admin&gt;");
    expect(email.html).not.toContain("Ada <Admin>");
    expect(email.html).toContain("Secure &amp; Safe");
    expect(email.html).toContain("Recognizes secure systems achievement.");
    expect(email.html).toContain("Holy Angel University");
    expect(email.html).toContain("School of Computing");
    expect(email.html).toContain("https://badges.example.edu/student");
    expect(email.html).toContain("linkedin.com/profile/add");
    expect(email.text).toContain(notification.verificationUrl);
    expect(email.text).toContain("Student Badge Portal");
    expect(email.text).toContain("Add to LinkedIn profile");
    expect(email.html).toContain(notification.verificationUrl);
  });

  it("renders badge artwork, expiration, and support contact when supplied", () => {
    const email = renderIssuedEmail({
      ...notification,
      badgeImageUrl: "https://badges.example.edu/api/media/badges/test.png",
      expiresAt: new Date("2026-09-01T00:00:00Z"),
      supportContact: "support@example.edu",
    });
    expect(email.html).toContain("https://badges.example.edu/api/media/badges/test.png");
    expect(email.html).toContain("expires on");
    expect(email.html).toContain("support@example.edu");
    expect(email.text).toContain("Expires:");
    expect(email.text).toContain("Support:");
  });

  it("renders the production artwork URL as an absolute HTTPS image source", () => {
    const badgeImageUrl =
      "https://socbadging.hausoc.org/api/media/badges/3e901ed4-e59d-4a18-93eb-70cd188cc2d2.jpg";
    const email = renderIssuedEmail({
      ...notification,
      badgeName: "Test 1",
      badgeImageUrl,
    });
    expect(email.html).toContain(
      `<img src="${badgeImageUrl}" alt="Test 1 badge artwork" width="160" height="160"`,
    );
    expect(email.html).toContain(`href="${badgeImageUrl}"`);
    expect(email.text).toContain(`Badge image: ${badgeImageUrl}`);
  });

  it("uses a CID image while retaining absolute HTML and plain-text fallbacks", () => {
    const badgeImageUrl = "https://badges.example.edu/api/media/badges/test.jpg";
    const email = renderIssuedEmail(
      { ...notification, badgeImageUrl },
      "badge-artwork@socbadging.hausoc.org",
    );
    expect(email.html).toContain('src="cid:badge-artwork@socbadging.hausoc.org"');
    expect(email.html).not.toContain(`src="${badgeImageUrl}"`);
    expect(email.html).toContain(`href="${badgeImageUrl}"`);
    expect(email.text).toContain(`Badge image: ${badgeImageUrl}`);
  });

  it("omits an unsafe badge image URL", () => {
    const email = renderIssuedEmail(
      { ...notification, badgeImageUrl: "javascript:alert(1)" },
      "badge-artwork@socbadging.hausoc.org",
    );
    expect(email.html).not.toContain("javascript:alert");
    expect(email.html).not.toContain("cid:badge-artwork");
    expect(email.text).not.toContain("javascript:alert");
  });

  it("renders revocation without a private reason", () => {
    const email = renderRevokedEmail({ ...notification, supportContact: "support@example.edu" });
    expect(email.subject.toLowerCase()).toContain("revoked");
    expect(email.text).toContain("support@example.edu");
    expect(email.text).not.toContain("reason");
  });
});
