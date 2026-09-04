import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAuthenticated } from "@/modules/identity/policies/authorization";
import { getCurrentActor } from "@/modules/identity/services/current-actor";
import { getBatchDetail } from "@/modules/issuance/services/batch-preview-service";
import { buildBatchReportCsv } from "@/modules/issuance/services/batch-report";
import { consumeRateLimit } from "@/platform/security/shared-rate-limit";

const identifier = z
  .string()
  .trim()
  .min(1)
  .max(191)
  .regex(/^[A-Za-z0-9_-]+$/);
const privateHeaders = { "Cache-Control": "private, no-store" };

export async function GET(_request: Request, context: { params: Promise<{ batchId: string }> }) {
  try {
    const actor = requireAuthenticated(await getCurrentActor());
    const batchId = identifier.parse((await context.params).batchId);
    const rateLimit = await consumeRateLimit({
      policy: "export",
      key: `${actor.id}\u0000${batchId}`,
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
    const detail = await getBatchDetail(actor, batchId);
    return new NextResponse(new Uint8Array(buildBatchReportCsv(detail.rows)).buffer, {
      headers: {
        ...privateHeaders,
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="batch-${batchId}-report.csv"`,
      },
    });
  } catch (error) {
    const forbidden = error instanceof Error && error.name === "AuthorizationError";
    return NextResponse.json(
      { error: forbidden ? "Forbidden" : "Not found" },
      { status: forbidden ? 403 : 404, headers: privateHeaders },
    );
  }
}
