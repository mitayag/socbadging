import { notFound, redirect } from "next/navigation";

import { AppShell } from "@/components/layout/app-shell";
import { SystemSettingsForm } from "@/components/settings/system-settings-form";
import { SigningKeyStatus } from "@/components/settings/signing-key-status";
import { signingKeyAction } from "./actions";
import { AuthorizationError } from "@/modules/identity/policies/authorization";
import { getCurrentActor } from "@/modules/identity/services/current-actor";
import { getAdminSystemSettings } from "@/modules/settings/services/system-settings-service";
import { prisma } from "@/platform/db/prisma";
import { getSignerHealth } from "@/modules/signing/signer-client";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const actor = await getCurrentActor();
  if (!actor) redirect("/login");

  let settings: Awaited<ReturnType<typeof getAdminSystemSettings>>;
  try {
    settings = await getAdminSystemSettings(actor);
  } catch (error) {
    if (error instanceof AuthorizationError) notFound();
    throw error;
  }
  const [keys, signer] = await Promise.all([
    prisma.signingKey.findMany({
      select: {
        id: true,
        fingerprint: true,
        cryptosuite: true,
        verificationMethodUrl: true,
        status: true,
      },
      orderBy: [{ activatedAt: "desc" }, { id: "asc" }],
    }),
    getSignerHealth(),
  ]);

  return (
    <AppShell actor={actor} title="Settings">
      <section className="workspace-page narrow">
        <div className="page-heading">
          <p className="eyebrow">Administrator</p>
          <h1>Issuer Settings</h1>
          <p>Update public issuer presentation without changing historical issued credentials.</p>
        </div>
        <SystemSettingsForm settings={settings} />
        <SigningKeyStatus
          keys={keys}
          signerHealth={
            signer &&
            keys.some(
              (key) =>
                key.status === "ACTIVE" &&
                key.cryptosuite === signer.cryptosuite &&
                key.verificationMethodUrl === signer.keyId,
            )
              ? "healthy"
              : "unavailable"
          }
          action={signingKeyAction}
        />
      </section>
    </AppShell>
  );
}
