import { emailShell, escapeHtml, formatDate, safePublicUrl } from "./template-utils";
import type { RenderedEmail } from "./template-utils";

export type StudentAccountEmailKind = "ACTIVATION" | "RECOVERY";

export function renderStudentAccountEmail(input: {
  kind: StudentAccountEmailKind;
  firstName: string;
  link: string;
  expiresAt: Date;
  supportContact?: string;
}): RenderedEmail {
  const activation = input.kind === "ACTIVATION";
  const subject = activation
    ? "Activate your HAU SOC student badge account"
    : "Reset your HAU SOC student badge password";
  const heading = activation ? "Activate your student account" : "Reset your password";
  const action = activation ? "Activate account" : "Choose a new password";
  const support = input.supportContact ? `\n\nSupport: ${input.supportContact}` : "";
  const supportHtml = input.supportContact
    ? `<p>Need help? Contact <a href="${escapeHtml(
        input.supportContact.includes(":")
          ? input.supportContact
          : `mailto:${input.supportContact}`,
      )}">${escapeHtml(input.supportContact)}</a>.</p>`
    : "";
  const link = safePublicUrl(input.link);
  if (!link) throw new Error("Student account link must be an HTTP or HTTPS URL");
  return {
    subject,
    text: `Hello ${input.firstName},\n\n${heading} for the HAU SOC Badging System. This link expires on ${formatDate(input.expiresAt)} and can be used once.\n\n${action}: ${link}${support}\n\nIf you did not request this, you can ignore this email.`,
    html: emailShell(
      `<h1 style="font-size:24px">${escapeHtml(heading)}</h1><p>Hello ${escapeHtml(input.firstName)},</p><p>Use the secure link below for the HAU SOC Badging System. It expires on <strong>${escapeHtml(formatDate(input.expiresAt))}</strong> and can be used once.</p><p><a href="${escapeHtml(link)}">${escapeHtml(action)}</a></p>${supportHtml}<p>If you did not request this, you can ignore this email.</p>`,
    ),
  };
}
