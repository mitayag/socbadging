import { NextResponse } from "next/server";
import { requireRole } from "@/modules/identity/policies/authorization";
import { getCurrentActor } from "@/modules/identity/services/current-actor";
import { getClassWorkspace } from "@/modules/rosters/services/roster-service";
import { buildRosterXlsxTemplate } from "@/modules/rosters/services/roster-template";

export async function GET(_request: Request, { params }: { params: Promise<{ classId: string }> }) {
  try {
    const actor = requireRole(await getCurrentActor(), "FACULTY");
    const { classId } = await params;
    await getClassWorkspace(actor, classId);

    return new NextResponse(new Uint8Array(await buildRosterXlsxTemplate()).buffer, {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": 'attachment; filename="roster-import-template.xlsx"',
      },
    });
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
}
