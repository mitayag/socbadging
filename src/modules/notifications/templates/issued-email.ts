import { emailShell, escapeHtml, formatDate, safePublicUrl } from "./template-utils";
import type { NotificationTemplateInput, RenderedEmail } from "./template-utils";

function supportHref(value: string): string {
  return value.includes(":") ? value : `mailto:${value}`;
}

export function renderIssuedEmail(input: NotificationTemplateInput): RenderedEmail {
  const date = formatDate(input.occurredAt);
  const expiration = input.expiresAt ? `\n\nExpires: ${formatDate(input.expiresAt)}` : "";
  const imageUrl = safePublicUrl(input.badgeImageUrl);
  const imageText = imageUrl ? `\n\nBadge image: ${imageUrl}` : "";
  const supportText = input.supportContact ? `\n\nSupport: ${input.supportContact}` : "";
  const imageHtml = imageUrl
    ? `<p><img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(input.badgeName)} badge artwork" width="160" height="160" style="display:block;width:160px;height:160px;object-fit:contain;border:1px solid #d7e2ef;border-radius:12px;background:#f8fafc" /></p>`
    : "";
  const expirationHtml = input.expiresAt
    ? `<p>This credential expires on <strong>${escapeHtml(formatDate(input.expiresAt))}</strong>.</p>`
    : "";
  const supportHtml = input.supportContact
    ? `<p>Need help? Contact <a href="${escapeHtml(supportHref(input.supportContact))}">${escapeHtml(input.supportContact)}</a>.</p>`
    : "";

  return {
    subject: `Your ${input.badgeName} badge was issued`,
    text: `Hello ${input.recipientFirstName},\n\n${input.issuerName} issued you the ${input.badgeName} badge on ${date}.${expiration}\n\nView and share your badge: ${input.verificationUrl}${imageText}${supportText}\n\nYou can open this public verification link without signing in.`,
    html: emailShell(
      `<h1 style="font-size:24px">Your badge was issued</h1><p>Hello ${escapeHtml(input.recipientFirstName)},</p>${imageHtml}<p><strong>${escapeHtml(input.issuerName)}</strong> issued you the <strong>${escapeHtml(input.badgeName)}</strong> badge on ${escapeHtml(date)}.</p>${expirationHtml}<p><a href="${escapeHtml(input.verificationUrl)}">View and share your badge</a></p>${supportHtml}<p>You can open this public verification link without signing in.</p>`,
    ),
  };
}
