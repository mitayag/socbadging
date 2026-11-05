import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  loadEmailDeliveryConfig: vi.fn(),
  isRecipientAllowedByPolicy: vi.fn(),
  isSuppressed: vi.fn(),
  studentFindUnique: vi.fn(),
  tokenFindFirst: vi.fn(),
  send: vi.fn(),
}));

vi.mock("@/config/env", () => ({
  loadEmailDeliveryConfig: mocks.loadEmailDeliveryConfig,
  isRecipientAllowedByPolicy: mocks.isRecipientAllowedByPolicy,
  getServerEnv: () => ({ APP_URL: "http://localhost:3000" }),
}));
vi.mock("@/modules/notifications/services/recipient-suppression-core", () => ({
  isRecipientSuppressed: mocks.isSuppressed,
}));
vi.mock("@/platform/db/prisma", () => ({
  prisma: {
    student: { findUnique: mocks.studentFindUnique },
    studentToken: { findFirst: mocks.tokenFindFirst },
  },
}));
vi.mock("@/modules/notifications/services/smtp-client", () => ({
  createSmtpTransport: () => ({ send: mocks.send }),
}));
vi.mock("@/modules/settings/services/system-settings-service", () => ({
  getPublicSystemSettings: vi.fn().mockResolvedValue({ supportContact: null }),
}));

import { StudentEmailUnavailableError, sendStudentAccountEmail } from "./student-email-service";

const validInput = {
  kind: "ACTIVATION" as const,
  studentId: "student-1",
  to: "student@example.edu",
  firstName: "Test",
  token: "token-value",
  expiresAt: new Date(),
};

describe("student account email safety", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.loadEmailDeliveryConfig.mockReturnValue({
      mode: "mailpit",
      policy: "local",
      externalEnabled: false,
      controlledAcceptanceOnly: false,
      allowlist: [],
      transport: {},
    });
    mocks.isRecipientAllowedByPolicy.mockReturnValue(true);
    mocks.isSuppressed.mockResolvedValue(false);
    mocks.studentFindUnique.mockResolvedValue({ id: "student-1", email: "student@example.edu" });
    mocks.tokenFindFirst.mockResolvedValue({ id: "token-1" });
  });

  it("refuses direct activation/recovery email in controlled acceptance mode", async () => {
    mocks.loadEmailDeliveryConfig.mockReturnValue({
      mode: "brevo",
      policy: "staging",
      externalEnabled: true,
      controlledAcceptanceOnly: true,
      allowlist: ["authorized-test-recipient@example.org"],
      transport: {},
    });

    await expect(
      sendStudentAccountEmail({ ...validInput, to: "authorized-test-recipient@example.org" }),
    ).rejects.toBeInstanceOf(StudentEmailUnavailableError);
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("refuses to send account email to a suppressed recipient", async () => {
    mocks.isSuppressed.mockResolvedValue(true);

    await expect(sendStudentAccountEmail(validInput)).rejects.toBeInstanceOf(
      StudentEmailUnavailableError,
    );
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("refuses a recipient rejected by the active policy", async () => {
    mocks.loadEmailDeliveryConfig.mockReturnValue({
      mode: "brevo",
      policy: "staging",
      externalEnabled: true,
      controlledAcceptanceOnly: false,
      allowlist: ["authorized@example.edu"],
      transport: {},
    });
    mocks.isRecipientAllowedByPolicy.mockReturnValue(false);

    await expect(sendStudentAccountEmail(validInput)).rejects.toBeInstanceOf(
      StudentEmailUnavailableError,
    );
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("refuses recipient substitution against the student record", async () => {
    mocks.studentFindUnique.mockResolvedValue({
      id: "student-1",
      email: "original@example.edu",
    });

    await expect(sendStudentAccountEmail(validInput)).rejects.toBeInstanceOf(
      StudentEmailUnavailableError,
    );
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("refuses email unless the matching system token exists", async () => {
    mocks.tokenFindFirst.mockResolvedValue(null);

    await expect(sendStudentAccountEmail(validInput)).rejects.toBeInstanceOf(
      StudentEmailUnavailableError,
    );
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("allows a system-issued student email under the production policy", async () => {
    mocks.loadEmailDeliveryConfig.mockReturnValue({
      mode: "brevo",
      policy: "production",
      externalEnabled: true,
      controlledAcceptanceOnly: false,
      allowlist: [],
      transport: {},
    });

    await expect(sendStudentAccountEmail(validInput)).resolves.toBeUndefined();
    expect(mocks.send).toHaveBeenCalledTimes(1);
  });

  it("sends only after policy, suppression, student, and token checks pass", async () => {
    await expect(sendStudentAccountEmail(validInput)).resolves.toBeUndefined();
    expect(mocks.send).toHaveBeenCalledWith(expect.objectContaining({ to: "student@example.edu" }));
  });
});
