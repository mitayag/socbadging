import { emailShell, escapeHtml, formatDate, safePublicUrl } from "./template-utils";
import type { NotificationTemplateInput, RenderedEmail } from "./template-utils";

function supportHref(value: string): string {
  return value.includes(":") ? value : `mailto:${value}`;
}

function portalUrlFor(input: NotificationTemplateInput): string | null {
  const explicit = safePublicUrl(input.portalUrl);
  if (explicit) return explicit;
  try {
    return new URL("/student", input.verificationUrl).toString();
  } catch {
    return null;
  }
}

function shareLinks(verificationUrl: string, title: string, issuerName: string, issuedAt: Date) {
  const linkedInPost = `https://www.linkedin.com/sharing/share-offsite/?${new URLSearchParams({ url: verificationUrl })}`;
  const facebook = `https://www.facebook.com/sharer/sharer.php?${new URLSearchParams({ u: verificationUrl })}`;
  const x = `https://x.com/intent/post?${new URLSearchParams({
    text: `I earned the ${title} badge from ${issuerName}.`,
    url: verificationUrl,
  })}`;
  let linkedInProfile: string | null = null;
  try {
    const publicId = new URL(verificationUrl).pathname.split("/").filter(Boolean).at(-1) ?? "";
    linkedInProfile = `https://www.linkedin.com/profile/add?${new URLSearchParams({
      startTask: "CERTIFICATION_NAME",
      name: title,
      organizationName: issuerName,
      issueYear: String(issuedAt.getUTCFullYear()),
      issueMonth: String(issuedAt.getUTCMonth() + 1),
      certUrl: verificationUrl,
      certId: publicId || verificationUrl,
    })}`;
  } catch {
    linkedInProfile = null;
  }
  return { linkedInPost, linkedInProfile, facebook, x };
}

export function renderIssuedEmail(
  input: NotificationTemplateInput,
  inlineBadgeImageCid?: string,
): RenderedEmail {
  const date = formatDate(input.occurredAt);
  const displayName = input.recipientDisplayName?.trim() || input.recipientFirstName;
  const description = input.achievementDescription?.trim() ?? "";
  const expiration = input.expiresAt ? `\n\nExpires: ${formatDate(input.expiresAt)}` : "";
  const imageUrl = safePublicUrl(input.badgeImageUrl);
  const imageText = imageUrl ? `\n\nBadge image: ${imageUrl}` : "";
  const supportText = input.supportContact ? `\n\nSupport: ${input.supportContact}` : "";
  const portalUrl = portalUrlFor(input);
  const shares = shareLinks(
    input.verificationUrl,
    input.badgeName,
    input.issuerName,
    input.occurredAt,
  );
  const imageSource = imageUrl && inlineBadgeImageCid ? `cid:${inlineBadgeImageCid}` : imageUrl;
  const imageHtml = imageSource
    ? `<p align="center" style="text-align:center"><img src="${escapeHtml(imageSource)}" alt="${escapeHtml(input.badgeName)} badge artwork" width="160" height="160" border="0" style="display:block;width:160px;height:160px;object-fit:contain;border:1px solid #d7e2ef;border-radius:12px;background:#f8fafc" /></p>`
    : "";
  const imageFallbackHtml = imageUrl
    ? `<p align="center" style="text-align:center;font-size:12px;color:#64748b">If the artwork is not visible, <a href="${escapeHtml(imageUrl)}" style="color:#2e6fa8">view the badge artwork</a>.</p>`
    : "";
  const expirationHtml = input.expiresAt
    ? `<p>This credential expires on <strong>${escapeHtml(formatDate(input.expiresAt))}</strong>.</p>`
    : "";
  const supportHtml = input.supportContact
    ? `<p>Need help? Contact <a href="${escapeHtml(supportHref(input.supportContact))}">${escapeHtml(input.supportContact)}</a>.</p>`
    : "";
  const descriptionHtml = description ? `<p>${escapeHtml(description)}</p>` : "";
  const portalHtml = portalUrl
    ? `<p><a href="${escapeHtml(portalUrl)}" style="display:inline-block;padding:12px 18px;border:1px solid #2e6fa8;border-radius:10px;color:#2e6fa8;text-decoration:none;font-weight:700">Open Student Badge Portal</a></p>`
    : "";
  const textShares = [
    `Add to LinkedIn profile: ${shares.linkedInProfile}`,
    `Share on LinkedIn: ${shares.linkedInPost}`,
    `Share on Facebook: ${shares.facebook}`,
    `Share on X: ${shares.x}`,
  ].join("\n");

  return {
    subject: "Congratulations! You Have Earned a Digital Badge — HAU School of Computing",
    text: `Congratulations ${displayName}!\n\nHoly Angel University — School of Computing\n\nYou have earned the ${input.badgeName} digital badge.\n\n${description}\n\nIssued: ${date}${expiration}\n\nView and verify your badge: ${input.verificationUrl}${portalUrl ? `\n\nStudent Badge Portal: ${portalUrl}` : ""}${imageText}\n\nShare your achievement (public verification link):\n${textShares}${supportText}\n\nThis email was sent because a badge was issued to your registered student email address.`,
    html: emailShell(
      `<p style="font-weight:700;margin:0">Holy Angel University</p><p style="margin:4px 0 24px">School of Computing</p><h1 style="font-size:26px;line-height:1.3">Congratulations, ${escapeHtml(displayName)}!</h1><p>You have earned a <strong>digital badge</strong> from the HAU School of Computing.</p>${imageHtml}${imageFallbackHtml}<h2 style="font-size:22px;margin-bottom:8px">${escapeHtml(input.badgeName)}</h2>${descriptionHtml}<p><strong>Issued:</strong> ${escapeHtml(date)}</p>${expirationHtml}<p><a href="${escapeHtml(input.verificationUrl)}" style="display:inline-block;padding:12px 18px;border-radius:10px;background:#2e6fa8;color:#ffffff;text-decoration:none;font-weight:700">View and Verify Badge</a></p>${portalHtml}<h3>Share your achievement</h3><p>Share your official public verification link. It does not expose your email address or student number.</p><p><a href="${escapeHtml(shares.linkedInProfile ?? shares.linkedInPost)}">Add to LinkedIn Profile</a> · <a href="${escapeHtml(shares.linkedInPost)}">LinkedIn</a> · <a href="${escapeHtml(shares.facebook)}">Facebook</a> · <a href="${escapeHtml(shares.x)}">X</a></p>${supportHtml}<p style="font-size:12px;color:#64748b;margin-top:24px">This email was sent because a badge was issued to your registered student email address.</p>`,
    ),
  };
}
