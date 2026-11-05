import "server-only";

import { createHash } from "node:crypto";

import { getServerEnv, isRecipientAllowedByPolicy, loadEmailDeliveryConfig } from "@/config/env";
import { isRecipientSuppressed } from "@/modules/notifications/services/recipient-suppression-core";
import { createSmtpTransport } from "@/modules/notifications/services/smtp-client";
import {
  renderStudentAccountEmail,
  type StudentAccountEmailKind,
} from "@/modules/notifications/templates/student-account-email";
import { getPublicSystemSettings } from "@/modules/settings/services/system-settings-service";
import { prisma } from "@/platform/db/prisma";

export class StudentEmailUnavailableError extends Error {
  constructor() {
    super("Account email is temporarily unavailable. Try again later.");
    this.name = "StudentEmailUnavailableError";
  }
}

export async function sendStudentAccountEmail(input: {
  kind: StudentAccountEmailKind;
  studentId: string;
  to: string;
  firstName: string;
  token: string;
  expiresAt: Date;
}) {
  const config = loadEmailDeliveryConfig(process.env);
  if (config.mode === "brevo" && config.controlledAcceptanceOnly) {
    throw new StudentEmailUnavailableError();
  }
  if (!isRecipientAllowedByPolicy(config.policy, input.to, config.allowlist)) {
    throw new StudentEmailUnavailableError();
  }
  if (await isRecipientSuppressed(prisma, input.to)) throw new StudentEmailUnavailableError();

  // Only a genuine, just-issued system token for the matching student email may be sent.
  const student = await prisma.student.findUnique({
    where: { id: input.studentId },
    select: { id: true, email: true },
  });
  if (!student || student.email.trim().toLowerCase() !== input.to.trim().toLowerCase()) {
    throw new StudentEmailUnavailableError();
  }
  const tokenHash = createHash("sha256").update(input.token).digest("hex");
  const token = await prisma.studentToken.findFirst({
    where: {
      studentId: student.id,
      tokenHash,
      type: input.kind,
      usedAt: null,
      expiresAt: { gt: new Date() },
    },
    select: { id: true },
  });
  if (!token) throw new StudentEmailUnavailableError();
  let supportContact: string | null = null;
  try {
    supportContact = (await getPublicSystemSettings()).supportContact;
  } catch {
    supportContact = null;
  }
  const appUrl = getServerEnv().APP_URL.replace(/\/+$/, "");
  const path =
    input.kind === "ACTIVATION"
      ? `/student/activate/${encodeURIComponent(input.token)}`
      : `/student/recover/${encodeURIComponent(input.token)}`;
  const link = new URL(path, `${appUrl}/`).toString();
  const email = renderStudentAccountEmail({
    kind: input.kind,
    firstName: input.firstName,
    link,
    expiresAt: input.expiresAt,
    ...(supportContact ? { supportContact } : {}),
  });
  const smtp = createSmtpTransport(config.transport);
  try {
    await smtp.send({ to: input.to, email });
  } catch {
    throw new StudentEmailUnavailableError();
  }
}
