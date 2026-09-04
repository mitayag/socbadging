import { NextResponse } from "next/server";
import { readStoredFile } from "@/platform/storage/local-storage";
import { getServerEnv } from "@/config/env";
import { getClientRateLimitKey } from "@/platform/security/public-rate-limit";
import { consumeRateLimit } from "@/platform/security/shared-rate-limit";
export async function GET(request: Request, { params }: { params: Promise<{ key: string[] }> }) {
  try {
    const key = (await params).key.join("/");
    const client = getClientRateLimitKey(request, { trustProxy: getServerEnv().TRUST_PROXY });
    const rateLimit = await consumeRateLimit({ policy: "media", key: `${client}\u0000${key}` });
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
    const data = await readStoredFile(key);
    const ext = key.split(".").pop();
    const type = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
    return new NextResponse(new Uint8Array(data), {
      headers: {
        "Content-Type": type,
        "Cache-Control": "public, max-age=3600",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
