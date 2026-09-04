import { describe, expect, it } from "vitest";

import { serializeStructuredLog } from "./structured-log";

describe("serializeStructuredLog", () => {
  it("does not allow caller fields to overwrite the trusted log envelope", () => {
    const parsed = JSON.parse(
      serializeStructuredLog("notification.worker.cycle", {
        event: "forged.event",
        timestamp: "forged-time",
      }),
    );

    expect(parsed.event).toBe("notification.worker.cycle");
    expect(parsed.timestamp).not.toBe("forged-time");
  });

  it("retains operational identifiers and categories", () => {
    expect(
      JSON.parse(
        serializeStructuredLog("notification.delivery", {
          eventId: "delivery-123",
          status: "FAILED",
          errorCategory: "TRANSIENT",
          attemptCount: 2,
        }),
      ),
    ).toMatchObject({
      event: "notification.delivery",
      eventId: "delivery-123",
      status: "FAILED",
      errorCategory: "TRANSIENT",
      attemptCount: 2,
    });
  });

  it("redacts private and credential fields recursively", () => {
    const serialized = serializeStructuredLog("notification.delivery", {
      email: "student@example.edu",
      smtpPassword: "smtp-secret",
      messageContent: "private email body",
      sessionToken: "session-secret",
      credentialJson: { recipient: { email: "private@example.edu" } },
      recipientSnapshotJson: { studentNumber: "2026-00001" },
      nested: { authorization: "Bearer secret-token", passwordHash: "hash-secret" },
    });
    const parsed = JSON.parse(serialized);

    expect(parsed).toMatchObject({
      email: "[REDACTED]",
      smtpPassword: "[REDACTED]",
      messageContent: "[REDACTED]",
      sessionToken: "[REDACTED]",
      credentialJson: "[REDACTED]",
      recipientSnapshotJson: "[REDACTED]",
      nested: { authorization: "[REDACTED]", passwordHash: "[REDACTED]" },
    });
    expect(serialized).not.toContain("student@example.edu");
    expect(serialized).not.toContain("smtp-secret");
    expect(serialized).not.toContain("private email body");
    expect(serialized).not.toContain("session-secret");
    expect(serialized).not.toContain("2026-00001");
  });

  it("redacts email addresses even when stored under an unrecognized key", () => {
    const serialized = serializeStructuredLog("worker.error", {
      detail: "Delivery to student@example.edu failed",
    });

    expect(serialized).not.toContain("student@example.edu");
    expect(JSON.parse(serialized).detail).toBe("Delivery to [REDACTED] failed");
  });
});
