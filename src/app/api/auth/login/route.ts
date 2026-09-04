import { NextResponse } from "next/server";
import { z } from "zod";

import { authenticateWithPassword } from "@/modules/identity/services/authenticate";
import { prismaAuthenticationRepository } from "@/modules/identity/repositories/prisma-authentication-repository";
import {
  createSessionToken,
  hashSessionToken,
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
} from "@/modules/identity/services/session";
import { prisma } from "@/platform/db/prisma";
import { hasTrustedOrigin } from "@/platform/security/origin";
import { getServerEnv } from "@/config/env";
import { consumeRateLimit } from "@/platform/security/shared-rate-limit";
import { getClientRateLimitKey } from "@/platform/security/public-rate-limit";

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  password: z.string().min(1).max(1024),
});

export async function POST(request: Request) {
  if (!hasTrustedOrigin(request))
    return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  const parsed = loginSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid credentials" }, { status: 400 });
  const environment = getServerEnv();
  const clientKey = getClientRateLimitKey(request, { trustProxy: environment.TRUST_PROXY });
  const rateLimit = await consumeRateLimit({
    policy: "login",
    key: `${clientKey}\u0000${parsed.data.email.trim().toLowerCase()}`,
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
  const actor = await authenticateWithPassword(
    prismaAuthenticationRepository,
    parsed.data.email,
    parsed.data.password,
  );
  if (!actor) return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });

  const token = createSessionToken();
  const expires = new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000);
  await prisma.session.create({
    data: { sessionToken: hashSessionToken(token), userId: actor.id, expires },
  });
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: new URL(environment.APP_URL).protocol === "https:",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
  return response;
}
