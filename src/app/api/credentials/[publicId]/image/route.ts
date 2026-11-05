import { NextResponse } from "next/server";

import { AchievementSnapshotSchema } from "@/modules/issuance/services/snapshot-schemas";
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
    await getPublicCredential(publicId.data);
    const record = await prisma.badgeIssuance.findUnique({
      where: { publicId: publicId.data },
      select: { achievementSnapshotJson: true },
    });
    const achievement = AchievementSnapshotSchema.safeParse(record?.achievementSnapshotJson);
    if (!achievement.success) return new NextResponse("Not found", { status: 404, headers });
    const bytes = await readStoredFile(achievement.data.imagePath);
    const image = await validateBadgeImage(bytes, achievement.data.imagePath);
    const contentType =
      image.format === "png" ? "image/png" : image.format === "webp" ? "image/webp" : "image/jpeg";
    const download = new URL(request.url).searchParams.get("download") === "1";
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        ...headers,
        "Content-Type": contentType,
        ...(download
          ? {
              "Content-Disposition": `attachment; filename="badge-${publicId.data}.${image.extension}"`,
            }
          : {}),
      },
    });
  } catch {
    return new NextResponse("Not found", { status: 404, headers });
  }
}
