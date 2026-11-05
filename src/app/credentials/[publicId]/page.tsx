import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PublicCredentialCard } from "@/components/verification/public-credential";
import { getPublicCredential } from "@/modules/verification/services/public-credential-service";
import { PublicCredentialIdSchema } from "@/modules/verification/types";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ publicId: string }>;
}): Promise<Metadata> {
  const { publicId } = await params;
  const parsed = PublicCredentialIdSchema.safeParse(publicId);
  if (!parsed.success) return { title: "Credential not found" };
  try {
    const credential = await getPublicCredential(parsed.data);
    const title = `${credential.achievement.name} — ${credential.issuer.name}`;
    const description =
      credential.status === "REVOKED"
        ? `Revoked credential issued by ${credential.issuer.name}.`
        : credential.status === "EXPIRED"
          ? `Expired credential issued by ${credential.issuer.name}.`
          : `Verify this credential issued by ${credential.issuer.name}.`;
    return {
      title,
      description,
      alternates: { canonical: credential.credential.id },
      openGraph: {
        title,
        description,
        type: "website",
        url: credential.credential.id,
        images: [
          {
            url: credential.achievement.image.id,
            alt: `${credential.achievement.name} badge artwork`,
          },
        ],
      },
      twitter: {
        card: "summary_large_image",
        title,
        description,
        images: [credential.achievement.image.id],
      },
    };
  } catch {
    return { title: "Credential not found" };
  }
}

export default async function PublicCredentialPage({
  params,
}: {
  params: Promise<{ publicId: string }>;
}) {
  const { publicId } = await params;
  const parsedPublicId = PublicCredentialIdSchema.safeParse(publicId);
  if (!parsedPublicId.success) notFound();

  let credential: Awaited<ReturnType<typeof getPublicCredential>>;
  try {
    credential = await getPublicCredential(parsedPublicId.data);
  } catch {
    notFound();
  }
  return <PublicCredentialCard credential={credential} />;
}
