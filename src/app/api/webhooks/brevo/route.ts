import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { loadBrevoWebhookConfig } from "@/config/env";
import {
  BrevoWebhookEventSchema,
  verifyBrevoWebhookSignature,
} from "@/modules/notifications/services/brevo-webhook-adapter";
import { processBrevoDeliveryEvents } from "@/modules/notifications/services/notification-delivery-event-service";
import { prisma } from "@/platform/db/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const maximumBodyBytes = 64 * 1024;
const maximumEvents = 50;

function signatureFrom(request: Request): string | undefined {
  return (
    request.headers.get("x-brevo-signature") ??
    request.headers.get("x-sib-signature") ??
    request.headers.get("x-brevo-webhook-signature") ??
    undefined
  );
}

export async function POST(request: Request) {
  const config = loadBrevoWebhookConfig(process.env);
  if (!config.enabled || !config.secret) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > maximumBodyBytes) {
    return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  }

  const rawBody = await request.text();
  if (Buffer.byteLength(rawBody, "utf8") > maximumBodyBytes) {
    return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  }

  if (
    !verifyBrevoWebhookSignature({
      rawBody,
      signature: signatureFrom(request),
      secret: config.secret,
    })
  ) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const events = Array.isArray(payload) ? payload : [payload];
  if (events.length === 0 || events.length > maximumEvents) {
    return NextResponse.json({ error: "Invalid event batch" }, { status: 400 });
  }

  try {
    for (const event of events) BrevoWebhookEventSchema.parse(event);
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: "Invalid event payload" }, { status: 400 });
    }
    throw error;
  }

  const results = await processBrevoDeliveryEvents(prisma, events);
  const summary = { applied: 0, stale: 0, duplicate: 0, unmatched: 0 };
  for (const result of results) {
    if (result.status === "APPLIED") summary.applied += 1;
    else if (result.status === "STALE") summary.stale += 1;
    else if (result.status === "DUPLICATE") summary.duplicate += 1;
    else summary.unmatched += 1;
  }

  return NextResponse.json(
    { received: results.length, ...summary },
    { headers: { "Cache-Control": "no-store" } },
  );
}
