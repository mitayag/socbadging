import { NextResponse } from "next/server";
import { z } from "zod";

import {
  AuthorizationError,
  requireAuthenticated,
} from "@/modules/identity/policies/authorization";
import { getCurrentActor } from "@/modules/identity/services/current-actor";
import { buildIssuanceCsv } from "@/modules/issuance/services/issuance-csv";
import {
  listIssuanceExportRows,
  normalizeIssuanceFilters,
} from "@/modules/issuance/services/issuance-query-service";
import { getClassWorkspace } from "@/modules/rosters/services/roster-service";
import { consumeRateLimit } from "@/platform/security/shared-rate-limit";

const identifierSchema = z
  .string()
  .trim()
  .min(1)
  .max(191)
  .regex(/^[A-Za-z0-9_-]+$/);

function filtersFromRequest(request: Request, classId: string) {
  const params = new URL(request.url).searchParams;
  const status = params.get("status");
  return normalizeIssuanceFilters({
    query: params.get("query") ?? undefined,
    status:
      status === "ACTIVE" || status === "REVOKED" || status === "EXPIRED" ? status : undefined,
    classId,
    badgeTemplateId: params.get("badgeTemplateId") ?? undefined,
    page: params.get("page") ?? undefined,
  });
}

export async function GET(request: Request, { params }: { params: Promise<{ classId: string }> }) {
  try {
    const actor = requireAuthenticated(await getCurrentActor());
    const classId = identifierSchema.parse((await params).classId);
    await getClassWorkspace(actor, classId);
    const rateLimit = await consumeRateLimit({
      policy: "export",
      key: `${actor.id}\u0000${classId}`,
    });
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Too many requests" },
        {
          status: 429,
          headers: {
            "Cache-Control": "private, no-store",
            "Retry-After": String(rateLimit.retryAfterSeconds),
          },
        },
      );
    }
    const rows = await listIssuanceExportRows(actor, filtersFromRequest(request, classId));
    const body = Uint8Array.from(buildIssuanceCsv(rows));
    return new NextResponse(body.buffer, {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="class-${classId}-issued-credentials.csv"`,
      },
    });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
