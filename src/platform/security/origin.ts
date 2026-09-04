import { getServerEnv } from "@/config/env";

export function hasTrustedOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  return origin === new URL(getServerEnv().APP_URL).origin;
}
