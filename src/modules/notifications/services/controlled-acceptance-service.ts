import { randomUUID } from "node:crypto";

import type {
  NotificationDelivery,
  Prisma,
  PrismaClient,
  SmtpSubmissionAttempt,
} from "@prisma/client";

export const controlledAcceptanceKey = "brevo-live-acceptance";
export const defaultControlledRecipient = "authorized-test-recipient@example.org";

export function configuredControlledAcceptanceKey(): string {
  return process.env.CONTROLLED_ACCEPTANCE_KEY?.trim() || controlledAcceptanceKey;
}

type ControlledClient = PrismaClient | Prisma.TransactionClient;

function normalized(value: string): string {
  return value.trim().toLowerCase();
}

export function configuredControlledRecipient(): string {
  return normalized(process.env.CONTROLLED_ACCEPTANCE_RECIPIENT ?? defaultControlledRecipient);
}

export class ControlledAcceptanceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ControlledAcceptanceError";
  }
}

export async function armControlledAcceptance(
  client: ControlledClient,
  deliveryId: string,
  recipient = configuredControlledRecipient(),
): Promise<SmtpSubmissionAttempt> {
  const expectedRecipient = configuredControlledRecipient();
  const acceptanceKey = configuredControlledAcceptanceKey();
  if (normalized(recipient) !== expectedRecipient) {
    throw new ControlledAcceptanceError("Controlled acceptance recipient is not authorized");
  }
  const delivery = await client.notificationDelivery.findUnique({
    where: { id: deliveryId },
    select: {
      id: true,
      deliveryChannel: true,
      recipientEmail: true,
      status: true,
    },
  });
  if (!delivery || delivery.deliveryChannel !== "brevo") {
    throw new ControlledAcceptanceError("Controlled acceptance requires a Brevo notification");
  }
  if (normalized(delivery.recipientEmail) !== expectedRecipient) {
    throw new ControlledAcceptanceError("Notification recipient is not authorized");
  }
  if (delivery.status !== "PENDING") {
    throw new ControlledAcceptanceError("Controlled acceptance requires a pending notification");
  }
  const existing = await client.smtpSubmissionAttempt.findFirst({
    where: {
      OR: [{ notificationDeliveryId: delivery.id }, { acceptanceKey }],
    },
    select: { id: true },
  });
  if (existing) {
    throw new ControlledAcceptanceError("Controlled acceptance is already armed");
  }
  return client.smtpSubmissionAttempt.create({
    data: {
      notificationDeliveryId: delivery.id,
      deliveryChannel: delivery.deliveryChannel,
      recipient: delivery.recipientEmail,
      acceptanceKey,
      submissionState: "NOT_STARTED",
    },
  });
}

export type ControlledReservation =
  | { status: "NOT_CONTROLLED" }
  | { status: "CHANNEL_MISMATCH" }
  | { status: "RECIPIENT_MISMATCH" }
  | { status: "CONSUMED"; attempt: SmtpSubmissionAttempt }
  | { status: "RESERVED"; attemptId: string; attemptToken: string };

export async function reserveControlledSubmission(
  client: ControlledClient,
  delivery: Pick<NotificationDelivery, "id" | "deliveryChannel" | "recipientEmail">,
  now = new Date(),
): Promise<ControlledReservation> {
  const attempt = await client.smtpSubmissionAttempt.findUnique({
    where: { notificationDeliveryId: delivery.id },
  });
  if (!attempt) return { status: "NOT_CONTROLLED" };
  if (attempt.deliveryChannel !== delivery.deliveryChannel) {
    return { status: "CHANNEL_MISMATCH" };
  }
  if (normalized(attempt.recipient) !== normalized(delivery.recipientEmail)) {
    return { status: "RECIPIENT_MISMATCH" };
  }
  if (attempt.submissionState !== "NOT_STARTED") {
    return { status: "CONSUMED", attempt };
  }
  const attemptToken = randomUUID();
  const result = await client.smtpSubmissionAttempt.updateMany({
    where: { id: attempt.id, submissionState: "NOT_STARTED" },
    data: {
      submissionState: "SUBMISSION_RESERVED",
      attemptToken,
      submissionStartedAt: now,
    },
  });
  if (result.count !== 1) {
    const current = await client.smtpSubmissionAttempt.findUnique({ where: { id: attempt.id } });
    return current ? { status: "CONSUMED", attempt: current } : { status: "CHANNEL_MISMATCH" };
  }
  return { status: "RESERVED", attemptId: attempt.id, attemptToken };
}

export async function markControlledAccepted(
  client: PrismaClient,
  input: {
    attemptId: string;
    attemptToken: string;
    deliveryId: string;
    claimToken: string;
    providerMessageId?: string;
    now?: Date;
  },
): Promise<boolean> {
  const now = input.now ?? new Date();
  const providerMessageId = input.providerMessageId?.slice(0, 191);
  return client.$transaction(async (tx) => {
    const attemptUpdate = await tx.smtpSubmissionAttempt.updateMany({
      where: {
        id: input.attemptId,
        attemptToken: input.attemptToken,
        submissionState: "SUBMISSION_RESERVED",
      },
      data: {
        submissionState: "ACCEPTED",
        smtpCompletedAt: now,
        providerMessageId,
      },
    });
    if (attemptUpdate.count !== 1) return false;
    const deliveryUpdate = await tx.notificationDelivery.updateMany({
      where: { id: input.deliveryId, status: "PROCESSING", claimToken: input.claimToken },
      data: {
        status: "SENT",
        sentAt: now,
        smtpAcceptedAt: now,
        attemptCount: { increment: 1 },
        claimToken: null,
        claimExpiresAt: null,
        lastErrorCategory: null,
        safeDiagnosticCode: null,
        providerMessageId,
      },
    });
    return deliveryUpdate.count === 1;
  });
}

export async function markControlledFailure(
  client: PrismaClient,
  input: {
    attemptId: string;
    attemptToken: string;
    deliveryId: string;
    claimToken: string;
    state: "REJECTED" | "OUTCOME_UNKNOWN";
    errorCategory: string;
    errorCode: string;
    now?: Date;
  },
): Promise<boolean> {
  const now = input.now ?? new Date();
  return client.$transaction(async (tx) => {
    const attemptUpdate = await tx.smtpSubmissionAttempt.updateMany({
      where: {
        id: input.attemptId,
        attemptToken: input.attemptToken,
        submissionState: "SUBMISSION_RESERVED",
      },
      data: {
        submissionState: input.state,
        smtpCompletedAt: now,
        lastErrorCode: input.errorCode.slice(0, 100),
      },
    });
    if (attemptUpdate.count !== 1) return false;
    const deliveryUpdate = await tx.notificationDelivery.updateMany({
      where: { id: input.deliveryId, status: "PROCESSING", claimToken: input.claimToken },
      data: {
        status: "FAILED",
        attemptCount: { increment: 1 },
        claimToken: null,
        claimExpiresAt: null,
        lastErrorCategory: input.errorCategory.slice(0, 50),
        safeDiagnosticCode: input.errorCode.slice(0, 100),
      },
    });
    return deliveryUpdate.count === 1;
  });
}

export async function reconcileControlledSubmissions(
  client: PrismaClient,
  now = new Date(),
): Promise<number> {
  const attempts = await client.smtpSubmissionAttempt.findMany({
    where: {
      submissionState: { in: ["SUBMISSION_RESERVED", "ACCEPTED", "REJECTED", "OUTCOME_UNKNOWN"] },
      notificationDelivery: {
        status: { in: ["PENDING", "PROCESSING", "RETRY_SCHEDULED"] },
        OR: [{ claimExpiresAt: null }, { claimExpiresAt: { lte: now } }],
      },
    },
    include: { notificationDelivery: true },
  });
  let reconciled = 0;
  for (const attempt of attempts) {
    if (attempt.submissionState === "ACCEPTED") {
      const updated = await client.notificationDelivery.updateMany({
        where: {
          id: attempt.notificationDeliveryId,
          status: { in: ["PENDING", "PROCESSING", "RETRY_SCHEDULED"] },
        },
        data: {
          status: "SENT",
          sentAt: attempt.smtpCompletedAt ?? now,
          providerMessageId: attempt.providerMessageId,
          claimToken: null,
          claimExpiresAt: null,
          lastErrorCategory: null,
          safeDiagnosticCode: null,
        },
      });
      reconciled += updated.count;
      continue;
    }
    if (attempt.submissionState === "SUBMISSION_RESERVED") {
      await client.smtpSubmissionAttempt.updateMany({
        where: { id: attempt.id, submissionState: "SUBMISSION_RESERVED" },
        data: {
          submissionState: "OUTCOME_UNKNOWN",
          smtpCompletedAt: now,
          lastErrorCode: "SUBMISSION_OUTCOME_UNKNOWN",
        },
      });
    }
    const updated = await client.notificationDelivery.updateMany({
      where: {
        id: attempt.notificationDeliveryId,
        status: { in: ["PENDING", "PROCESSING", "RETRY_SCHEDULED"] },
      },
      data: {
        status: "FAILED",
        attemptCount: { increment: 1 },
        claimToken: null,
        claimExpiresAt: null,
        lastErrorCategory: attempt.submissionState === "REJECTED" ? "PERMANENT" : "OUTCOME_UNKNOWN",
        safeDiagnosticCode: attempt.lastErrorCode ?? "SUBMISSION_OUTCOME_UNKNOWN",
      },
    });
    reconciled += updated.count;
  }
  return reconciled;
}
