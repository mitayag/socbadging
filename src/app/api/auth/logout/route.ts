import { NextResponse } from "next/server";
import { SESSION_COOKIE, hashSessionToken } from "@/modules/identity/services/session";
import { prisma } from "@/platform/db/prisma";
import { hasTrustedOrigin } from "@/platform/security/origin";
import { getServerEnv } from "@/config/env";

export async function POST(request: Request) {
  if (!hasTrustedOrigin(request))
    return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  const token = request.headers
    .get("cookie")
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${SESSION_COOKIE}=`))
    ?.slice(SESSION_COOKIE.length + 1);
  if (token)
    await prisma.session.deleteMany({
      where: { sessionToken: hashSessionToken(decodeURIComponent(token)) },
    });
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    secure: new URL(getServerEnv().APP_URL).protocol === "https:",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return response;
}
