import { NextResponse } from "next/server";
import { z } from "zod";

import { requireRole } from "@/modules/identity/policies/authorization";
import { getCurrentActor } from "@/modules/identity/services/current-actor";
import {
  authorizeBatchClass,
  authorizeBatchSelection,
} from "@/modules/issuance/services/batch-preview-service";
import { inspectBatchFile } from "@/modules/issuance/services/batch-validation";
import { consumeRateLimit } from "@/platform/security/shared-rate-limit";
import { hasTrustedOrigin } from "@/platform/security/origin";

const identifier = z
  .string()
  .trim()
  .min(1)
  .max(191)
  .regex(/^[A-Za-z0-9_-]+$/);
const maximumMultipartBytes = 2 * 1024 * 1024 + 64 * 1024;
const privateHeaders = { "Cache-Control": "private, no-store" };

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
    const contentLength = Number(request.headers.get("content-length"));
    if (!Number.isSafeInteger(contentLength) || contentLength <= 0) {
      return NextResponse.json(
        { error: "A bounded multipart request is required" },
        { status: 411, headers: privateHeaders },
      );
    }
    if (contentLength > maximumMultipartBytes) {
      return NextResponse.json(
        { error: "Batch file must not exceed 2 MiB" },
        { status: 413, headers: privateHeaders },
      );
    }
    const form = await request.formData();
    const badgeTemplateId = identifier.parse(form.get("badgeTemplateId"));
    const file = form.get("file");
    if (
      !file ||
      typeof file !== "object" ||
      !("name" in file) ||
      typeof file.name !== "string" ||
      !("arrayBuffer" in file) ||
      typeof file.arrayBuffer !== "function"
    ) {
      throw new Error("Batch file is required");
    }
    await authorizeBatchSelection(actor, classId, badgeTemplateId);
    return NextResponse.json(await inspectBatchFile(file as File), { headers: privateHeaders });
  } catch (error) {
    const forbidden = error instanceof Error && error.name === "AuthorizationError";
    const notFound = error instanceof Error && error.message === "Batch not found";
    return NextResponse.json(
      { error: forbidden ? "Forbidden" : notFound ? "Not found" : "Unable to inspect batch file" },
      { status: forbidden ? 403 : notFound ? 404 : 400, headers: privateHeaders },
    );
  }
}
