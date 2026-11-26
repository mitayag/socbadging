import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createTransport: vi.fn(),
  sendMail: vi.fn(),
}));

vi.mock("nodemailer", () => ({
  default: { createTransport: mocks.createTransport },
}));

import { createSmtpTransport } from "./smtp-client";

const baseConfig = {
  host: "smtp.example.test",
  port: 587,
  secure: false,
  requireTLS: true,
  tls: { rejectUnauthorized: true },
  from: "HAU SOC <badges@example.test>",
};

describe("SMTP transport timeouts", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.createTransport.mockReturnValue({ sendMail: mocks.sendMail });
  });

  it("sets finite connection, greeting, and socket timeouts", () => {
    createSmtpTransport(baseConfig);
    expect(mocks.createTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
        socketTimeout: 30_000,
      }),
    );
  });

  it("allows explicit bounded timeout overrides", () => {
    createSmtpTransport({
      ...baseConfig,
      connectionTimeoutMs: 2_000,
      greetingTimeoutMs: 3_000,
      socketTimeoutMs: 4_000,
    });
    expect(mocks.createTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        host: baseConfig.host,
        port: baseConfig.port,
        secure: baseConfig.secure,
        connectionTimeout: 2_000,
        greetingTimeout: 3_000,
        socketTimeout: 4_000,
      }),
    );
  });

  it("forwards the rendered message and returns the provider message ID", async () => {
    mocks.sendMail.mockResolvedValue({ messageId: "provider-123" });
    const smtp = createSmtpTransport(baseConfig);
    const attachments = [
      {
        filename: "badge-artwork.jpg",
        content: Buffer.from("jpeg-data"),
        contentType: "image/jpeg" as const,
        cid: "badge-artwork@socbadging.hausoc.org",
        contentDisposition: "inline" as const,
      },
    ];
    const result = await smtp.send({
      to: "student@example.test",
      email: { subject: "Subject", text: "Text", html: "<p>Text</p>", attachments },
    });
    expect(mocks.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        from: baseConfig.from,
        to: "student@example.test",
        subject: "Subject",
        text: "Text",
        html: "<p>Text</p>",
        attachments,
      }),
    );
    expect(result).toEqual({ messageId: "provider-123" });
  });
});
