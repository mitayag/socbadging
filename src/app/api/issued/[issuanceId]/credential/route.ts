import { NextResponse } from "next/server";
import { z } from "zod";

import {
  AuthorizationError,
  requireAuthenticated,
} from "@/modules/identity/policies/authorization";
import { getCurrentActor } from "@/modules/identity/services/current-actor";
import {
  getIssuanceDetail,
  IssuanceNotFoundError,
} from "@/modules/issuance/services/issuance-query-service";

const identifierSchema = z
  .string()
  .trim()
  .min(1)
  .max(191)
  .regex(/^[A-Za-z0-9_-]+$/);
const publicIdSchema = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ issuanceId: string }> },
) {
  try {
    const actor = requireAuthenticated(await getCurrentActor());
    const issuanceId = identifierSchema.parse((await params).issuanceId);
    const detail = await getIssuanceDetail(actor, issuanceId);
    const publicId = publicIdSchema.parse(detail.publicId);
    return new NextResponse(JSON.stringify(detail.credential), {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Type": "application/ld+json",
        "Content-Disposition": `attachment; filename="credential-${publicId}.json"`,
      },
    });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (error instanceof IssuanceNotFoundError) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
