import type { NotificationDelivery, PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";

import { renderIssuedEmail } from "../templates/issued-email";
import { renderRevokedEmail } from "../templates/revoked-email";
import { calculateNextAttempt, classifySmtpFailure } from "./retry-policy";
import type { SmtpTransport } from "./smtp-client";

export type DeliveryWorkerConfig = {
  batchSize: number;
  claimLeaseSeconds: number;
  maxAttempts: number;
  retryBaseDelaySeconds: number;
};

export async function claimDueDeliveries(
  prisma: PrismaClient,
  config: DeliveryWorkerConfig,
  now = new Date(),
): Promise<NotificationDelivery[]> {
  const candidates = await prisma.notificationDelivery.findMany({
    where: {
      OR: [
        { status: { in: ["PENDING", "RETRY_SCHEDULED"] }, nextAttemptAt: { lte: now } },
        { status: "PROCESSING", claimExpiresAt: { lte: now } },
      ],
    },
    orderBy: { nextAttemptAt: "asc" },
    take: config.batchSize,
  });
  const claimed: NotificationDelivery[] = [];
  for (const candidate of candidates) {
    const claimToken = randomUUID();
    const claimExpiresAt = new Date(now.getTime() + config.claimLeaseSeconds * 1000);
    const result = await prisma.notificationDelivery.updateMany({
      where: {
        id: candidate.id,
        OR: [
          { status: { in: ["PENDING", "RETRY_SCHEDULED"] }, nextAttemptAt: { lte: now } },
          { status: "PROCESSING", claimExpiresAt: { lte: now } },
        ],
      },
      data: { status: "PROCESSING", claimToken, claimExpiresAt },
    });
    if (result.count === 1) {
      const row = await prisma.notificationDelivery.findUnique({ where: { id: candidate.id } });
      if (row) claimed.push(row);
    }
  }
  return claimed;
}

export async function deliverClaimed(
  prisma: PrismaClient,
  smtp: SmtpTransport,
  delivery: NotificationDelivery,
  config: DeliveryWorkerConfig,
  now = new Date(),
): Promise<"ready" | "degraded"> {
  if (!delivery.claimToken) return "degraded";
  const templateInput = {
    recipientFirstName: delivery.recipientFirstName,
    badgeName: delivery.badgeName,
    issuerName: delivery.issuerName,
    verificationUrl: delivery.verificationUrl,
    occurredAt: delivery.occurredAt,
    ...(delivery.supportContact ? { supportContact: delivery.supportContact } : {}),
  };
  const email =
    delivery.type === "BADGE_ISSUED"
      ? renderIssuedEmail(templateInput)
      : renderRevokedEmail(templateInput);
  try {
    const result = await smtp.send({ to: delivery.recipientEmail, email });
    await prisma.notificationDelivery.updateMany({
      where: { id: delivery.id, status: "PROCESSING", claimToken: delivery.claimToken },
      data: {
        status: "SENT",
        sentAt: now,
        attemptCount: { increment: 1 },
        claimToken: null,
        claimExpiresAt: null,
        lastErrorCategory: null,
        safeDiagnosticCode: null,
        providerMessageId: result.messageId?.slice(0, 191),
      },
    });
    return "ready";
  } catch (error) {
    const attemptCount = delivery.attemptCount + 1;
    const kind = classifySmtpFailure(error);
    const retry = kind === "TRANSIENT" && attemptCount < config.maxAttempts;
    const code = String((error as { code?: unknown }).code ?? "SMTP_ERROR").slice(0, 100);
    await prisma.notificationDelivery.updateMany({
      where: { id: delivery.id, status: "PROCESSING", claimToken: delivery.claimToken },
      data: {
        status: retry ? "RETRY_SCHEDULED" : "FAILED",
        attemptCount,
        nextAttemptAt: retry
          ? calculateNextAttempt(now, attemptCount, config.retryBaseDelaySeconds, 86_400)
          : delivery.nextAttemptAt,
        claimToken: null,
        claimExpiresAt: null,
        lastErrorCategory: kind,
        safeDiagnosticCode: code,
      },
    });
    return "degraded";
  }
}

export async function runDeliveryCycle(
  prisma: PrismaClient,
  smtp: SmtpTransport,
  config: DeliveryWorkerConfig,
): Promise<{ processed: number; mailStatus: "ready" | "degraded" }> {
  const claimed = await claimDueDeliveries(prisma, config);
  let mailStatus: "ready" | "degraded" = "ready";
  for (const delivery of claimed) {
    if ((await deliverClaimed(prisma, smtp, delivery, config)) === "degraded") {
      mailStatus = "degraded";
    }
  }
  return { processed: claimed.length, mailStatus };
}
