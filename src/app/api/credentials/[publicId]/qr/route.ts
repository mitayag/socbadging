import { NextResponse } from "next/server";
import QRCode from "qrcode";

import { getServerEnv } from "@/config/env";
import { PublicCredentialIdSchema } from "@/modules/verification/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ publicId: string }> }) {
  const { publicId } = await context.params;
  const parsed = PublicCredentialIdSchema.safeParse(publicId);
  if (!parsed.success) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const url = new URL(`/credentials/${parsed.data}`, getServerEnv().APP_URL).toString();
  const png = await QRCode.toBuffer(url, {
    type: "png",
    width: 256,
    margin: 1,
    errorCorrectionLevel: "M",
  });
  return new NextResponse(new Uint8Array(png), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=3600",
      "Content-Disposition": `inline; filename="credential-${parsed.data}-qr.png"`,
    },
  });
}
