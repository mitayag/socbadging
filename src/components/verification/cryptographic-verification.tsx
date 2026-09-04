import type { PublicCredentialVerification } from "@/modules/verification/services/credential-verifier";

function copy(outcome: PublicCredentialVerification["outcome"], legacy: boolean): string {
  if (legacy) return "Legacy credential — cryptographic verification is unavailable";
  switch (outcome) {
    case "VERIFIED":
      return "Cryptographically verified";
    case "REVOKED":
      return "Cryptographic proof is valid, but this credential is revoked";
    case "EXPIRED":
      return "Cryptographic proof is valid, but this credential has expired";
    case "INVALID_PROOF":
      return "Cryptographic verification failed";
    default:
      return "Cryptographic verification is unavailable";
  }
}

export function CryptographicVerification({
  result,
  legacy = false,
}: {
  result: Omit<PublicCredentialVerification, "checkedAt"> & { checkedAt: string };
  legacy?: boolean;
}) {
  const state = legacy
    ? "expired"
    : result.outcome === "VERIFIED"
      ? "active"
      : result.outcome === "REVOKED" || result.outcome === "INVALID_PROOF"
        ? "revoked"
        : "expired";
  return (
    <section
      aria-labelledby="cryptographic-verification-heading"
      className={`panel cryptographic-verification ${state}`}
    >
      <h2 id="cryptographic-verification-heading">Cryptographic Verification</h2>
      <p aria-label="Cryptographic verification" className={`public-status ${state}`} role="status">
        {copy(result.outcome, legacy)}
      </p>
      {result.keyId ? (
        <p className="muted">Verification key: {result.keyId.split("/").at(-1)}</p>
      ) : null}
      <p className="muted">
        Checked {new Date(result.checkedAt).toLocaleString("en-US", { timeZone: "UTC" })} UTC
      </p>
    </section>
  );
}
