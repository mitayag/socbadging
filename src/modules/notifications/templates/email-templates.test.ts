import { describe, expect, it } from "vitest";

import { renderIssuedEmail } from "./issued-email";
import { renderRevokedEmail } from "./revoked-email";

const notification = {
  recipientFirstName: "Ada <Admin>",
  badgeName: "Secure & Safe",
  issuerName: "HAU SOC",
  verificationUrl: "https://badges.example.edu/credentials/public-token",
  occurredAt: new Date("2026-08-23T00:00:00Z"),
};

describe("notification email templates", () => {
  it("renders escaped issued HTML and a matching public URL in text", () => {
    const email = renderIssuedEmail(notification);
    expect(email.subject).toContain("Secure & Safe");
    expect(email.html).toContain("Ada &lt;Admin&gt;");
    expect(email.html).not.toContain("Ada <Admin>");
    expect(email.text).toContain(notification.verificationUrl);
    expect(email.html).toContain(notification.verificationUrl);
  });

  it("renders revocation without a private reason", () => {
    const email = renderRevokedEmail({ ...notification, supportContact: "support@example.edu" });
    expect(email.subject.toLowerCase()).toContain("revoked");
    expect(email.text).toContain("support@example.edu");
    expect(email.text).not.toContain("reason");
  });
});
