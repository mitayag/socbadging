import { NextResponse } from "next/server";
import { getCurrentActor } from "@/modules/identity/services/current-actor";
import { requireRole } from "@/modules/identity/policies/authorization";
import { getImportPreview } from "@/modules/rosters/services/import-service";
import { quoteCsv } from "@/modules/rosters/services/roster-validation";
export async function GET(_r: Request, { params }: { params: Promise<{ previewId: string }> }) {
  try {
    const actor = requireRole(await getCurrentActor(), "FACULTY");
    const preview = await getImportPreview(actor, (await params).previewId);
    const rows = preview.rows
      .filter((r) => r.errors.length)
      .map((r) => [
        String(r.rowNumber),
        r.studentNumber,
        r.firstName,
        r.lastName,
        r.email,
        r.errors.join("; "),
      ]);
    const csv = [["Row", "Student Number", "First Name", "Last Name", "Email", "Errors"], ...rows]
      .map((r) => r.map(quoteCsv).join(","))
      .join("\r\n");
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": "attachment; filename=roster-import-errors.csv",
      },
    });
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
}
