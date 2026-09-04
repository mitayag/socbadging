import { getServerEnv } from "@/config/env";
import { prisma } from "@/platform/db/prisma";

export const dynamic = "force-dynamic";

const headers = {
  "Cache-Control": "no-store",
  "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
  "Content-Type": "application/ld+json; charset=utf-8",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
};

export async function GET(): Promise<Response> {
  const id = new URL("/api/issuers/hau-soc", getServerEnv().APP_URL).toString();
  try {
    const keys = await prisma.signingKey.findMany({
      where: { controllerUrl: id },
      select: { verificationMethodUrl: true },
      orderBy: [{ activatedAt: "desc" }, { id: "asc" }],
    });
    return new Response(
      JSON.stringify({
        "@context": [
          "https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json",
          {
            "@protected": true,
            verificationMethod: {
              "@id": "https://w3id.org/security#verificationMethod",
              "@type": "@id",
              "@container": "@set",
            },
          },
        ],
        id,
        type: ["Profile"],
        name: "Holy Angel University — School of Computing",
        verificationMethod: keys.map((key) => key.verificationMethodUrl),
      }),
      { headers },
    );
  } catch {
    return new Response('{"error":"Issuer unavailable"}', { status: 503, headers });
  }
}
