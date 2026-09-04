import { emailShell, escapeHtml, formatDate } from "./template-utils";
import type { NotificationTemplateInput, RenderedEmail } from "./template-utils";

export function renderIssuedEmail(input: NotificationTemplateInput): RenderedEmail {
  const date = formatDate(input.occurredAt);
  return {
    subject: `Your ${input.badgeName} badge was issued`,
    text: `Hello ${input.recipientFirstName},\n\n${input.issuerName} issued you the ${input.badgeName} badge on ${date}.\n\nView and share your badge: ${input.verificationUrl}\n\nYou can open this public verification link without signing in.`,
    html: emailShell(
      `<h1 style="font-size:24px">Your badge was issued</h1><p>Hello ${escapeHtml(input.recipientFirstName)},</p><p><strong>${escapeHtml(input.issuerName)}</strong> issued you the <strong>${escapeHtml(input.badgeName)}</strong> badge on ${escapeHtml(date)}.</p><p><a href="${escapeHtml(input.verificationUrl)}">View and share your badge</a></p><p>You can open this public verification link without signing in.</p>`,
    ),
  };
}
