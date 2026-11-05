import { NextResponse, type NextRequest } from "next/server";

import { hashSessionToken, SESSION_COOKIE } from "@/modules/identity/services/session";
import { PublicCredentialIdSchema } from "@/modules/verification/types";
import { prisma } from "@/platform/db/prisma";
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

function notFoundResponse(): NextResponse {
  return new NextResponse(
    '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Not found</title></head><body><main><h1>This page could not be found.</h1></main></body></html>',
    {
      status: 404,
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Type": "text/html; charset=utf-8",
        "Referrer-Policy": "no-referrer",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}

function loginRedirect(request: NextRequest): NextResponse {
  return NextResponse.redirect(new URL("/login", request.url));
}

type StudentSessionUser = {
  role: "ADMIN" | "FACULTY" | "STUDENT";
  status: "ACTIVE" | "INACTIVE" | "SUSPENDED" | "DELETED";
  deletedAt: Date | null;
  mustChangePassword: boolean;
  studentAccount: { studentId: string } | null;
};

async function loadStudentSession(request: NextRequest): Promise<StudentSessionUser | null> {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await prisma.session.findUnique({
    where: { sessionToken: hashSessionToken(token) },
    select: {
      expires: true,
      user: {
        select: {
          role: true,
          status: true,
          deletedAt: true,
          mustChangePassword: true,
          studentAccount: { select: { studentId: true } },
        },
      },
    },
  });
  if (!session || session.expires <= new Date()) return null;
  return session.user;
}

function isPublicStudentPath(pathname: string): boolean {
  return (
    pathname.startsWith("/student/activate/") ||
    pathname === "/student/recover" ||
    pathname.startsWith("/student/recover/")
  );
}

async function guardStudentPortal(request: NextRequest): Promise<NextResponse> {
  const pathname = request.nextUrl.pathname;
  if (isPublicStudentPath(pathname)) return NextResponse.next();

  let user: StudentSessionUser | null;
  try {
    user = await loadStudentSession(request);
  } catch {
    return notFoundResponse();
  }
  if (!user || user.status !== "ACTIVE" || user.deletedAt !== null) {
    return loginRedirect(request);
  }
  if (user.role !== "STUDENT") return NextResponse.next();
  if (!user.studentAccount) return notFoundResponse();

  if (user.mustChangePassword && pathname !== "/student/change-password") {
    return NextResponse.redirect(new URL("/student/change-password", request.url));
  }

  if (pathname.startsWith("/student/badges/")) {
    const issuanceId = pathname.slice("/student/badges/".length);
    if (!/^[A-Za-z0-9_-]{1,191}$/.test(issuanceId)) return notFoundResponse();
    const issuance = await prisma.badgeIssuance.findFirst({
      where: { id: issuanceId, studentId: user.studentAccount.studentId },
      select: { id: true },
    });
    if (!issuance) return notFoundResponse();
  }

  return NextResponse.next();
}

export async function proxy(request: NextRequest): Promise<NextResponse> {
  if (request.nextUrl.pathname.startsWith("/student")) {
    return guardStudentPortal(request);
  }

  const publicId = request.nextUrl.pathname.split("/").at(-1) ?? "";
  const parsedPublicId = PublicCredentialIdSchema.safeParse(publicId);
  if (!parsedPublicId.success) return NextResponse.next();

  const rateLimit = await consumePublicCredentialPageRateLimit(request, parsedPublicId.data);
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit.retryAfterSeconds);
  return NextResponse.next();
}

export const config = { matcher: ["/credentials/:path*", "/student/:path*"] };
