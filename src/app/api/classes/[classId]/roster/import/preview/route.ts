import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentActor } from "@/modules/identity/services/current-actor";
import { requireRole } from "@/modules/identity/policies/authorization";
import { createImportPreview } from "@/modules/rosters/services/import-service";
import { getClassWorkspace } from "@/modules/rosters/services/roster-service";
import { consumeRateLimit } from "@/platform/security/shared-rate-limit";
import { hasTrustedOrigin } from "@/platform/security/origin";
const body = z.object({
  filename: z.string().max(255),
  rows: z.array(z.array(z.string())).max(5000),
  mapping: z.object({
    studentNumber: z.number().int().min(0),
    firstName: z.number().int().min(0),
    lastName: z.number().int().min(0),
    email: z.number().int().min(0),
  }),
});
export async function POST(request: Request, { params }: { params: Promise<{ classId: string }> }) {
  try {
    if (request.headers.has("origin") && !hasTrustedOrigin(request)) {
      return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
    }
    const actor = requireRole(await getCurrentActor(), "FACULTY");
    const classId = (await params).classId;
    await getClassWorkspace(actor, classId);
    const rateLimit = await consumeRateLimit({
      policy: "import",
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
    const input = body.parse(await request.json());
    return NextResponse.json(
      await createImportPreview(actor, classId, input.filename, input.rows, input.mapping),
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to preview roster" },
      { status: 400 },
    );
  }
}
