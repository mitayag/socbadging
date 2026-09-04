import { NextResponse } from "next/server";

import { getHealthStatus } from "@/platform/health/health";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const health = await getHealthStatus();
  return NextResponse.json(health, {
    status: health.readiness === "ready" ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}
