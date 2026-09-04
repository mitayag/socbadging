import { serializePublicCredentialJson } from "@/modules/verification/services/public-credential-json";
import { getPublicCredential } from "@/modules/verification/services/public-credential-service";
import { PublicCredentialIdSchema } from "@/modules/verification/types";
import { consumePublicCredentialRateLimit } from "@/platform/security/public-rate-limit";

const publicJsonHeaders = {
  "Cache-Control": "no-store",
  "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
  "Content-Type": "application/ld+json; charset=utf-8",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
};

function notFoundResponse(): Response {
  return new Response('{"error":"Not found"}', { status: 404, headers: publicJsonHeaders });
}

function rateLimitedResponse(retryAfterSeconds: number): Response {
  const boundedRetryAfter = Math.min(60, Math.max(1, Math.ceil(retryAfterSeconds)));
  return new Response('{"error":"Too many requests"}', {
    status: 429,
    headers: { ...publicJsonHeaders, "Retry-After": String(boundedRetryAfter) },
  });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ publicId: string }> },
): Promise<Response> {
  try {
    const publicId = PublicCredentialIdSchema.safeParse((await params).publicId);
    if (!publicId.success) return notFoundResponse();

    const rateLimit = await consumePublicCredentialRateLimit(request, publicId.data);
    if (!rateLimit.allowed) return rateLimitedResponse(rateLimit.retryAfterSeconds);

    const credential = await getPublicCredential(publicId.data);
    return new Response(serializePublicCredentialJson(credential), {
      headers: {
        ...publicJsonHeaders,
        "Content-Disposition": `attachment; filename="credential-${publicId.data}.json"`,
      },
    });
  } catch {
    return notFoundResponse();
  }
}
