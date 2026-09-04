import { emailShell, escapeHtml, formatDate } from "./template-utils";
import type { NotificationTemplateInput, RenderedEmail } from "./template-utils";

export function renderRevokedEmail(input: NotificationTemplateInput): RenderedEmail {
  const date = formatDate(input.occurredAt);
  const supportText = input.supportContact ? `\n\nSupport: ${input.supportContact}` : "";
  const supportHtml = input.supportContact
    ? `<p>Support: ${escapeHtml(input.supportContact)}</p>`
    : "";
  return {
    subject: `Your ${input.badgeName} badge was revoked`,
    text: `Hello ${input.recipientFirstName},\n\nYour ${input.badgeName} badge from ${input.issuerName} was revoked on ${date}.\n\nView its current status: ${input.verificationUrl}${supportText}`,
    html: emailShell(
      `<h1 style="font-size:24px">Badge revoked</h1><p>Hello ${escapeHtml(input.recipientFirstName)},</p><p>Your <strong>${escapeHtml(input.badgeName)}</strong> badge from ${escapeHtml(input.issuerName)} was revoked on ${escapeHtml(date)}.</p><p><a href="${escapeHtml(input.verificationUrl)}">View its current status</a></p>${supportHtml}`,
    ),
  };
}
