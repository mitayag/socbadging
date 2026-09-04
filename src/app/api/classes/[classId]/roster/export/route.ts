import { NextResponse } from "next/server";
import { getCurrentActor } from "@/modules/identity/services/current-actor";
import { requireAuthenticated } from "@/modules/identity/policies/authorization";
import { getClassWorkspace } from "@/modules/rosters/services/roster-service";
import { prisma } from "@/platform/db/prisma";
import { quoteCsv } from "@/modules/rosters/services/roster-validation";
import { consumeRateLimit } from "@/platform/security/shared-rate-limit";
export async function GET(_r: Request, { params }: { params: Promise<{ classId: string }> }) {
  try {
    const actor = requireAuthenticated(await getCurrentActor());
    const classId = (await params).classId;
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
    const rows = await prisma.classStudent.findMany({
      where: { classId },
      include: { student: true },
      orderBy: { student: { lastName: "asc" } },
    });
    const csv = [
      ["Student Number", "First Name", "Last Name", "Email", "Status"],
      ...rows.map((r) => [
        r.student.studentNumber,
        r.student.firstName,
        r.student.lastName,
        r.student.email,
        r.enrollmentStatus,
      ]),
    ]
      .map((r) => r.map(quoteCsv).join(","))
      .join("\r\n");
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="roster-${classId}.csv"`,
      },
    });
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
}
