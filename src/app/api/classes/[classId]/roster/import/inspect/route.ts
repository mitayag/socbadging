import { NextResponse } from "next/server";
import { getCurrentActor } from "@/modules/identity/services/current-actor";
import { requireRole } from "@/modules/identity/policies/authorization";
import { parseRosterFile } from "@/modules/rosters/services/import-parser";
import { getClassWorkspace } from "@/modules/rosters/services/roster-service";
import { consumeRateLimit } from "@/platform/security/shared-rate-limit";
import { hasTrustedOrigin } from "@/platform/security/origin";
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
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new Error("Roster file is required");
    return NextResponse.json(await parseRosterFile(file));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to inspect roster" },
      { status: 400 },
    );
  }
}
