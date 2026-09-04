import { NextResponse, type NextRequest } from "next/server";

import { PublicCredentialIdSchema } from "@/modules/verification/types";
import { consumePublicCredentialPageRateLimit } from "@/platform/security/public-rate-limit";

function rateLimitResponse(retryAfterSeconds: number): NextResponse {
  return new NextResponse(
    '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Please try again</title></head><body><main><h1>Please try again later</h1><p>This verification request is temporarily unavailable.</p></main></body></html>',
    {
      status: 429,
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Type": "text/html; charset=utf-8",
        "Referrer-Policy": "no-referrer",
        "Retry-After": String(retryAfterSeconds),
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const publicId = request.nextUrl.pathname.split("/").at(-1) ?? "";
  const parsedPublicId = PublicCredentialIdSchema.safeParse(publicId);
  if (!parsedPublicId.success) return NextResponse.next();

  const rateLimit = await consumePublicCredentialPageRateLimit(request, parsedPublicId.data);
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit.retryAfterSeconds);
  return NextResponse.next();
}

export const config = { matcher: "/credentials/:path*" };
