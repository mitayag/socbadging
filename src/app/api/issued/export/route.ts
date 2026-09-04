import { NextResponse } from "next/server";

import { requireAuthenticated } from "@/modules/identity/policies/authorization";
import { getCurrentActor } from "@/modules/identity/services/current-actor";
import { buildIssuanceCsv } from "@/modules/issuance/services/issuance-csv";
import {
  listIssuanceExportRows,
  normalizeIssuanceFilters,
} from "@/modules/issuance/services/issuance-query-service";
import { consumeRateLimit } from "@/platform/security/shared-rate-limit";

function filtersFromRequest(request: Request) {
  const params = new URL(request.url).searchParams;
  const status = params.get("status");
  return normalizeIssuanceFilters({
    query: params.get("query") ?? undefined,
    status:
      status === "ACTIVE" || status === "REVOKED" || status === "EXPIRED" ? status : undefined,
    classId: params.get("classId") ?? undefined,
    badgeTemplateId: params.get("badgeTemplateId") ?? undefined,
    page: params.get("page") ?? undefined,
  });
}

export async function GET(request: Request) {
  try {
    const actor = requireAuthenticated(await getCurrentActor());
    const rateLimit = await consumeRateLimit({ policy: "export", key: actor.id });
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
    const rows = await listIssuanceExportRows(actor, filtersFromRequest(request));
    const body = Uint8Array.from(buildIssuanceCsv(rows));
    return new NextResponse(body.buffer, {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="issued-credentials.csv"',
      },
    });
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
}
