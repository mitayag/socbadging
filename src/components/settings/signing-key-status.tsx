"use client";

import { useState } from "react";

export type PublicSigningKeyStatus = {
  id: string;
  fingerprint: string;
  cryptosuite: string;
  status: "ACTIVE" | "RETIRED" | "COMPROMISED";
};

export function SigningKeyStatus({
  keys,
  signerHealth,
  action,
}: {
  keys: PublicSigningKeyStatus[];
  signerHealth: "healthy" | "unavailable";
  action: (formData: FormData) => Promise<{ ok: boolean; message?: string }>;
}) {
  const [message, setMessage] = useState<string | null>(null);
  async function formAction(formData: FormData) {
    try {
      const result = await action(formData);
      setMessage(
        result.ok
          ? "Signing key action completed."
          : (result.message ?? "Signing key action failed."),
      );
    } catch {
      setMessage("Signing key action failed.");
    }
  }
  return (
    <section aria-labelledby="signing-key-heading" className="panel">
      <h2 id="signing-key-heading">Credential signing</h2>
      <p aria-live="polite">Signer health: {signerHealth.replaceAll("-", " ")}</p>
      {keys.length === 0 ? <p>No public signing key has been registered.</p> : null}
      <ul className="credential-facts">
        {keys.map((key) => (
          <li key={key.id}>
            <strong>{key.status}</strong> · <span>{key.fingerprint}</span> ·{" "}
            <span>{key.cryptosuite}</span>
            {key.status !== "COMPROMISED" ? (
              <form action={formAction}>
                <input
                  name="intent"
                  type="hidden"
                  value={key.status === "ACTIVE" ? "retire" : "activate"}
                />
                <input name="keyId" type="hidden" value={key.id} />
                <label>
                  <input name="confirmation" required type="checkbox" value="confirm" /> Confirm
                </label>
                <button className="text-button" type="submit">
                  {key.status === "ACTIVE" ? "Retire" : "Activate"}
                </button>
              </form>
            ) : null}
            {key.status !== "COMPROMISED" ? (
              <form action={formAction}>
                <input name="intent" type="hidden" value="compromise" />
                <input name="keyId" type="hidden" value={key.id} />
                <label>
                  <input name="confirmation" required type="checkbox" value="confirm" /> Confirm
                </label>
                <button className="text-button" type="submit">
                  Mark compromised
                </button>
              </form>
            ) : null}
          </li>
        ))}
      </ul>
      {message ? (
        <p aria-live="polite" role="status">
          {message}
        </p>
      ) : null}
      <form action={formAction}>
        <input name="intent" type="hidden" value="register" />
        <label>
          Verification method URL
          <input name="verificationMethodUrl" required />
        </label>
        <label>
          Issuer controller URL
          <input name="controllerUrl" required />
        </label>
        <input name="algorithm" type="hidden" value="Ed25519" />
        <input name="cryptosuite" type="hidden" value="eddsa-rdfc-2022" />
        <label>
          Public Multikey
          <input name="publicMultikey" required />
        </label>
        <label>
          Fingerprint
          <input name="fingerprint" required />
        </label>
        <label>
          <input name="confirmation" required type="checkbox" value="confirm" /> Confirm
          registration
        </label>
        <button type="submit">Register public key</button>
      </form>
      <p className="credential-note">
        Only public verification metadata is shown here. Private signing keys are never uploaded or
        displayed.
      </p>
    </section>
  );
}
