import "server-only";

import { cookies } from "next/headers";
import { prisma } from "@/platform/db/prisma";
import type { Actor } from "../types";
import { hashSessionToken, SESSION_COOKIE } from "./session";

export async function getCurrentActor(): Promise<Actor | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await prisma.session.findUnique({
    where: { sessionToken: hashSessionToken(token) },
    include: { user: { select: { id: true, name: true, email: true, role: true, status: true } } },
  });
  if (!session || session.expires <= new Date()) return null;
  const user = session.user;
  if (!user || user.status !== "ACTIVE") return null;
  return { id: user.id, name: user.name, email: user.email, role: user.role };
}
