import { NextResponse } from "next/server";
import { z } from "zod";

import { requireRole } from "@/modules/identity/policies/authorization";
import { getCurrentActor } from "@/modules/identity/services/current-actor";
import { authorizeBatchClass } from "@/modules/issuance/services/batch-preview-service";
import { buildBatchXlsxTemplate } from "@/modules/issuance/services/batch-template";

const identifier = z
  .string()
  .trim()
  .min(1)
  .max(191)
  .regex(/^[A-Za-z0-9_-]+$/);
const privateHeaders = { "Cache-Control": "private, no-store" };

export async function GET(_request: Request, context: { params: Promise<{ classId: string }> }) {
  try {
    const actor = requireRole(await getCurrentActor(), "FACULTY");
    const classId = identifier.parse((await context.params).classId);
    await authorizeBatchClass(actor, classId);
    return new NextResponse(new Uint8Array(await buildBatchXlsxTemplate()).buffer, {
      headers: {
        ...privateHeaders,
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": 'attachment; filename="batch-issuance-template.xlsx"',
      },
    });
  } catch (error) {
    const malformed = error instanceof z.ZodError;
    const forbidden = error instanceof Error && error.name === "AuthorizationError";
    const notFound = error instanceof Error && error.message === "Batch not found";
    return NextResponse.json(
      {
        error: malformed
          ? "Invalid class"
          : forbidden
            ? "Forbidden"
            : notFound
              ? "Not found"
              : "Unable to create template",
      },
      { status: malformed ? 400 : forbidden ? 403 : notFound ? 404 : 500, headers: privateHeaders },
    );
  }
}
