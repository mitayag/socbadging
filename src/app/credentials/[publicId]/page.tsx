import { notFound } from "next/navigation";

import { PublicCredentialCard } from "@/components/verification/public-credential";
import { getPublicCredential } from "@/modules/verification/services/public-credential-service";
import { PublicCredentialIdSchema } from "@/modules/verification/types";

export const dynamic = "force-dynamic";

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
