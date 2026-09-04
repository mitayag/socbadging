import { isIP } from "node:net";

import { getServerEnv } from "@/config/env";
import { consumeRateLimit } from "@/platform/security/shared-rate-limit";

export function getClientRateLimitKey(
  request: Request,
  { trustProxy }: { trustProxy: boolean },
): string {
  if (trustProxy) {
    const candidate = request.headers.get("x-forwarded-for")?.split(",", 1)[0]?.trim() ?? "";
    if (isIP(candidate)) return candidate;
  }
  // Compose exposes the app port directly, so no caller-supplied address header is a
  // trustworthy client identity. Keep one conservative anonymous bucket per credential.
  return "anonymous";
}

export async function consumePublicCredentialRateLimit(request: Request, publicId: string) {
  const client = getClientRateLimitKey(request, { trustProxy: getServerEnv().TRUST_PROXY });
  return consumeRateLimit({ policy: "public-json", key: `${client}\u0000${publicId}` });
}

export async function consumePublicCredentialPageRateLimit(request: Request, publicId: string) {
  const client = getClientRateLimitKey(request, { trustProxy: getServerEnv().TRUST_PROXY });
  return consumeRateLimit({ policy: "public-html", key: `${client}\u0000${publicId}` });
}
