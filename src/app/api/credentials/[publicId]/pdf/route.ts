import { NextResponse } from "next/server";

import { AchievementSnapshotSchema } from "@/modules/issuance/services/snapshot-schemas";
import { renderCredentialPdf } from "@/modules/verification/services/credential-pdf";
import { getPublicCredential } from "@/modules/verification/services/public-credential-service";
import { PublicCredentialIdSchema } from "@/modules/verification/types";
import { prisma } from "@/platform/db/prisma";
import { consumePublicCredentialAssetRateLimit } from "@/platform/security/public-rate-limit";
import { validateBadgeImage } from "@/platform/storage/image-validation";
import { readStoredFile } from "@/platform/storage/local-storage";

const headers = {
  "Cache-Control": "private, no-store",
  "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
};

export async function GET(request: Request, { params }: { params: Promise<{ publicId: string }> }) {
  try {
    const publicId = PublicCredentialIdSchema.safeParse((await params).publicId);
    if (!publicId.success) return new NextResponse("Not found", { status: 404, headers });
    const rateLimit = await consumePublicCredentialAssetRateLimit(request, publicId.data);
    if (!rateLimit.allowed) {
      return new NextResponse("Too many requests", {
        status: 429,
        headers: { ...headers, "Retry-After": String(rateLimit.retryAfterSeconds) },
      });
    }
    const credential = await getPublicCredential(publicId.data);
    let badgeImage: { bytes: Buffer; type: "png" | "jpeg" } | undefined;
    try {
      const record = await prisma.badgeIssuance.findUnique({
        where: { publicId: publicId.data },
        select: { achievementSnapshotJson: true },
      });
      const achievement = AchievementSnapshotSchema.safeParse(record?.achievementSnapshotJson);
      if (achievement.success) {
        const bytes = await readStoredFile(achievement.data.imagePath);
        const image = await validateBadgeImage(bytes, achievement.data.imagePath);
        if (image.format === "png" || image.format === "jpeg") {
          badgeImage = { bytes, type: image.format };
        }
      }
    } catch {
      badgeImage = undefined;
    }
    const pdf = await renderCredentialPdf(credential, badgeImage);
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        ...headers,
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="credential-${publicId.data}.pdf"`,
      },
    });
  } catch {
    return new NextResponse("Not found", { status: 404, headers });
  }
}
