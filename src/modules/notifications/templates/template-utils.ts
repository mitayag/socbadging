export type NotificationTemplateInput = {
  recipientFirstName: string;
  badgeName: string;
  issuerName: string;
  verificationUrl: string;
  occurredAt: Date;
  supportContact?: string;
};

export type RenderedEmail = { subject: string; text: string; html: string };

export function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "'": "&#39;",
      '"': "&quot;",
    };
    return entities[character] ?? character;
  });
}

export function formatDate(value: Date): string {
  return new Intl.DateTimeFormat("en", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(value);
}

export function emailShell(content: string): string {
  return `<!doctype html><html lang="en"><body style="margin:0;background:#f5f8fc;color:#173b67;font-family:Arial,sans-serif"><main style="max-width:620px;margin:0 auto;padding:32px"><div style="background:#fff;border:1px solid #d7e2ef;border-radius:16px;padding:32px"><p style="font-weight:700;margin:0">HAU SOC</p><p style="margin:4px 0 24px">Badging System</p>${content}</div></main></body></html>`;
}
