"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";

import { revokeCredentialAction } from "@/app/issued/[issuanceId]/revocation-actions";

function SubmitButton({ ready }: { ready: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button className="danger-button" disabled={!ready || pending} type="submit">
      {pending ? "Revoking Credential…" : "Revoke Credential"}
    </button>
  );
}

function isRedirectError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    typeof error.digest === "string" &&
    error.digest.startsWith("NEXT_REDIRECT")
  );
}

export function RevokeCredentialForm({ issuanceId }: { issuanceId: string }) {
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const ready = reason.trim().length > 0 && confirmed;

  async function submitRevocation(formData: FormData) {
    setActionError(null);
    try {
      await revokeCredentialAction(formData);
    } catch (error) {
      if (isRedirectError(error)) throw error;
      setActionError("This credential could not be revoked. Please try again.");
    }
  }

  return (
    <section aria-labelledby="revoke-heading" className="revoke-credential-panel">
      <h2 id="revoke-heading">Revoke Credential</h2>
      <p>This preserves the credential record and publicly shows its revoked status.</p>
      <form action={submitRevocation} className="revoke-credential-form">
        <input name="issuanceId" type="hidden" value={issuanceId} />
        <label className="field" htmlFor="revocation-reason">
          <span>Revocation Reason</span>
          <textarea
            id="revocation-reason"
            name="reason"
            onChange={(event) => setReason(event.target.value)}
            required
            rows={4}
          />
        </label>
        <label className="confirmation-control">
          <input
            checked={confirmed}
            onChange={(event) => setConfirmed(event.target.checked)}
            type="checkbox"
          />
          <span>I understand this revocation cannot be undone</span>
        </label>
        {!ready ? (
          <p aria-live="polite" className="form-message" role="status">
            Enter a reason and confirm revocation to continue.
          </p>
        ) : null}
        {actionError ? (
          <p aria-live="assertive" className="form-error" role="alert">
            {actionError}
          </p>
        ) : null}
        <SubmitButton ready={ready} />
      </form>
    </section>
  );
}
