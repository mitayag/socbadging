import { NextResponse } from "next/server";
import { requireRole } from "@/modules/identity/policies/authorization";
import { getCurrentActor } from "@/modules/identity/services/current-actor";
import { getClassWorkspace } from "@/modules/rosters/services/roster-service";
import { buildRosterCsvTemplate } from "@/modules/rosters/services/roster-template";

export async function GET(_request: Request, { params }: { params: Promise<{ classId: string }> }) {
  try {
    const actor = requireRole(await getCurrentActor(), "FACULTY");
    const { classId } = await params;
    await getClassWorkspace(actor, classId);

    return new NextResponse(new Uint8Array(buildRosterCsvTemplate()).buffer, {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="roster-import-template.csv"',
      },
    });
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
}
