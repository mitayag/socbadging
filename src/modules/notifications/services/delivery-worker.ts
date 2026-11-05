import type { NotificationDelivery, PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";

import { renderIssuedEmail } from "../templates/issued-email";
import { renderRevokedEmail } from "../templates/revoked-email";
import {
  markControlledAccepted,
  markControlledFailure,
  reconcileControlledSubmissions,
  reserveControlledSubmission,
} from "./controlled-acceptance-service";
import type { EmailRecipientPolicy } from "@/config/env";

import { isDeliveryRecipientAllowed } from "./recipient-policy";
import { isRecipientSuppressed } from "./recipient-suppression-core";
import { calculateNextAttempt, classifySmtpFailure } from "./retry-policy";
import type { SmtpTransport } from "./smtp-client";

export type DeliveryWorkerConfig = {
  batchSize: number;
  claimLeaseSeconds: number;
  maxAttempts: number;
  retryBaseDelaySeconds: number;
  deliveryChannel: "mailpit" | "brevo";
  recipientPolicy: EmailRecipientPolicy;
  externalEnabled: boolean;
  controlledAcceptanceOnly: boolean;
  allowlist: string[];
};

export async function claimDueDeliveries(
  prisma: PrismaClient,
  config: DeliveryWorkerConfig,
  now = new Date(),
): Promise<NotificationDelivery[]> {
  const candidates = await prisma.notificationDelivery.findMany({
    where: {
      deliveryChannel: config.deliveryChannel,
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

function renderDeliveryEmail(delivery: NotificationDelivery) {
  const templateInput = {
    recipientFirstName: delivery.recipientFirstName,
    badgeName: delivery.badgeName,
    ...(delivery.badgeImageUrl ? { badgeImageUrl: delivery.badgeImageUrl } : {}),
    issuerName: delivery.issuerName,
    verificationUrl: delivery.verificationUrl,
    occurredAt: delivery.occurredAt,
    ...(delivery.expiresAt ? { expiresAt: delivery.expiresAt } : {}),
    ...(delivery.supportContact ? { supportContact: delivery.supportContact } : {}),
  };
  return delivery.type === "BADGE_ISSUED"
    ? renderIssuedEmail(templateInput)
    : renderRevokedEmail(templateInput);
}

async function failClaimed(
  prisma: PrismaClient,
  delivery: NotificationDelivery,
  safeDiagnosticCode: string,
  lastErrorCategory = "PERMANENT",
): Promise<"degraded"> {
  await prisma.notificationDelivery.updateMany({
    where: { id: delivery.id, status: "PROCESSING", claimToken: delivery.claimToken },
    data: {
      status: "FAILED",
      attemptCount: { increment: 1 },
      claimToken: null,
      claimExpiresAt: null,
      lastErrorCategory,
      safeDiagnosticCode,
    },
  });
  return "degraded";
}

async function startDeliveryAttempt(
  prisma: PrismaClient,
  delivery: NotificationDelivery,
  now: Date,
) {
  return prisma.notificationDeliveryAttempt.create({
    data: {
      notificationDeliveryId: delivery.id,
      attemptNumber: delivery.attemptCount + 1,
      deliveryChannel: delivery.deliveryChannel,
      outcome: "STARTED",
      startedAt: now,
    },
  });
}

async function completeDeliveryAttempt(
  prisma: PrismaClient,
  attemptId: string,
  outcome: "ACCEPTED" | "REJECTED" | "OUTCOME_UNKNOWN",
  input: {
    providerMessageId?: string;
    safeDiagnosticCode?: string;
    errorCategory?: string;
    now: Date;
  },
) {
  await prisma.notificationDeliveryAttempt.updateMany({
    where: { id: attemptId, outcome: "STARTED" },
    data: {
      outcome,
      completedAt: input.now,
      ...(input.providerMessageId
        ? { providerMessageId: input.providerMessageId.slice(0, 191) }
        : {}),
      ...(input.safeDiagnosticCode
        ? { safeDiagnosticCode: input.safeDiagnosticCode.slice(0, 100) }
        : {}),
      ...(input.errorCategory ? { errorCategory: input.errorCategory.slice(0, 50) } : {}),
    },
  });
}

export async function deliverClaimed(
  prisma: PrismaClient,
  smtp: SmtpTransport,
  delivery: NotificationDelivery,
  config: DeliveryWorkerConfig,
  now = new Date(),
): Promise<"ready" | "degraded"> {
  if (!delivery.claimToken) return "degraded";
  if (await isRecipientSuppressed(prisma, delivery.recipientEmail)) {
    return failClaimed(prisma, delivery, "RECIPIENT_SUPPRESSED", "SUPPRESSED");
  }
  if (
    !(await isDeliveryRecipientAllowed(
      prisma,
      {
        issuanceId: delivery.issuanceId,
        type: delivery.type,
        recipientEmail: delivery.recipientEmail,
      },
      config.recipientPolicy,
      config.allowlist,
    ))
  ) {
    return failClaimed(prisma, delivery, "RECIPIENT_NOT_AUTHORIZED", "PERMANENT");
  }
  if (delivery.deliveryChannel === "brevo" && !config.externalEnabled) {
    return failClaimed(prisma, delivery, "EXTERNAL_EMAIL_DISABLED", "PERMANENT");
  }

  const controlledAttempt =
    delivery.deliveryChannel === "brevo"
      ? await prisma.smtpSubmissionAttempt.findUnique({
          where: { notificationDeliveryId: delivery.id },
        })
      : null;
  if (
    delivery.deliveryChannel === "brevo" &&
    !controlledAttempt &&
    config.controlledAcceptanceOnly
  ) {
    return failClaimed(prisma, delivery, "CONTROLLED_ACCEPTANCE_REQUIRED");
  }

  const email = renderDeliveryEmail(delivery);

  if (controlledAttempt) {
    if (await isRecipientSuppressed(prisma, delivery.recipientEmail)) {
      return failClaimed(prisma, delivery, "RECIPIENT_SUPPRESSED", "SUPPRESSED");
    }
    const reservation = await reserveControlledSubmission(prisma, delivery, now);
    if (reservation.status !== "RESERVED") {
      return failClaimed(prisma, delivery, "CONTROLLED_SUBMISSION_CONSUMED");
    }
    const attempt = await startDeliveryAttempt(prisma, delivery, now);
    let result: { messageId?: string };
    try {
      result = await smtp.send({ to: delivery.recipientEmail, email });
    } catch (error) {
      const kind = classifySmtpFailure(error);
      const state = kind === "TRANSIENT" ? "OUTCOME_UNKNOWN" : "REJECTED";
      const code = String((error as { code?: unknown }).code ?? "SMTP_ERROR").slice(0, 100);
      await markControlledFailure(prisma, {
        attemptId: reservation.attemptId,
        attemptToken: reservation.attemptToken,
        deliveryId: delivery.id,
        claimToken: delivery.claimToken,
        state,
        errorCategory: kind,
        errorCode: code,
        now,
      });
      await completeDeliveryAttempt(prisma, attempt.id, state, {
        safeDiagnosticCode: code,
        errorCategory: kind,
        now,
      });
      return "degraded";
    }
    try {
      const finalized = await markControlledAccepted(prisma, {
        attemptId: reservation.attemptId,
        attemptToken: reservation.attemptToken,
        deliveryId: delivery.id,
        claimToken: delivery.claimToken,
        providerMessageId: result.messageId,
        now,
      });
      await completeDeliveryAttempt(prisma, attempt.id, "ACCEPTED", {
        providerMessageId: result.messageId,
        now,
      });
      return finalized ? "ready" : "degraded";
    } catch {
      return "degraded";
    }
  }

  if (await isRecipientSuppressed(prisma, delivery.recipientEmail)) {
    return failClaimed(prisma, delivery, "RECIPIENT_SUPPRESSED", "SUPPRESSED");
  }
  const attempt = await startDeliveryAttempt(prisma, delivery, now);
  let result: { messageId?: string };
  try {
    result = await smtp.send({ to: delivery.recipientEmail, email });
  } catch (error) {
    const attemptCount = delivery.attemptCount + 1;
    const kind = classifySmtpFailure(error);
    const retry = kind === "TRANSIENT" && attemptCount < config.maxAttempts;
    const code = String((error as { code?: unknown }).code ?? "SMTP_ERROR").slice(0, 100);
    await completeDeliveryAttempt(
      prisma,
      attempt.id,
      kind === "TRANSIENT" ? "OUTCOME_UNKNOWN" : "REJECTED",
      { safeDiagnosticCode: code, errorCategory: kind, now },
    );
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
  try {
    await completeDeliveryAttempt(prisma, attempt.id, "ACCEPTED", {
      providerMessageId: result.messageId,
      now,
    });
    await prisma.notificationDelivery.updateMany({
      where: { id: delivery.id, status: "PROCESSING", claimToken: delivery.claimToken },
      data: {
        status: "SENT",
        sentAt: now,
        smtpAcceptedAt: now,
        attemptCount: { increment: 1 },
        claimToken: null,
        claimExpiresAt: null,
        lastErrorCategory: null,
        safeDiagnosticCode: null,
        providerMessageId: result.messageId?.slice(0, 191),
      },
    });
    return "ready";
  } catch {
    return "degraded";
  }
}

export async function runDeliveryCycle(
  prisma: PrismaClient,
  smtp: SmtpTransport,
  config: DeliveryWorkerConfig,
): Promise<{ processed: number; mailStatus: "ready" | "degraded" }> {
  await reconcileControlledSubmissions(prisma);
  const claimed = await claimDueDeliveries(prisma, config);
  let mailStatus: "ready" | "degraded" = "ready";
  for (const delivery of claimed) {
    if ((await deliverClaimed(prisma, smtp, delivery, config)) === "degraded") {
      mailStatus = "degraded";
    }
  }
  return { processed: claimed.length, mailStatus };
}
