import { NextResponse } from "next/server";
import { z } from "zod";

import { requireRole } from "@/modules/identity/policies/authorization";
import { getCurrentActor } from "@/modules/identity/services/current-actor";
import { batchPreviewSummarySchema } from "@/modules/issuance/batch-types";
import {
  authorizeBatchClass,
  createBatchPreview,
} from "@/modules/issuance/services/batch-preview-service";
import { consumeRateLimit } from "@/platform/security/shared-rate-limit";
import { hasTrustedOrigin } from "@/platform/security/origin";

const identifier = z
  .string()
  .trim()
  .min(1)
  .max(191)
  .regex(/^[A-Za-z0-9_-]+$/);
const maximumJsonBytes = 1_500_000;
const privateHeaders = { "Cache-Control": "private, no-store" };
const bodySchema = z
  .object({
    sourceFilename: z.string().trim().min(1).max(255),
    badgeTemplateId: identifier,
    mapping: z
      .object({
        studentNumber: z.number().int().nonnegative(),
        email: z.number().int().nonnegative().nullable().optional(),
      })
      .strict(),
    rows: z
      .array(z.array(z.string().max(10_000)).max(100))
      .min(1)
      .max(5_000),
  })
  .strict();

async function readBoundedJson(request: Request): Promise<unknown> {
  const declaredLength = request.headers.get("content-length");
  if (declaredLength !== null && Number(declaredLength) > maximumJsonBytes) {
    throw new RangeError("Preview request is too large");
  }
  if (!request.body) throw new SyntaxError("Preview request body is required");
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > maximumJsonBytes) {
      await reader.cancel();
      throw new RangeError("Preview request is too large");
    }
    text += decoder.decode(value, { stream: true });
  }
  text += decoder.decode();
  return JSON.parse(text) as unknown;
}

export async function POST(request: Request, context: { params: Promise<{ classId: string }> }) {
  try {
    if (request.headers.has("origin") && !hasTrustedOrigin(request)) {
      return NextResponse.json(
        { error: "Invalid origin" },
        { status: 403, headers: privateHeaders },
      );
    }
    const actor = requireRole(await getCurrentActor(), "FACULTY");
    const classId = identifier.parse((await context.params).classId);
    await authorizeBatchClass(actor, classId);
    const rateLimit = await consumeRateLimit({
      policy: "import",
      key: `${actor.id}\u0000${classId}`,
    });
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Too many requests" },
        {
          status: 429,
          headers: { ...privateHeaders, "Retry-After": String(rateLimit.retryAfterSeconds) },
        },
      );
    }
    const input = bodySchema.parse(await readBoundedJson(request));
    const result = batchPreviewSummarySchema.parse(
      await createBatchPreview(actor, { classId, ...input }),
    );
    return NextResponse.json(result, { headers: privateHeaders });
  } catch (error) {
    const forbidden = error instanceof Error && error.name === "AuthorizationError";
    const notFound = error instanceof Error && error.message === "Batch not found";
    const tooLarge = error instanceof RangeError;
    return NextResponse.json(
      {
        error: forbidden
          ? "Forbidden"
          : notFound
            ? "Not found"
            : tooLarge
              ? "Preview request is too large"
              : "Unable to create batch preview",
      },
      { status: forbidden ? 403 : notFound ? 404 : tooLarge ? 413 : 400, headers: privateHeaders },
    );
  }
}
