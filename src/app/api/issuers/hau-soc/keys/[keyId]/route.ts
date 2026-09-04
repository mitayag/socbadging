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
const keyIdPattern = /^[A-Za-z0-9_-]{1,191}$/;

function notFound(): Response {
  return new Response('{"error":"Not found"}', { status: 404, headers });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ keyId: string }> },
): Promise<Response> {
  try {
    const { keyId } = await params;
    if (!keyIdPattern.test(keyId)) return notFound();
    const controller = new URL("/api/issuers/hau-soc", getServerEnv().APP_URL).toString();
    const verificationMethodUrl = `${controller}/keys/${keyId}`;
    const key = await prisma.signingKey.findUnique({
      where: { verificationMethodUrl },
      select: {
        verificationMethodUrl: true,
        controllerUrl: true,
        publicMultikey: true,
        status: true,
        retiredAt: true,
        compromisedAt: true,
      },
    });
    if (!key || key.controllerUrl !== controller) return notFound();
    return new Response(
      JSON.stringify({
        "@context": [
          "https://w3id.org/security/multikey/v1",
          {
            "@protected": true,
            keyTrust: {
              "@id": "https://hau.edu.ph/ns/key-trust",
              "@context": {
                "@protected": true,
                state: "https://hau.edu.ph/ns/key-trust-state",
                retiredAt: {
                  "@id": "https://hau.edu.ph/ns/key-retired-at",
                  "@type": "http://www.w3.org/2001/XMLSchema#dateTime",
                },
                compromisedAt: {
                  "@id": "https://hau.edu.ph/ns/key-compromised-at",
                  "@type": "http://www.w3.org/2001/XMLSchema#dateTime",
                },
              },
            },
          },
        ],
        id: key.verificationMethodUrl,
        type: "Multikey",
        controller: key.controllerUrl,
        publicKeyMultibase: key.publicMultikey,
        keyTrust: {
          state: key.status,
          ...(key.retiredAt ? { retiredAt: key.retiredAt.toISOString() } : {}),
          ...(key.compromisedAt ? { compromisedAt: key.compromisedAt.toISOString() } : {}),
        },
      }),
      { headers },
    );
  } catch {
    return notFound();
  }
}
